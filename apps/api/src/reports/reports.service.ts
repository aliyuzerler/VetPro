import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { LocalPrivateStorageAdapter } from '../files/private-storage';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRendererService } from '../documents/pdf.renderer';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { ReportQueryDto, resolveDateRange } from './reports.dto';
import {
  buildAgingTable,
  buildCsv,
  buildRevenueTable,
  buildXlsx,
  EXPIRY_LABELS,
  expiryBucketKey,
  exportFileName,
  formatTrMoney,
  groupRevenueByPeriod,
  isReportKey,
  money,
  occupancyRate,
  REPORT_CATALOG,
  reportTableToPdfSection,
  round2,
  turnaroundSummary,
  type ExpiryBucketKey,
  type ReportFormat,
  type ReportTable,
} from './reports.domain';

/**
 * Rapor servisi — Faz 14. On rapor: şube + tarih filtreleriyle üretim; dışa
 * aktarma CSV/XLSX/PDF, reports.export izniyle ve denetim yazımıyla.
 * Kabul kriterleri: filtre doğru veri; izin yoksa dosya üretilemez (guard +
 * servis savunması); Türkçe karakter/para biçimi doğru.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PdfRendererService) private readonly pdf: PdfRendererService,
    @Inject(LocalPrivateStorageAdapter) private readonly storage: LocalPrivateStorageAdapter,
  ) {}

  catalog() {
    return REPORT_CATALOG;
  }

  /** Şube filtresi: istek şubesi kapsam dışıysa 403 (BranchScopeGuard sonrası savunma). */
  private branchFilter(auth: AuthContext, query: ReportQueryDto): string | null {
    if (query.branchId) {
      if (!auth.allBranches && !auth.branchIds.includes(query.branchId)) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube erişiminiz yok' });
      }
      return query.branchId;
    }
    return null;
  }

  /** Tarih aralığı filtresi — createdAt tabanlı sorgular için. */
  private range(query: ReportQueryDto): { gte: Date; lt: Date } {
    const { start, end } = resolveDateRange(query.dateFrom, query.dateTo);
    return { gte: start, lt: end };
  }

  /** Raporu üretir — tüm raporlarda ortak giriş; kabul kriteri filtre doğruluğu. */
  async runReport(
    auth: AuthContext,
    reportKey: string,
    query: ReportQueryDto,
  ): Promise<ReportTable> {
    if (!isReportKey(reportKey)) {
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Rapor bulunamadı' });
    }
    const branchId = this.branchFilter(auth, query);
    switch (reportKey) {
      case 'gelir':
        return this.revenueReport(query, branchId);
      case 'borc-yaslandirma':
        return this.agingReport(auth, branchId);
      case 'hizmet-dagilimi':
        return this.serviceDistributionReport(auth, query, branchId);
      case 'hekim-is-yuku':
        return this.workloadReport(auth, query, branchId);
      case 'asi-takip':
        return this.vaccineReport(auth, query, branchId);
      case 'stok-deger-skt':
        return this.stockValueReport(auth);
      case 'urun-tuketim':
        return this.consumptionReport(auth, query, branchId);
      case 'tedarik-satinalma':
        return this.purchasingReport(auth, query, branchId);
      case 'lab-turnaround':
        return this.labTurnaroundReport(auth, query, branchId);
      case 'yatis-doluluk':
        return this.occupancyReport(auth, query, branchId);
      default:
        throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Rapor bulunamadı' });
    }
  }

  // ── 1) Gelir (günlük/aylık) ────────────────────────────────────────────────

  private async revenueReport(query: ReportQueryDto, branchId: string | null): Promise<ReportTable> {
    const period = query.period ?? 'daily';
    const created = this.range(query);
    const where = {
      // Şube filtresi payments.branchId üzerinden; expenses farklı model ama
      // aynı kolon adıyla eşleşir.
      ...(branchId ? { branchId } : {}),
      createdAt: created,
    };
    const [payments, refunds, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: { amount: true, createdAt: true },
      }),
      this.prisma.refund.findMany({
        where,
        select: { amount: true, createdAt: true },
      }),
      this.prisma.expense.findMany({
        where: {
          ...(branchId ? { branchId } : {}),
          spentAt: created,
        },
        select: { amount: true, spentAt: true },
      }),
    ]);
    const rows = groupRevenueByPeriod(
      payments.map((p) => ({ amount: money(p.amount), createdAt: p.createdAt })),
      refunds.map((r) => ({ amount: money(r.amount), createdAt: r.createdAt })),
      expenses.map((e) => ({ amount: money(e.amount), paidAt: e.spentAt })),
      period,
    );
    return buildRevenueTable(period, rows);
  }

  // ── 2) Borç yaşlandırma ───────────────────────────────────────────────────

  private async agingReport(auth: AuthContext, branchId: string | null): Promise<ReportTable> {
    const charges = await this.prisma.charge.findMany({
      where: {
        clinicId: auth.clinicId,
        status: { in: ['open', 'partial'] },
        ...(branchId ? { branchId } : {}),
      },
      select: { createdAt: true, total: true, allocations: { select: { amount: true } } },
    });
    const now = new Date();
    const items = charges.map((c) => ({
      createdAt: c.createdAt,
      remaining: Math.max(
        0,
        money(c.total) - money(c.allocations.reduce((acc, a) => acc + money(a.amount), 0)),
      ),
    }));
    return buildAgingTable(items, now);
  }

  // ── 3) Hizmet dağılımı ────────────────────────────────────────────────────

  private async serviceDistributionReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const lines = await this.prisma.serviceRecordLine.findMany({
      where: {
        serviceRecord: {
          clinicId: auth.clinicId,
          status: { in: ['finalized'] },
          reversedAt: null,
          createdAt: this.range(query),
          ...(branchId ? { branchId } : {}),
        },
      },
      select: {
        id: true,
        qty: true,
        lineTotal: true,
        service: { select: { id: true, name: true, category: true } },
      },
    });
    const grouped = new Map<string, { service: string; category: string; count: number; qty: number; revenue: number }>();
    for (const line of lines) {
      const key = line.service.id ?? line.service.name;
      const row = grouped.get(String(key)) ?? {
        service: line.service.name,
        category: line.service.category,
        count: 0,
        qty: 0,
        revenue: 0,
      };
      row.count += 1;
      row.qty += Number(line.qty);
      row.revenue += money(line.lineTotal);
      grouped.set(String(key), row);
    }
    const rows = [...grouped.values()]
      .map((r) => ({
        service: r.service,
        category: r.category,
        count: r.count,
        qty: round2(r.qty * 1000) / 1000,
        revenue: round2(r.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);
    return {
      key: 'hizmet-dagilimi',
      title: 'Hizmet Dağılımı',
      columns: [
        { key: 'service', label: 'Hizmet', type: 'text' },
        { key: 'category', label: 'Kategori', type: 'text' },
        { key: 'count', label: 'Kayıt Adedi', type: 'number' },
        { key: 'qty', label: 'Miktar', type: 'number' },
        { key: 'revenue', label: 'Ciro', type: 'money' },
      ],
      rows,
      totalColumns: ['count', 'qty', 'revenue'],
    };
  }

  // ── 4) Hekim iş yükü ──────────────────────────────────────────────────────

  private async workloadReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const created = this.range(query);
    const veterinarians = await this.prisma.staff.findMany({
      where: {
        clinicId: auth.clinicId,
        title: { contains: 'Veteriner', mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, title: true },
    });
    // Nitelikli hekim listesi: rollere göreVeteriner hekim unvanı bulunmayanlar da
    // encounter.veterinarianId ile rapora düşebilir — sorgular fiili atıfları sayar.
    const [encounters, surgeries, labOrders, stays, prescriptions] = await Promise.all([
      this.prisma.encounter.groupBy({
        by: ['veterinarianId'],
        where: {
          clinicId: auth.clinicId,
          startedAt: created,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.surgeryCase.groupBy({
        by: ['veterinarianId'],
        where: {
          clinicId: auth.clinicId,
          plannedStart: created,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.labOrder.groupBy({
        by: ['veterinarianId'],
        where: {
          clinicId: auth.clinicId,
          orderedAt: created,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.hospitalStay.groupBy({
        by: ['veterinarianId'],
        where: {
          clinicId: auth.clinicId,
          admittedAt: created,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.prescription.groupBy({
        by: ['veterinarianId'],
        where: {
          clinicId: auth.clinicId,
          createdAt: created,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map<string, { encounters: number; surgeries: number; lab: number; stays: number; prescriptions: number }>();
    const touch = (id: string) =>
      counts.get(id) ?? { encounters: 0, surgeries: 0, lab: 0, stays: 0, prescriptions: 0 };
    for (const row of encounters) {
      const c = touch(row.veterinarianId);
      c.encounters = row._count._all;
      counts.set(row.veterinarianId, c);
    }
    for (const row of surgeries) {
      const c = touch(row.veterinarianId);
      c.surgeries = row._count._all;
      counts.set(row.veterinarianId, c);
    }
    for (const row of labOrders) {
      const c = touch(row.veterinarianId);
      c.lab = row._count._all;
      counts.set(row.veterinarianId, c);
    }
    for (const row of stays) {
      const c = touch(row.veterinarianId);
      c.stays = row._count._all;
      counts.set(row.veterinarianId, c);
    }
    for (const row of prescriptions) {
      const c = touch(row.veterinarianId);
      c.prescriptions = row._count._all;
      counts.set(row.veterinarianId, c);
    }
    // Sorgularda görünen ama unvan listesinde olmayan hekimleri de ekle
    const extraIds = [...counts.keys()].filter(
      (id) => !veterinarians.some((v) => v.id === id),
    );
    const extras = extraIds.length
      ? await this.prisma.staff.findMany({
          where: { id: { in: extraIds } },
          select: { id: true, firstName: true, lastName: true, title: true },
        })
      : [];
    const all = [...veterinarians, ...extras];
    const rows = all
      .filter((v) => counts.has(v.id))
      .map((v) => {
        const c = counts.get(v.id)!;
        return {
          veterinarian: `${v.firstName} ${v.lastName}`,
          title: v.title ?? '',
          encounters: c.encounters,
          surgeries: c.surgeries,
          lab: c.lab,
          stays: c.stays,
          prescriptions: c.prescriptions,
          total: c.encounters + c.surgeries + c.lab + c.stays + c.prescriptions,
        };
      })
      .sort((a, b) => b.total - a.total);
    return {
      key: 'hekim-is-yuku',
      title: 'Hekim İş Yükü',
      columns: [
        { key: 'veterinarian', label: 'Hekim', type: 'text' },
        { key: 'title', label: 'Unvan', type: 'text' },
        { key: 'encounters', label: 'Muayene', type: 'number' },
        { key: 'surgeries', label: 'Cerrahi', type: 'number' },
        { key: 'lab', label: 'Lab Siparişi', type: 'number' },
        { key: 'stays', label: 'Yatış', type: 'number' },
        { key: 'prescriptions', label: 'Reçete', type: 'number' },
        { key: 'total', label: 'Toplam', type: 'number' },
      ],
      rows,
      totalColumns: ['encounters', 'surgeries', 'lab', 'stays', 'prescriptions', 'total'],
    };
  }

  // ── 5) Aşı takip ──────────────────────────────────────────────────────────

  private async vaccineReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const created = this.range(query);
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86_400_000);
    const [events, overdue, upcoming] = await Promise.all([
      this.prisma.vaccineEvent.groupBy({
        by: ['productId'],
        where: {
          clinicId: auth.clinicId,
          administeredAt: created,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.vaccineReminder.findMany({
        where: {
          clinicId: auth.clinicId,
          status: 'scheduled',
          dueAt: { lt: now },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
        take: 5000,
      }),
      this.prisma.vaccineReminder.findMany({
        where: {
          clinicId: auth.clinicId,
          status: 'scheduled',
          dueAt: { gte: now, lte: in30Days },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
        take: 5000,
      }),
    ]);
    const productIds = events.map((e) => e.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(products.map((p) => [p.id, p.name]));
    const rows = events
      .map((e) => ({
        vaccine: nameOf.get(e.productId) ?? e.productId,
        count: e._count._all,
      }))
      .sort((a, b) => b.count - a.count);
    rows.push({ vaccine: 'Yaklaşan Hatırlatma (30 gün)', count: upcoming.length });
    rows.push({ vaccine: 'Gecikmiş Hatırlatma', count: overdue.length });
    return {
      key: 'asi-takip',
      title: 'Aşı Takip',
      columns: [
        { key: 'vaccine', label: 'Aşı / Durum', type: 'text' },
        { key: 'count', label: 'Adet', type: 'number' },
      ],
      rows,
      totalColumns: ['count'],
    };
  }

  // ── 6) Stok değer / SKT ───────────────────────────────────────────────────

  private async stockValueReport(auth: AuthContext): Promise<ReportTable> {
    const now = new Date();
    const balances = await this.prisma.stockBalance.findMany({
      where: { clinicId: auth.clinicId, qtyOnHand: { gt: 0 } },
      select: {
        qtyOnHand: true,
        lot: { select: { expiresAt: true, unitCost: true } },
        product: { select: { id: true, name: true } },
      },
    });
    // Partisiz ürünler için maliyet: en son mal kabul birim maliyeti
    const lotlessIds = [
      ...new Set(
        balances.filter((b) => !b.lot).map((b) => b.product.id),
      ),
    ];
    const lastCost = new Map<string, number>();
    if (lotlessIds.length > 0) {
      const receipts = await this.prisma.stockMovementLine.findMany({
        where: {
          productId: { in: lotlessIds },
          movement: { clinicId: auth.clinicId, kind: 'goods_receipt', status: 'posted' },
        },
        select: { productId: true, unitCost: true, movement: { select: { postedAt: true } } },
        orderBy: { movement: { postedAt: 'desc' as const } },
      });
      for (const receipt of receipts) {
        if (!lastCost.has(receipt.productId)) lastCost.set(receipt.productId, money(receipt.unitCost));
      }
    }
    const buckets = new Map<string, { bucket: string; lotCount: number; value: number }>();
    for (const key of Object.keys(EXPIRY_LABELS) as ExpiryBucketKey[]) {
      buckets.set(key, { bucket: EXPIRY_LABELS[key], lotCount: 0, value: 0 });
    }
    for (const balance of balances) {
      const key = expiryBucketKey(balance.lot?.expiresAt ?? null, now);
      const unitCost = balance.lot
        ? money(balance.lot.unitCost)
        : (lastCost.get(balance.product.id) ?? 0);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.lotCount += 1;
        bucket.value += Number(balance.qtyOnHand) * unitCost;
      }
    }
    const rows = (Object.keys(EXPIRY_LABELS) as ExpiryBucketKey[]).map((key) => {
      const bucket = buckets.get(key)!;
      return { bucket: bucket.bucket, lotCount: bucket.lotCount, value: round2(bucket.value) };
    });
    return {
      key: 'stok-deger-skt',
      title: 'Stok Değer / SKT',
      columns: [
        { key: 'bucket', label: 'SKT Aralığı', type: 'text' },
        { key: 'lotCount', label: 'Bakiye Adedi', type: 'number' },
        { key: 'value', label: 'Stok Değeri', type: 'money' },
      ],
      rows,
      totalColumns: ['lotCount', 'value'],
    };
  }

  // ── 7) Ürün tüketim ───────────────────────────────────────────────────────

  private async consumptionReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const lines = await this.prisma.stockMovementLine.findMany({
      where: {
        movement: {
          clinicId: auth.clinicId,
          kind: 'consumption',
          status: 'posted',
          postedAt: this.range(query),
          ...(branchId ? { branchId } : {}),
        },
      },
      select: {
        id: true,
        qty: true,
        unitCost: true,
        product: { select: { id: true, name: true, code: true } },
      },
    });
    const grouped = new Map<string, { code: string; product: string; qty: number; cost: number }>();
    for (const line of lines) {
      const key = line.product.id;
      const row = grouped.get(key) ?? {
        code: line.product.code,
        product: line.product.name,
        qty: 0,
        cost: 0,
      };
      row.qty += Math.abs(Number(line.qty));
      row.cost += Math.abs(Number(line.qty)) * money(line.unitCost);
      grouped.set(key, row);
    }
    const rows = [...grouped.values()]
      .map((r) => ({ ...r, qty: round2(r.qty * 1000) / 1000, cost: round2(r.cost) }))
      .sort((a, b) => b.cost - a.cost);
    return {
      key: 'urun-tuketim',
      title: 'Ürün Tüketim',
      columns: [
        { key: 'code', label: 'Ürün Kodu', type: 'text' },
        { key: 'product', label: 'Ürün', type: 'text' },
        { key: 'qty', label: 'Tüketim Miktarı', type: 'number' },
        { key: 'cost', label: 'Maliyet', type: 'money' },
      ],
      rows,
      totalColumns: ['qty', 'cost'],
    };
  }

  // ── 8) Tedarik satın alma ─────────────────────────────────────────────────

  private async purchasingReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const lines = await this.prisma.stockMovementLine.findMany({
      where: {
        movement: {
          clinicId: auth.clinicId,
          kind: 'goods_receipt',
          status: 'posted',
          postedAt: this.range(query),
          ...(branchId ? { branchId } : {}),
          supplierId: { not: null },
        },
      },
      select: {
        id: true,
        qty: true,
        unitCost: true,
        product: { select: { id: true, name: true } },
        movement: {
          select: { supplier: { select: { name: true } } },
        },
      },
    });
    const grouped = new Map<string, { supplier: string; productCount: number; qty: number; cost: number }>();
    for (const line of lines) {
      const supplierName = line.movement.supplier?.name ?? 'Bilinmeyen Tedarikçi';
      const row = grouped.get(supplierName) ?? {
        supplier: supplierName,
        productCount: 0,
        qty: 0,
        cost: 0,
      };
      row.productCount += 1;
      row.qty += Number(line.qty);
      row.cost += Number(line.qty) * money(line.unitCost);
      grouped.set(supplierName, row);
    }
    const rows = [...grouped.values()]
      .map((r) => ({ ...r, qty: round2(r.qty * 1000) / 1000, cost: round2(r.cost) }))
      .sort((a, b) => b.cost - a.cost);
    return {
      key: 'tedarik-satinalma',
      title: 'Tedarik Satın Alma',
      columns: [
        { key: 'supplier', label: 'Tedarikçi', type: 'text' },
        { key: 'productCount', label: 'Satır Adedi', type: 'number' },
        { key: 'qty', label: 'Miktar', type: 'number' },
        { key: 'cost', label: 'Maliyet', type: 'money' },
      ],
      rows,
      totalColumns: ['productCount', 'qty', 'cost'],
    };
  }

  // ── 9) Lab turnaround ─────────────────────────────────────────────────────

  private async labTurnaroundReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const orders = await this.prisma.labOrder.findMany({
      where: {
        clinicId: auth.clinicId,
        status: 'completed',
        orderedAt: this.range(query),
        ...(branchId ? { branchId } : {}),
      },
      select: {
        orderedAt: true,
        completedAt: true,
        test: { select: { id: true, name: true } },
      },
    });
    const grouped = new Map<string, { test: string; items: Array<{ orderedAt: Date; completedAt: Date | null }> }>();
    for (const order of orders) {
      const key = order.test.id;
      const row = grouped.get(key) ?? { test: order.test.name, items: [] };
      row.items.push({ orderedAt: order.orderedAt, completedAt: order.completedAt });
      grouped.set(key, row);
    }
    const rows = [...grouped.values()].map((r) => {
      const summary = turnaroundSummary(r.items);
      return {
        test: r.test,
        count: summary.count,
        avgHours: summary.avgHours,
        minHours: summary.minHours,
        maxHours: summary.maxHours,
      };
    });
    return {
      key: 'lab-turnaround',
      title: 'Lab Turnaround',
      columns: [
        { key: 'test', label: 'Test', type: 'text' },
        { key: 'count', label: 'Tamamlanan', type: 'number' },
        { key: 'avgHours', label: 'Ortalama (saat)', type: 'number' },
        { key: 'minHours', label: 'En Hızlı (saat)', type: 'number' },
        { key: 'maxHours', label: 'En Yavaş (saat)', type: 'number' },
      ],
      rows,
      totalColumns: ['count'],
    };
  }

  // ── 10) Yatış doluluk ─────────────────────────────────────────────────────

  private async occupancyReport(
    auth: AuthContext,
    query: ReportQueryDto,
    branchId: string | null,
  ): Promise<ReportTable> {
    const { start, end } = resolveDateRange(query.dateFrom, query.dateTo);
    const rangeEnd = end > new Date() ? new Date() : end;
    const [stays, kennelCount] = await Promise.all([
      this.prisma.hospitalStay.findMany({
        where: {
          clinicId: auth.clinicId,
          admittedAt: { lt: rangeEnd },
          OR: [{ dischargedAt: null }, { dischargedAt: { gte: start } }],
          ...(branchId ? { branchId } : {}),
        },
        select: { kennelId: true, admittedAt: true, dischargedAt: true },
      }),
      this.prisma.kennel.count({
        where: { clinicId: auth.clinicId, ...(branchId ? { branchId } : {}) },
      }),
    ]);
    const { kennelDays, capacityDays, rate } = occupancyRate({
      stays,
      kennelCount,
      rangeStart: start,
      rangeEnd,
    });
    return {
      key: 'yatis-doluluk',
      title: 'Yatış Doluluk',
      columns: [
        { key: 'metric', label: 'Gösterge', type: 'text' },
        { key: 'value', label: 'Değer', type: 'number' },
      ],
      rows: [
        { metric: 'Kennel Sayısı', value: kennelCount },
        { metric: 'Hasta-Gün', value: kennelDays },
        { metric: 'Kapasite-Gün', value: capacityDays },
        { metric: 'Doluluk Oranı (%)', value: rate },
      ],
      totalColumns: ['value'],
    };
  }

  // ── Dışa aktarma ──────────────────────────────────────────────────────────

  /**
   * Raporu dosyaya yazar: CSV/XLSX doğrudan buffer; PDF renderer. Kayıt
   * ReportExport'a yazılır ve REPORT_EXPORT denetimi düşer. İzin yoksa
   * controller 403 döndürür — dosya hiç üretilmez (kabul kriteri).
   */
  async exportReport(
    auth: AuthContext,
    request: AuthRequest,
    reportKey: string,
    format: ReportFormat,
    query: ReportQueryDto,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string; exportId: string; rowCount: number }> {
    const table = await this.runReport(auth, reportKey, query);
    const fileName = exportFileName(reportKey, format);
    let bytes: Buffer;
    let mimeType: string;
    if (format === 'csv') {
      bytes = buildCsv(table);
      mimeType = 'text/csv; charset=utf-8';
    } else if (format === 'xlsx') {
      bytes = buildXlsx(table);
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: auth.clinicId },
        select: { name: true },
      });
      const pdfBytes = await this.pdf.render({
        clinicName: clinic?.name ?? 'VetCore',
        documentNo: `RPR-${Date.now().toString().slice(-6)}`,
        title: table.title,
        generatedAt: new Date(),
        sections: [reportTableToPdfSection(table)],
      });
      bytes = Buffer.from(pdfBytes);
      mimeType = 'application/pdf';
    }
    const stored = await this.storage.save(bytes, fileName, mimeType);
    const reportExport = await this.prisma.reportExport.create({
      data: {
        clinicId: auth.clinicId,
        branchId: query.branchId ?? null,
        reportKey,
        format,
        requestedById: auth.staffId,
        dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : null,
        dateTo: query.dateTo ? new Date(`${query.dateTo}T00:00:00.000Z`) : null,
        rowCount: table.rows.length,
        fileSizeBytes: bytes.byteLength,
        storageKey: stored.storageKey,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: query.branchId ?? null,
      action: 'REPORT_EXPORT',
      entityType: 'report',
      entityId: reportExport.id,
      metadata: { reportKey, format, rowCount: table.rows.length, fileSizeBytes: bytes.byteLength },
      ip: (request['ip'] as string) ?? null,
      userAgent: (request['user-agent'] as string) ?? null,
    });
    return {
      buffer: bytes,
      fileName,
      mimeType,
      exportId: reportExport.id,
      rowCount: table.rows.length,
    };
  }

  /** Export kaydını indirir — yalnız kendi kliniğinin kaydı; izin controller'da. */
  async readExport(
    auth: AuthContext,
    exportId: string,
  ): Promise<{ stream: StreamableFile; fileName: string; mimeType: string }> {
    const record = await this.prisma.reportExport.findFirst({
      where: { id: exportId, clinicId: auth.clinicId },
    });
    if (!record?.storageKey) {
      throw new NotFoundException({ code: 'EXPORT_NOT_FOUND', message: 'Export bulunamadı' });
    }
    const stream = await this.storage.readStream(record.storageKey);
    if (!stream) {
      throw new NotFoundException({ code: 'EXPORT_FILE_MISSING', message: 'Dosya bulunamadı' });
    }
    const mimeByFormat: Record<string, string> = {
      csv: 'text/csv; charset=utf-8',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
    };
    const rows = await new Promise<Buffer[]>((resolve) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(chunks));
    });
    // StreamableFile buffer ile akıtılır (local adapter küçük dosyalar)
    const buffer = Buffer.concat(rows);
    return {
      stream: new StreamableFile(buffer),
      fileName: exportFileName(record.reportKey, record.format as ReportFormat, record.createdAt),
      mimeType: mimeByFormat[record.format] ?? 'application/octet-stream',
    };
  }

  /** Export defteri — klinik bazlı son dışa aktarmalar (UI listesi). */
  async listExports(auth: AuthContext, limit = 50) {
    const exports = await this.prisma.reportExport.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        reportKey: true,
        format: true,
        rowCount: true,
        fileSizeBytes: true,
        createdAt: true,
        branchId: true,
        requestedById: true,
      },
    });
    return { items: exports };
  }

  /** Para hücresi yardımcısı — PDF/web biçimleyicisi dışarıya da açılır. */
  static formatMoneyForDisplay(value: number): string {
    return formatTrMoney(value);
  }
}
