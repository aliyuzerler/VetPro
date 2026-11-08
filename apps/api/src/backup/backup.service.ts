import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { LocalPrivateStorageAdapter } from '../files/private-storage';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  BACKUP_ALGORITHM,
  createBundle,
  decryptBuffer,
  deriveKey,
  encryptBuffer,
  openBundle,
  sha256Hex,
  verifyBundleChecksums,
  type BackupManifest,
} from './backup.bundle';

/**
 * Yedekleme servisi — Faz 14. pg_dump yokluğunda (gömülü PostgreSQL yalnız
 * sunucu ikilisi taşır) mantıksal yedek: information_schema'dan kullanıcı
 * tabloları + FK bağımlılık grafiği → topolojik sıra → tablo başına JSONL.
 * Restore: arşiv sha256 → decrypt (GCM) → checksum'lar → migrate zaten
 * uygulandıktan sonra truncate + sıralı replay + object dosyaları geri yazım
 * + satır sayısı mutabakatı. Kabul kriterleri: manifest/checksum üretimi,
 * staging restore doğrulaması, yetkisiz erişim engeli (backup.manage izni +
 * restore çift kapı: env gate).
 */

interface TableNode {
  name: string;
  dependencies: Set<string>;
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  /** Tablo/dosya adı güvenlik filtresi — yalnız basit tanımlayıcılar kabul edilir. */
  private static readonly IDENT = /^[a-z_][a-z0-9_]*$/;
  /** Object dosya adları UUID.bin biçiminde — kısa çizgiye izin verilir. */
  private static readonly FILE_IDENT = /^[a-z0-9_-]+(\.[a-z0-9]+)?$/i;
  private static readonly EXCLUDED_TABLES = new Set(['_prisma_migrations']);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LocalPrivateStorageAdapter) private readonly storage: LocalPrivateStorageAdapter,
  ) {}

  onModuleInit(): void {
    mkdir(this.backupDir(), { recursive: true }).catch((error: unknown) => {
      this.logger.error(`Yedek dizini oluşturulamadı: ${String(error)}`);
    });
  }

  private key(): Buffer {
    const secret = process.env.VETCORE_BACKUP_KEY ?? 'vetcore-dev-backup-key';
    return deriveKey(secret);
  }

  /**
   * Yedek dizini — lazy: env (VETCORE_BACKUP_DIR) her okunuşta güncel okunur;
   * test süreçleri modül yüklemesinden sonra dizinOverride edebilir.
   */
  private backupDir(): string {
    return process.env.VETCORE_BACKUP_DIR ?? join(process.cwd(), '.backups');
  }

  /** Kullanıcı tabloları + FK bağımlılık grafiği; döngüde kalanlar kendine bağlı. */
  private async tableGraph(): Promise<TableNode[]> {
    const tables = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const names = tables
      .map((t) => t.table_name)
      .filter((name) => BackupService.IDENT.test(name) && !BackupService.EXCLUDED_TABLES.has(name));
    const edges = await this.prisma.$queryRaw<Array<{ table_name: string; foreign_table: string }>>`
      SELECT tc.table_name, ccu.table_name AS foreign_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`;
    const graph = new Map<string, TableNode>(
      names.map((name) => [name, { name, dependencies: new Set<string>() }]),
    );
    for (const edge of edges) {
      if (!graph.has(edge.table_name) || !graph.has(edge.foreign_table)) continue;
      if (edge.table_name === edge.foreign_table) continue; // self-FK: sıra dışı çözülür
      graph.get(edge.table_name)!.dependencies.add(edge.foreign_table);
    }
    return [...graph.values()];
  }

  /** Kahn topolojik sıralaması — bağımlılıklar önce; döngüde kalanlar sonda. */
  private topoSort(nodes: TableNode[]): string[] {
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const node of nodes) {
      indegree.set(node.name, node.dependencies.size);
      for (const dep of node.dependencies) {
        const list = dependents.get(dep) ?? [];
        list.push(node.name);
        dependents.set(dep, list);
      }
    }
    const queue = nodes.filter((n) => (indegree.get(n.name) ?? 0) === 0).map((n) => n.name);
    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const next of dependents.get(current) ?? []) {
        const left = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, left);
        if (left === 0) queue.push(next);
      }
    }
    // Kalanlar (döngüsel FK) sona eklenir — restore session_replication_role
    // = replica ile FK denetimini geçici kapattığından güvenlidir.
    for (const node of nodes) {
      if (!order.includes(node.name)) order.push(node.name);
    }
    return order;
  }

  private async dumpTableRows(table: string): Promise<{ jsonl: Buffer; rows: number }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "public"."${table}"`,
    );
    const lines = rows.map((row) => JSON.stringify(row));
    const jsonl = Buffer.from(lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8');
    return { jsonl, rows: rows.length };
  }

  /**
   * SQL literal kodlayıcı — string kaçırtma, sayı/bool/null, nesne → JSON.
   * Nesne değerleri (Decimal→"123.45", Date→ISO, Json) düz tırnaklı unknown
   * literal olarak yazılır: PG unknown literal'i hedef kolon tipine (numeric,
   * jsonb, uuid, timestamp) kendisi çözer — açık ::text cast'i bu çözmeyi
   * bozar (text→numeric/jsonb atama cast'i yok; Faz 14 restore hatası).
   */
  private static sqlLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') {
      const text = JSON.stringify(value);
      return `'${text.replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /** Yedek çalıştırır: döküm + object dosyaları + config → şifreli arşiv + manifest. */
  async runBackup(auth: AuthContext, request: AuthRequest, kind: 'manual' | 'scheduled' = 'manual') {
    const config = await this.prisma.backupConfig.upsert({
      where: { clinicId: auth.clinicId },
      create: { clinicId: auth.clinicId, retentionDays: 30 },
      update: {},
    });
    const retentionUntil = new Date(Date.now() + config.retentionDays * 86_400_000);
    const run = await this.prisma.backupRun.create({
      data: {
        clinicId: auth.clinicId,
        kind,
        status: 'running',
        retentionUntil,
        startedById: auth.staffId,
        totalBytes: 0,
        tableCount: 0,
        totalRows: 0,
      },
    });
    try {
      const graph = await this.tableGraph();
      const order = this.topoSort(graph);
      const files: Array<{ path: string; data: Buffer; rows?: number }> = [];
      const tables: Array<{ name: string; rows: number; sha256: string }> = [];
      let totalRows = 0;
      for (const table of order) {
        const { jsonl, rows } = await this.dumpTableRows(table);
        files.push({ path: `db/${table}.jsonl`, data: jsonl, rows });
        tables.push({ name: table, rows, sha256: sha256Hex(jsonl) });
        totalRows += rows;
      }

      // Object dosyaları — private storage kökü
      const rootDir = this.storage.rootDir;
      let objectFileCount = 0;
      if (existsSync(rootDir)) {
        const names = (await readdir(rootDir)).filter((name) => BackupService.FILE_IDENT.test(name));
        for (const name of names.slice(0, 5000)) {
          const data = await readFile(join(rootDir, name)).catch(() => null);
          if (!data) continue;
          files.push({ path: `objects/${name}`, data });
          objectFileCount += 1;
        }
      }

      // Config metadata — klinik özeti + sürüm; sır/PPI taşımaz
      const [clinic, staffCount, branchCount] = await Promise.all([
        this.prisma.clinic.findUnique({ where: { id: auth.clinicId }, select: { id: true, name: true, slug: true, timezone: true, locale: true, currency: true } }),
        this.prisma.staff.count({ where: { clinicId: auth.clinicId } }),
        this.prisma.branch.count({ where: { clinicId: auth.clinicId } }),
      ]);
      files.push({
        path: 'config.json',
        data: Buffer.from(
          JSON.stringify({ clinic, staffCount, branchCount, retentionDays: config.retentionDays, takenAt: new Date().toISOString() }, null, 2),
          'utf8',
        ),
      });

      const { buffer: bundle, header } = createBundle(files, { clinicId: auth.clinicId });
      const encrypted = encryptBuffer(bundle, this.key());
      const archiveSha256 = sha256Hex(encrypted);
      const runDir = join(this.backupDir(), run.id);
      await mkdir(runDir, { recursive: true });
      const archivePath = join(runDir, 'backup.vcenc');
      await writeFile(archivePath, encrypted, { mode: 0o600 });
      const manifest: BackupManifest = {
        runId: run.id,
        clinicId: auth.clinicId,
        createdAt: new Date().toISOString(),
        encrypted: true,
        algorithm: BACKUP_ALGORITHM,
        archiveSha256,
        archiveBytes: encrypted.byteLength,
        tables,
        totalRows,
        objectFileCount,
        appVersion: '0.1.0-faz14',
        runbook: 'docs/RESTORE_RUNBOOK.md',
      };
      const manifestPath = join(runDir, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });

      const completed = await this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          archiveKey: `backup.vcenc`,
          manifestKey: `manifest.json`,
          archiveSha256,
          totalBytes: encrypted.byteLength,
          tableCount: tables.length,
          totalRows,
          objectFileCount,
          completedAt: new Date(),
        },
      });
      await this.audit.record({
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'BACKUP_CREATED',
        entityType: 'backup_run',
        entityId: run.id,
        metadata: { kind, tableCount: tables.length, totalRows, objectFileCount, archiveBytes: encrypted.byteLength },
        ip: (request['ip'] as string) ?? null,
        userAgent: (request['user-agent'] as string) ?? null,
      });
      void header;
      return completed;
    } catch (error) {
      await this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        },
      });
      throw error;
    }
  }

  async listRuns(auth: AuthContext, limit = 50) {
    const runs = await this.prisma.backupRun.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { startedAt: 'desc' as const },
      take: Math.min(limit, 200),
      select: {
        id: true,
        kind: true,
        status: true,
        archiveSha256: true,
        totalBytes: true,
        tableCount: true,
        totalRows: true,
        objectFileCount: true,
        algorithm: true,
        encrypted: true,
        retentionUntil: true,
        error: true,
        startedAt: true,
        completedAt: true,
      },
    });
    return { items: runs };
  }

  private runDir(runId: string): string {
    // Path traversal koruması: runId UUID formatı dışıysa reddet
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new NotFoundException({ code: 'BACKUP_RUN_NOT_FOUND', message: 'Yedek bulunamadı' });
    }
    return join(this.backupDir(), runId);
  }

  async readManifest(auth: AuthContext, runId: string): Promise<BackupManifest> {
    const run = await this.prisma.backupRun.findFirst({
      where: { id: runId, clinicId: auth.clinicId },
      select: { id: true, status: true },
    });
    if (!run) {
      throw new NotFoundException({ code: 'BACKUP_RUN_NOT_FOUND', message: 'Yedek bulunamadı' });
    }
    const manifestPath = join(this.runDir(runId), 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new NotFoundException({ code: 'BACKUP_MANIFEST_MISSING', message: 'Manifest bulunamadı' });
    }
    return JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifest;
  }

  /** Şifreli arşiv + manifest dosyalarını okur (indirme ucu için). */
  async readArchive(
    auth: AuthContext,
    runId: string,
  ): Promise<{ archive: Buffer; manifest: Buffer }> {
    const run = await this.prisma.backupRun.findFirst({
      where: { id: runId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!run) {
      throw new NotFoundException({ code: 'BACKUP_RUN_NOT_FOUND', message: 'Yedek bulunamadı' });
    }
    const dir = this.runDir(runId);
    const archive = await readFile(join(dir, 'backup.vcenc')).catch(() => null);
    const manifest = await readFile(join(dir, 'manifest.json')).catch(() => null);
    if (!archive || !manifest) {
      throw new NotFoundException({ code: 'BACKUP_FILE_MISSING', message: 'Yedek dosyaları bulunamadı' });
    }
    return { archive, manifest };
  }

  /**
   * Restore — çift kapı: backup.manage izni (controller) + env gate. Yalnız
   * staging'de açık (VETCORE_BACKUP_ALLOW_RESTORE=true). Akış: arşiv sha256
   * doğrulaması → decrypt → bundle checksum'ları → truncate (ters sıra) →
   * replay (topo sıra, FK denetimi replica modda) → satır sayısı mutabakatı →
   * object dosyaları geri yazımı. Hata halinde loglanır ve 500 döner.
   */
  async restoreRun(auth: AuthContext, request: AuthRequest, runId: string) {
    if (process.env.VETCORE_BACKUP_ALLOW_RESTORE !== 'true') {
      throw new ForbiddenException({
        code: 'RESTORE_DISABLED',
        message: 'Restore yalnız staging ortamında açıktır (runbook: docs/RESTORE_RUNBOOK.md)',
      });
    }
    const dir = this.runDir(runId);
    const manifest = await this.readManifest(auth, runId);
    const archive = await readFile(join(dir, 'backup.vcenc'));
    if (sha256Hex(archive) !== manifest.archiveSha256) {
      throw new BadRequestException({ code: 'BACKUP_CHECKSUM_MISMATCH', message: 'Arşiv checksum uyuşmuyor' });
    }
    const bundle = openBundle(decryptBuffer(archive, this.key()));
    const mismatches = verifyBundleChecksums(bundle.header, bundle.file);
    if (mismatches.length > 0) {
      throw new BadRequestException({
        code: 'BACKUP_FILE_CHECKSUM_MISMATCH',
        message: `Checksum hatası: ${mismatches.map((m) => m.path).join(', ')}`,
      });
    }

    const graph = await this.tableGraph();
    const order = this.topoSort(graph);
    const reversed = [...order].reverse();

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = replica`);
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${reversed.map((t) => `"public"."${t}"`).join(', ')} CASCADE`,
      );
      let restoredRows = 0;
      for (const table of order) {
        const entry = bundle.header.files.find((f) => f.path === `db/${table}.jsonl`);
        if (!entry || entry.length === 0) continue;
        const text = bundle.file(`db/${table}.jsonl`).toString('utf8');
        const lines = text.split('\n').filter((line) => line !== '');
        for (let i = 0; i < lines.length; i += 50) {
          const chunk = lines.slice(i, i + 50).map((line) => JSON.parse(line) as Record<string, unknown>);
          const first = chunk[0]!;
          const columns = Object.keys(first);
          const values = chunk
            .map((row) => `(${columns.map((c) => BackupService.sqlLiteral(row[c])).join(', ')})`)
            .join(', ');
          await tx.$executeRawUnsafe(
            `INSERT INTO "public"."${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${values}`,
          );
          restoredRows += chunk.length;
        }
      }
      await tx.$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
      void restoredRows;
    });

    // Satır sayısı mutabakatı — her tablo manifest ile eşleşmeli
    const countRows: Array<{ table_name: string; count: bigint }> =
      await this.prisma.$queryRawUnsafe(
        `SELECT relname AS table_name, n_live_tup AS count FROM pg_stat_user_tables WHERE schemaname='public'`,
      );
    const counts = new Map(countRows.map((r) => [r.table_name, Number(r.count)]));
    // n_live_tup tahminî olabilir — kesin sayım manifest tablolarında yapılır
    for (const table of manifest.tables) {
      const exact = await this.prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM "public"."${table.name}"`,
      );
      const actual = Number(exact[0]?.c ?? 0);
      counts.set(table.name, actual);
      if (actual !== table.rows) {
        throw new BadRequestException({
          code: 'RESTORE_COUNT_MISMATCH',
          message: `Tablo ${table.name}: beklenen ${table.rows}, actual ${actual}`,
        });
      }
    }

    // Object dosyaları geri yazımı
    const rootDir = this.storage.rootDir;
    await mkdir(rootDir, { recursive: true });
    let restoredObjects = 0;
    for (const file of bundle.header.files) {
      if (!file.path.startsWith('objects/')) continue;
      const name = file.path.slice('objects/'.length);
      await writeFile(join(rootDir, name), bundle.file(file.path), { mode: 0o600 });
      restoredObjects += 1;
    }

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'BACKUP_RESTORED',
      entityType: 'backup_run',
      entityId: runId,
      metadata: { tables: manifest.tables.length, totalRows: manifest.totalRows, restoredObjects },
      ip: (request['ip'] as string) ?? null,
      userAgent: (request['user-agent'] as string) ?? null,
    });
    return {
      runId,
      tables: manifest.tables.length,
      totalRows: manifest.totalRows,
      objectFiles: restoredObjects,
      checksumVerified: true,
    };
  }

  async getConfig(auth: AuthContext) {
    const config = await this.prisma.backupConfig.findUnique({
      where: { clinicId: auth.clinicId },
    });
    return config ?? { clinicId: auth.clinicId, retentionDays: 30, updatedAt: null };
  }

  async updateConfig(auth: AuthContext, request: AuthRequest, retentionDays: number) {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      throw new BadRequestException({ code: 'BACKUP_RETENTION_INVALID', message: '1-3650 gün arası olmalı' });
    }
    const config = await this.prisma.backupConfig.upsert({
      where: { clinicId: auth.clinicId },
      create: { clinicId: auth.clinicId, retentionDays },
      update: { retentionDays },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'BACKUP_CONFIG_UPDATED',
      entityType: 'backup_config',
      entityId: auth.clinicId,
      metadata: { retentionDays },
      ip: (request['ip'] as string) ?? null,
      userAgent: (request['user-agent'] as string) ?? null,
    });
    return config;
  }

  /** Retention uygulaması: süresi geçmiş tamamlanmış çalışmaları siler. */
  async applyRetention(auth: AuthContext, request: AuthRequest) {
    const expired = await this.prisma.backupRun.findMany({
      where: {
        clinicId: auth.clinicId,
        status: { not: 'running' },
        retentionUntil: { lt: new Date() },
      },
      select: { id: true },
    });
    for (const run of expired) {
      await rm(join(this.backupDir(), run.id), { recursive: true, force: true }).catch(() => undefined);
    }
    await this.prisma.backupRun.deleteMany({
      where: { id: { in: expired.map((r) => r.id) } },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'BACKUP_RETENTION_APPLIED',
      entityType: 'backup_config',
      entityId: auth.clinicId,
      metadata: { removed: expired.length },
      ip: (request['ip'] as string) ?? null,
      userAgent: (request['user-agent'] as string) ?? null,
    });
    return { removed: expired.length };
  }
}
