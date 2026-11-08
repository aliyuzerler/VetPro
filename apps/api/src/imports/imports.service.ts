import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type { ImportKind } from './imports.domain';
import {
  IMPORT_TEMPLATES,
  IMPORT_KINDS,
  buildTemplateCsv,
  isValidResolution,
  matchOwner,
  matchPatient,
  matchProduct,
  normalizeEmail,
  normalizePhone,
  parseCsv,
  rowStatus,
  templateFileName,
  toTable,
  validateOwnerRow,
  validatePatientRow,
  validateProductRow,
  type ValidatedRow,
} from './imports.domain';

/**
 * İçe aktarma servisi — Faz 14. Akış: şablon indir → CSV yükle (doğrulama +
 * duplicate taraması, status=preview) → satır çözümü (duplicate için açık
 * create/skip) → commit (tek transaction, hata satırı varsa reddedilir).
 * Sessiz overwrite yok: matchedId'li satır karar verilmeden commit edilmez.
 */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  template(kind: ImportKind): { fileName: string; csv: Buffer } {
    if (!IMPORT_KINDS.includes(kind)) {
      throw new NotFoundException({ code: 'IMPORT_KIND_NOT_FOUND', message: 'İçe aktarma türü bulunamadı' });
    }
    return { fileName: templateFileName(kind), csv: buildTemplateCsv(kind) };
  }

  private validateRow(kind: ImportKind, row: { rowNumber: number; values: Record<string, string> }): ValidatedRow {
    if (kind === 'owners') return validateOwnerRow(row);
    if (kind === 'patients') return validatePatientRow(row);
    return validateProductRow(row);
  }

  private resolveBranchId(auth: AuthContext, branchId?: string): string {
    const resolved = branchId ?? auth.activeBranchId;
    if (!resolved) {
      throw new BadRequestException({ code: 'BRANCH_REQUIRED', message: 'Şube seçilmelidir' });
    }
    if (!auth.allBranches && !auth.branchIds.includes(resolved)) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube erişiminiz yok' });
    }
    return resolved;
  }

  /**
   * CSV yükler: çözümle → doğrula → duplicate tara → ImportJob(preview) + satır
   * kayıtları. Üst sınır 2000 satır — başlangıç verisi içindir.
   */
  async upload(
    auth: AuthContext,
    request: AuthRequest,
    kind: ImportKind,
    branchId: string | undefined,
    fileName: string,
    content: Buffer,
  ) {
    if (!IMPORT_KINDS.includes(kind)) {
      throw new NotFoundException({ code: 'IMPORT_KIND_NOT_FOUND', message: 'İçe aktarma türü bulunamadı' });
    }
    const resolvedBranchId = this.resolveBranchId(auth, branchId);
    const text = content.toString('utf8');
    if (text.length > 4_000_000) {
      throw new BadRequestException({ code: 'IMPORT_FILE_TOO_LARGE', message: 'Dosya çok büyük' });
    }
    const table = toTable(parseCsv(text));
    // Yalnız zorunlu başlıklar şart — opsiyonel kolonlar eksik olabilir
    const requiredHeaders = IMPORT_TEMPLATES[kind].columns.filter((c) => c.required).map((c) => c.name);
    const missingHeaders = requiredHeaders.filter((h) => !table.headers.includes(h));
    if (table.rows.length === 0 || missingHeaders.length > 0) {
      throw new BadRequestException({
        code: 'IMPORT_TEMPLATE_MISMATCH',
        message: `Şablon başlıkları uyuşmuyor${missingHeaders.length ? ` (eksik: ${missingHeaders.join(', ')})` : ' (veri satırı yok)'}`,
      });
    }
    if (table.rows.length > 2000) {
      throw new BadRequestException({ code: 'IMPORT_TOO_MANY_ROWS', message: 'En fazla 2000 satır' });
    }

    const validated = table.rows.map((row) => this.validateRow(kind, row));

    // Duplicate taraması — mevcut DB havuzuna karşı (klinik kapsamlı)
    const duplicates = new Map<number, string | null>();
    if (kind === 'owners') {
      const owners = await this.prisma.owner.findMany({
        where: { clinicId: auth.clinicId, mergedIntoOwnerId: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          contacts: { select: { kind: true, normalized: true } },
        },
      });
      const pool = owners.map((owner) => ({
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        emails: owner.contacts.filter((c) => c.kind === 'email').map((c) => c.normalized),
        phones: owner.contacts.filter((c) => c.kind === 'phone').map((c) => c.normalized),
      }));
      for (const row of validated) {
        if (Object.keys(row.errors).length > 0) continue;
        duplicates.set(
          row.rowNumber,
          matchOwner(
            { email: row.parsed['email'] as string | null, phone: row.parsed['phone'] as string | null },
            pool,
          ),
        );
      }
    } else if (kind === 'patients') {
      const patients = await this.prisma.patient.findMany({
        where: { clinicId: auth.clinicId, mergedIntoPatientId: null },
        select: {
          id: true,
          name: true,
          microchip: true,
          ownerId: true,
          species: { select: { name: true } },
        },
      });
      const pool = patients.map((patient) => ({
        id: patient.id,
        name: patient.name,
        speciesName: patient.species.name,
        microchip: patient.microchip,
        ownerId: patient.ownerId,
      }));
      // Sahip çözümü — eposta/telefon ile; preview anındaki DB durumu
      const ownerContacts = await this.prisma.ownerContact.findMany({
        where: { owner: { clinicId: auth.clinicId } },
        select: { ownerId: true, kind: true, normalized: true },
      });
      const ownerByClinic = new Map<string, string>();
      for (const contact of ownerContacts) {
        const existing = ownerByClinic.get(contact.normalized);
        ownerByClinic.set(contact.normalized, existing ?? contact.ownerId);
      }
      for (const row of validated) {
        if (Object.keys(row.errors).length > 0) continue;
        const email = row.parsed['ownerEmail'] as string | null;
        const phone = row.parsed['ownerPhone'] as string | null;
        const resolvedOwnerId =
          (email ? (ownerByClinic.get(email) ?? null) : null) ??
          (phone ? (ownerByClinic.get(phone) ?? null) : null);
        row.parsed['resolvedOwnerId'] = resolvedOwnerId;
        if (!resolvedOwnerId) {
          row.errors['sahipEposta'] = 'bu eposta/telefonla sahip bulunamadı — önce sahipleri içe aktarın';
        }
        duplicates.set(
          row.rowNumber,
          matchPatient(
            {
              microchip: row.parsed['microchip'] as string | null,
              name: row.parsed['name'] as string,
              speciesName: row.parsed['speciesName'] as string,
              resolvedOwnerId,
            },
            pool,
          ),
        );
      }
    } else {
      const products = await this.prisma.product.findMany({
        where: { clinicId: auth.clinicId },
        select: { id: true, code: true, barcode: true, name: true },
      });
      const pool = products.map((product) => ({
        id: product.id,
        code: product.code,
        barcode: product.barcode,
        name: product.name,
      }));
      for (const row of validated) {
        if (Object.keys(row.errors).length > 0) continue;
        duplicates.set(
          row.rowNumber,
          matchProduct(
            { code: row.parsed['code'] as string, barcode: row.parsed['barcode'] as string | null },
            pool,
          ),
        );
      }
    }

    const job = await this.prisma.importJob.create({
      data: {
        clinicId: auth.clinicId,
        branchId: resolvedBranchId,
        kind,
        status: 'preview',
        fileName: fileName.slice(0, 200),
        totalRows: validated.length,
        validRows: 0,
        errorRows: 0,
        duplicateRows: 0,
        createdById: auth.staffId,
      },
    });
    let valid = 0;
    let errors = 0;
    let duplicatesCount = 0;
    for (const row of validated) {
      const matchedId = duplicates.get(row.rowNumber) ?? null;
      const status = rowStatus(row.errors, matchedId);
      if (status === 'valid') valid += 1;
      else if (status === 'error') errors += 1;
      else duplicatesCount += 1;
      await this.prisma.importRow.create({
        data: {
          jobId: job.id,
          rowNumber: row.rowNumber,
          status,
          rawData: row.values as never,
          errors: (Object.keys(row.errors).length > 0 ? row.errors : undefined) as never,
          matchedId,
          // valid satırlar varsayılan create; duplicate karar bekler
          resolution: status === 'valid' ? 'create' : null,
        },
      });
    }
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { validRows: valid, errorRows: errors, duplicateRows: duplicatesCount },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: resolvedBranchId,
      action: 'IMPORT_UPLOADED',
      entityType: 'import_job',
      entityId: job.id,
      metadata: { kind, totalRows: validated.length, validRows: valid, errorRows: errors, duplicateRows: duplicatesCount },
      ip: (request['ip'] as string) ?? null,
      userAgent: (request['user-agent'] as string) ?? null,
    });
    return this.detail(auth, job.id);
  }

  async detail(auth: AuthContext, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, clinicId: auth.clinicId },
      include: {
        rows: { orderBy: { rowNumber: 'asc' as const } },
      },
    });
    if (!job) {
      throw new NotFoundException({ code: 'IMPORT_JOB_NOT_FOUND', message: 'İçe aktarma işi bulunamadı' });
    }
    return job;
  }

  /** Duplicate satır için açık karar (create|skip). error satırına karar verilmez. */
  async resolveRow(auth: AuthContext, jobId: string, rowId: string, resolution: string) {
    if (!isValidResolution(resolution)) {
      throw new BadRequestException({ code: 'IMPORT_BAD_RESOLUTION', message: 'Çözüm create veya skip olmalı' });
    }
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, clinicId: auth.clinicId },
      select: { id: true, status: true },
    });
    if (!job) {
      throw new NotFoundException({ code: 'IMPORT_JOB_NOT_FOUND', message: 'İçe aktarma işi bulunamadı' });
    }
    if (job.status !== 'preview') {
      throw new BadRequestException({ code: 'IMPORT_ALREADY_COMMITTED', message: 'İş tamamlandı' });
    }
    const row = await this.prisma.importRow.findFirst({
      where: { id: rowId, jobId },
      select: { id: true, status: true },
    });
    if (!row) {
      throw new NotFoundException({ code: 'IMPORT_ROW_NOT_FOUND', message: 'Satır bulunamadı' });
    }
    if (row.status !== 'duplicate') {
      throw new BadRequestException({ code: 'IMPORT_ROW_NOT_DUPLICATE', message: 'Yalnız duplicate satıra karar verilir' });
    }
    const updated = await this.prisma.importRow.update({
      where: { id: row.id },
      data: { resolution },
    });
    return updated;
  }

  /**
   * Commit — tek transaction. Kurallar:
   * - error satırı varsa 400 (önce düzeltilmeli)
   * - duplicate ve kararsız satır varsa 409 IMPORT_RESOLUTION_REQUIRED
   * - create: kayıt yazılır (owners: Owner+Contact; patients: species/breed/
   *   owner çözümü; products: kategori/birim çözümü), createdRecordId işlenir
   * - skip: atlanır; commit sonrası job status=committed + denetim
   */
  async commit(auth: AuthContext, request: AuthRequest, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, clinicId: auth.clinicId },
      include: { rows: { orderBy: { rowNumber: 'asc' as const } } },
    });
    if (!job) {
      throw new NotFoundException({ code: 'IMPORT_JOB_NOT_FOUND', message: 'İçe aktarma işi bulunamadı' });
    }
    if (job.status !== 'preview') {
      throw new BadRequestException({ code: 'IMPORT_ALREADY_COMMITTED', message: 'İş tamamlandı' });
    }
    // Sıra: önce duplicate kararları (önizleme akışının birincil kapısı),
    // sonra hata satırları — hatalı dosya zaten yeniden yüklenecek.
    const undecided = job.rows.filter((row) => row.status === 'duplicate' && !row.resolution);
    if (undecided.length > 0) {
      throw new ConflictException({
        code: 'IMPORT_RESOLUTION_REQUIRED',
        message: `Duplicate satırlar için create/skip kararı gerekli (satırlar: ${undecided.slice(0, 10).map((r) => r.rowNumber).join(', ')})`,
      });
    }
    const errorRows = job.rows.filter((row) => row.status === 'error');
    if (errorRows.length > 0) {
      throw new BadRequestException({
        code: 'IMPORT_HAS_ERRORS',
        message: `Hatalı ${errorRows.length} satır düzeltilmeli (satırlar: ${errorRows.slice(0, 10).map((r) => r.rowNumber).join(', ')})`,
      });
    }

    // Katalog çözüm tabloları (commit öncesi tek sefer)
    const speciesList = await this.prisma.species.findMany({ select: { id: true, name: true } });
    const speciesByName = new Map(speciesList.map((s) => [s.name.toLocaleLowerCase('tr'), s.id]));
    const breedList = await this.prisma.breed.findMany({ select: { id: true, speciesId: true, name: true } });
    const breedKey = (speciesId: string, name: string) => `${speciesId}:${name.toLocaleLowerCase('tr')}`;
    const breedMap = new Map(breedList.map((b) => [breedKey(b.speciesId, b.name), b.id]));
    const [units, categories] = await Promise.all([
      this.prisma.unit.findMany({ where: { clinicId: auth.clinicId }, select: { id: true, key: true, name: true } }),
      this.prisma.productCategory.findMany({
        where: { clinicId: auth.clinicId },
        select: { id: true, name: true },
      }),
    ]);
    const unitByKey = new Map<string, string>();
    for (const unit of units) {
      unitByKey.set(unit.key.toLocaleLowerCase('tr'), unit.id);
      unitByKey.set(unit.name.toLocaleLowerCase('tr'), unit.id);
    }
    const categoryByName = new Map(categories.map((c) => [c.name.toLocaleLowerCase('tr'), c.id]));

    // Sahip çözüm haritası — aynı iş içinde önce oluşturulan sahipler de bulunur
    const ownerCache = new Map<string, string | null>();
    const resolveOwnerByContact = async (email: string | null, phone: string | null): Promise<string | null> => {
      const keys = [email, phone].filter((k): k is string => Boolean(k));
      for (const key of keys) {
        if (ownerCache.has(key)) return ownerCache.get(key) ?? null;
      }
      if (keys.length === 0) return null;
      const contact = await this.prisma.ownerContact.findFirst({
        where: { normalized: { in: keys }, owner: { clinicId: auth.clinicId } },
        select: { ownerId: true },
      });
      const resolved = contact?.ownerId ?? null;
      for (const key of keys) ownerCache.set(key, resolved);
      return resolved;
    };

    const createdRecordIds = new Map<number, string>();
    let committed = 0;
    const patientBase = await this.prisma.patient.count({ where: { clinicId: auth.clinicId } });
    let patientSeq = 0;

    // Owners önce (patients sahiplere bağlı); products bağımsız
    const ordered = [...job.rows].sort((a, b) => {
      if (job.kind !== 'patients') return a.rowNumber - b.rowNumber;
      return a.rowNumber - b.rowNumber;
    });

    const result = await this.prisma.$transaction(async (tx) => {
      for (const row of ordered) {
        if (row.status === 'error') continue;
        const resolution = row.status === 'valid' ? 'create' : (row.resolution ?? 'skip');
        if (resolution === 'skip') continue;

        const parsed = row.rawData as Record<string, string>;
        if (job.kind === 'owners') {
          const validated = validateOwnerRow({ rowNumber: row.rowNumber, values: parsed });
          const owner = await tx.owner.create({
            data: {
              clinicId: auth.clinicId,
              firstName: validated.parsed['firstName'] as string,
              lastName: validated.parsed['lastName'] as string,
              address: validated.parsed['address'] as string | null,
              identityNo: validated.parsed['identityNo'] as string | null,
              notes: validated.parsed['notes'] as string | null,
            },
          });
          const email = validated.parsed['email'] as string | null;
          const phone = validated.parsed['phone'] as string | null;
          if (email) {
            await tx.ownerContact.create({
              data: { ownerId: owner.id, kind: 'email', value: email, normalized: normalizeEmail(email), isPrimary: !phone },
            });
          }
          if (phone) {
            await tx.ownerContact.create({
              data: { ownerId: owner.id, kind: 'phone', value: phone, normalized: normalizePhone(phone), isPrimary: true },
            });
          }
          createdRecordIds.set(row.rowNumber, owner.id);
          if (email) ownerCache.set(email, owner.id);
          if (phone) ownerCache.set(phone, owner.id);
        } else if (job.kind === 'patients') {
          const validated = validatePatientRow({ rowNumber: row.rowNumber, values: parsed });
          const ownerId = await resolveOwnerByContact(
            validated.parsed['ownerEmail'] as string | null,
            validated.parsed['ownerPhone'] as string | null,
          );
          if (!ownerId) {
            throw new BadRequestException({
              code: 'IMPORT_ROW_OWNER_MISSING',
              message: `Satır ${row.rowNumber}: sahip bulunamadı`,
            });
          }
          const speciesId = speciesByName.get((validated.parsed['speciesName'] as string).toLocaleLowerCase('tr'));
          if (!speciesId) {
            throw new BadRequestException({
              code: 'IMPORT_SPECIES_NOT_FOUND',
              message: `Satır ${row.rowNumber}: tür katalogda yok`,
            });
          }
          const breedName = validated.parsed['breedName'] as string | null;
          const breedId = breedName ? (breedMap.get(breedKey(speciesId, breedName)) ?? null) : null;
          patientSeq += 1;
          const patient = await tx.patient.create({
            data: {
              clinicId: auth.clinicId,
              branchId: job.branchId,
              ownerId,
              speciesId,
              breedId,
              name: validated.parsed['name'] as string,
              code: `HP-${String(patientBase + patientSeq).padStart(4, '0')}`,
              microchip: validated.parsed['microchip'] as string | null,
              gender: validated.parsed['gender'] as string,
              birthDate: validated.parsed['birthDate'] as Date | null,
            },
          });
          createdRecordIds.set(row.rowNumber, patient.id);
        } else {
          const validated = validateProductRow({ rowNumber: row.rowNumber, values: parsed });
          const unitId = unitByKey.get(validated.parsed['unitKey'] as string);
          if (!unitId) {
            throw new BadRequestException({
              code: 'IMPORT_UNIT_NOT_FOUND',
              message: `Satır ${row.rowNumber}: birim katalogda yok`,
            });
          }
          const categoryName = validated.parsed['categoryName'] as string | null;
          const categoryId = categoryName ? (categoryByName.get(categoryName.toLocaleLowerCase('tr')) ?? null) : null;
          const product = await tx.product.create({
            data: {
              clinicId: auth.clinicId,
              categoryId,
              code: validated.parsed['code'] as string,
              barcode: validated.parsed['barcode'] as string | null,
              name: validated.parsed['name'] as string,
              trackingType: validated.parsed['trackingType'] as string,
              baseUnitId: unitId,
              minStock: validated.parsed['minStock'] as number,
              defaultSalePrice: validated.parsed['defaultSalePrice'] as number | null,
            },
          });
          createdRecordIds.set(row.rowNumber, product.id);
        }
        committed += 1;
      }
      return committed;
    });

    // createdRecordId işaretle (transaction dışı — id map'ten)
    for (const [rowNumber, recordId] of createdRecordIds) {
      const row = job.rows.find((r) => r.rowNumber === rowNumber);
      if (row) {
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { createdRecordId: recordId },
        });
      }
    }

    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'committed', committedRows: result, committedAt: new Date() },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: job.branchId,
      action: 'IMPORT_COMMITTED',
      entityType: 'import_job',
      entityId: job.id,
      metadata: { kind: job.kind, committedRows: result },
      ip: (request['ip'] as string) ?? null,
      userAgent: (request['user-agent'] as string) ?? null,
    });
    return this.detail(auth, job.id);
  }

  async listJobs(auth: AuthContext, limit = 50) {
    const jobs = await this.prisma.importJob.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { createdAt: 'desc' as const },
      take: Math.min(limit, 200),
      select: {
        id: true,
        kind: true,
        status: true,
        fileName: true,
        totalRows: true,
        validRows: true,
        errorRows: true,
        duplicateRows: true,
        committedRows: true,
        createdAt: true,
      },
    });
    return { items: jobs };
  }
}
