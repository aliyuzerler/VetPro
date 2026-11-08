import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LocalPrivateStorageAdapter, type PrivateStorageAdapter } from '../files/private-storage';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  DOCUMENT_KIND_META,
  formatTrDate,
  formatTrDateTime,
  nextDocumentNo,
  toNumber,
  type DocumentBuildResult,
  type DocumentKind,
} from './documents.domain';
import { PdfRendererService } from './pdf.renderer';
import type { CreatePrintDocumentDto, ListPrintDocumentsQueryDto } from './documents.dto';

export const DOCUMENT_ERROR_CODES = {
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  REF_NOT_FOUND: 'DOCUMENT_REF_NOT_FOUND',
  KIND_REF_MISMATCH: 'DOCUMENT_KIND_REF_MISMATCH',
  SOURCE_NOT_READY: 'DOCUMENT_SOURCE_NOT_READY',
  BRANCH_SCOPE: 'BRANCH_SCOPE',
} as const;

/**
 * Belge servisi — Faz 12: 6 belge türü (muayene özeti, aşı kartı, reçete,
 * onam, lab raporu, taburculuk). Üretim anında kaynak verilerden donmuş
 * anlık görüntü (snapshot) çıkarılır; PDF bu görüntüden çizilir ve private
 * storage'a yazılır (dış URL yok — indirme yalnız API ucuyla, ADR-018 deseni).
 *
 * Kabul kriterleriyle bağı:
 * - Türkçe karakter + klinik marka: PdfRenderer gömülü DejaVu Sans kullanır,
 *   başlıkta klinik adı + şube bilgisi + BELGE numarası vardır.
 * - Reçete imza/authorized status: snapshot + PDF imza bloğu reçeteyi
 *   TASLAK/İMZALI ayrımıyla ve "Yetkili Veteriner Hekim" unvanıyla üretir.
 */
@Injectable()
export class DocumentsService {
  private readonly storage: PrivateStorageAdapter;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PdfRendererService) private readonly renderer: PdfRendererService,
  ) {
    // LocalPrivateStorageAdapter geliştirme/demo içindir (ADR-018); S3 uyumlu
    // adaptör aynı arayüzle değiştirilebilir. Storage key UUID.bin biçimindedir.
    this.storage = new LocalPrivateStorageAdapter();
  }

  private async recordAudit(input: {
    clinicId: string;
    staffId?: string | null;
    branchId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.audit.record(input, this.prisma);
  }

  private requireBranchAccess(auth: AuthContext, request: AuthRequest, branchId: string): void {
    if (request.branchId) {
      if (request.branchId !== branchId) {
        throw new ForbiddenException({
          code: DOCUMENT_ERROR_CODES.BRANCH_SCOPE,
          message: 'Şube kapsamı dışı istek',
        });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: DOCUMENT_ERROR_CODES.BRANCH_SCOPE,
        message: 'Şube erişiminiz yok',
      });
    }
  }

  private patientSummary(patient: {
    id: string;
    code: string;
    name: string;
    species: { name: string } | null;
    breed: { name: string } | null;
    gender: string | null;
    birthDate: Date | null;
  }) {
    return {
      id: patient.id,
      code: patient.code,
      name: patient.name,
      species: patient.species?.name ?? null,
      breed: patient.breed?.name ?? null,
      gender: patient.gender ?? null,
      birthDate: patient.birthDate ? formatTrDate(patient.birthDate) : null,
    };
  }

  // ------------------------------------------------------------ snapshot üreticileri

  private async buildExamSummary(encounterId: string): Promise<DocumentBuildResult> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: { include: { species: true, breed: true, owner: true } },
        veterinarian: true,
        branch: true,
        vitals: { orderBy: { measuredAt: 'desc' }, take: 10 },
        diagnoses: true,
        serviceRecords: { include: { lines: { include: { service: true } } } },
      },
    });
    if (!encounter) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.REF_NOT_FOUND,
        message: 'Muayene kaydı bulunamadı',
      });
    }
    const soapRows = [
      { label: 'Subjektif (S)', value: encounter.subjective ?? '—' },
      { label: 'Objektif (O)', value: encounter.objective ?? '—' },
      { label: 'Değerlendirme (A)', value: encounter.assessment ?? '—' },
      { label: 'Plan (P)', value: encounter.plan ?? '—' },
    ];
    const vitals = encounter.vitals.map((v) => ({
      kind: v.kind,
      value: `${toNumber(v.value) ?? '—'} ${v.unit ?? ''}`.trim(),
      measuredAt: formatTrDateTime(v.measuredAt),
    }));
    const services = encounter.serviceRecords.flatMap((record) =>
      record.lines.map((line) => ({
        service: line.service?.name ?? 'Hizmet',
        qty: String(toNumber(line.qty) ?? '—'),
        unitPrice: `${toNumber(line.unitPrice) ?? '—'} ₺`,
      })),
    );
    return {
      title: 'Muayene Özeti',
      sections: [
        {
          type: 'keyValue',
          title: 'Hasta ve Muayene Bilgileri',
          rows: [
            { label: 'Hasta', value: `${encounter.patient.name} (${encounter.patient.code})` },
            {
              label: 'Tür / Irk',
              value:
                `${encounter.patient.species?.name ?? '—'} / ${encounter.patient.breed?.name ?? '—'}`,
            },
            {
              label: 'Sahibi',
              value: `${encounter.patient.owner.firstName} ${encounter.patient.owner.lastName}`,
            },
            { label: 'Veteriner', value: `${encounter.veterinarian.firstName} ${encounter.veterinarian.lastName}` },
            { label: 'Muayene Zamanı', value: formatTrDateTime(encounter.startedAt) },
            { label: 'Durum', value: encounter.status === 'signed' ? 'İmzalı' : encounter.status === 'draft' ? 'Taslak' : encounter.status },
          ],
        },
        { type: 'keyValue', title: 'SOAP Kaydı', rows: soapRows },
        ...(vitals.length > 0
          ? [
              {
                type: 'table' as const,
                title: 'Vital Bulgular',
                columns: ['Bulgu', 'Değer', 'Zaman'],
                widths: [2, 2, 2],
                rows: vitals.map((v) => [v.kind, v.value, v.measuredAt]),
              },
            ]
          : []),
        ...(encounter.diagnoses.length > 0
          ? [
              {
                type: 'paragraph' as const,
                title: 'Tanılar',
                text: encounter.diagnoses
                  .map((d) => `${d.name}${d.code ? ` (${d.code})` : ''}${d.kind ? ` — ${d.kind}` : ''}`)
                  .join('\n'),
              },
            ]
          : []),
        ...(services.length > 0
          ? [
              {
                type: 'table' as const,
                title: 'Uygulanan Hizmetler',
                columns: ['Hizmet', 'Miktar', 'Birim Fiyat'],
                widths: [4, 1.2, 1.8],
                rows: services.map((s) => [s.service, s.qty, s.unitPrice]),
              },
            ]
          : []),
      ],
      snapshot: {
        kind: 'exam_summary',
        encounterId: encounter.id,
        status: encounter.status,
        patient: this.patientSummary(encounter.patient),
        veterinarian: `${encounter.veterinarian.firstName} ${encounter.veterinarian.lastName}`,
        soap: {
          subjective: encounter.subjective,
          objective: encounter.objective,
          assessment: encounter.assessment,
          plan: encounter.plan,
        },
        vitalCount: vitals.length,
        diagnosisCount: encounter.diagnoses.length,
        serviceCount: services.length,
      },
    };
  }

  private async buildVaccineCard(patientId: string): Promise<DocumentBuildResult> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { species: true, breed: true, owner: true, vaccineEvents: {
        include: { protocol: true, product: true, administeredBy: true },
        orderBy: { administeredAt: 'desc' },
      } },
    });
    if (!patient) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.REF_NOT_FOUND,
        message: 'Hasta bulunamadı',
      });
    }
    const rows = patient.vaccineEvents.map((event) => [
      event.protocol?.name ?? event.product?.name ?? 'Aşı',
      formatTrDate(event.administeredAt),
      event.doseLabel ?? '—',
      event.lotCode ?? '—',
      event.expiresAt ? formatTrDate(event.expiresAt) : '—',
      `${event.administeredBy.firstName} ${event.administeredBy.lastName}`,
    ]);
    return {
      title: 'Aşı Kartı',
      sections: [
        {
          type: 'keyValue',
          title: 'Hasta Bilgileri',
          rows: [
            { label: 'Hasta', value: `${patient.name} (${patient.code})` },
            { label: 'Tür / Irk', value: `${patient.species?.name ?? '—'} / ${patient.breed?.name ?? '—'}` },
            { label: 'Sahibi', value: `${patient.owner.firstName} ${patient.owner.lastName}` },
            { label: 'Doğum Tarihi', value: patient.birthDate ? formatTrDate(patient.birthDate) : '—' },
          ],
        },
        {
          type: 'table',
          title: 'Aşı Kayıtları',
          columns: ['Aşı', 'Tarih', 'Doz', 'Parti', 'SKT', 'Veteriner'],
          widths: [2.4, 1.4, 1, 1.4, 1.4, 2],
          rows: rows.length > 0 ? rows : [['Kayıt yok', '—', '—', '—', '—', '—']],
        },
      ],
      snapshot: {
        kind: 'vaccine_card',
        patientId: patient.id,
        patient: this.patientSummary(patient),
        vaccineCount: patient.vaccineEvents.length,
      },
    };
  }

  private async buildPrescription(prescriptionId: string): Promise<DocumentBuildResult> {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        patient: { include: { species: true, breed: true, owner: true } },
        encounter: true,
        veterinarian: true,
        signedBy: true,
        lines: { include: { product: true, dispenses: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!prescription) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.REF_NOT_FOUND,
        message: 'Reçete bulunamadı',
      });
    }
    const signed = prescription.status === 'signed';
    const lines = prescription.lines.map((line) => [
      line.drugName || line.product?.name || '—',
      line.doseAmount ? `${toNumber(line.doseAmount)} ${line.doseUnit ?? ''}`.trim() : '—',
      line.route,
      line.frequency,
      line.durationDays ? `${line.durationDays} gün` : '—',
      `${toNumber(line.quantity)} ${line.quantityUnit}`,
      line.instructions ?? '—',
    ]);
    // Kabul kriteri: imza/authorized status doğru gösterilmeli.
    const authorizedStatus = signed
      ? 'İmzalı — Yetkili Veteriner Hekim onaylı'
      : prescription.status === 'voided'
        ? 'İptal Edilmiş'
        : 'TASLAK — İMZALANMAMIŞ';
    const signature = signed && prescription.signedBy
      ? {
          veterinarianName: `${prescription.signedBy.firstName} ${prescription.signedBy.lastName}`,
          veterinarianTitle: prescription.signedBy.title ?? 'Yetkili Veteriner Hekim',
          signedAt: prescription.signedAt ? formatTrDateTime(prescription.signedAt) : '—',
          authorizedStatus,
        }
      : undefined;
    return {
      title: 'Reçete',
      sections: [
        {
          type: 'keyValue',
          title: 'Reçete Bilgileri',
          rows: [
            { label: 'Reçete No', value: prescription.code ?? '— (taslak)' },
            { label: 'Hasta', value: `${prescription.patient.name} (${prescription.patient.code})` },
            {
              label: 'Sahibi',
              value: `${prescription.patient.owner.firstName} ${prescription.patient.owner.lastName}`,
            },
            {
              label: 'Yazan Veteriner',
              value: `${prescription.veterinarian.firstName} ${prescription.veterinarian.lastName}`,
            },
            { label: 'Durum', value: authorizedStatus },
            { label: 'Oluşturma', value: formatTrDateTime(prescription.createdAt) },
          ],
        },
        {
          type: 'table',
          title: 'İlaç Satırları',
          columns: ['İlaç', 'Doz', 'Yol', 'Sıklık', 'Süre', 'Miktar', 'Kullanım'],
          widths: [2.2, 1.3, 1.1, 1.4, 1, 1.4, 2.4],
          rows: lines.length > 0 ? lines : [['—', '—', '—', '—', '—', '—', '—']],
        },
      ],
      watermark: signed ? undefined : 'TASLAK — İMZALANMAMIŞ',
      signature,
      snapshot: {
        kind: 'prescription',
        prescriptionId: prescription.id,
        code: prescription.code,
        status: prescription.status,
        authorizedStatus,
        patient: this.patientSummary(prescription.patient),
        veterinarian: `${prescription.veterinarian.firstName} ${prescription.veterinarian.lastName}`,
        signedAt: prescription.signedAt?.toISOString() ?? null,
        signedByName: prescription.signedBy
          ? `${prescription.signedBy.firstName} ${prescription.signedBy.lastName}`
          : null,
        lineCount: prescription.lines.length,
      },
    };
  }

  private async buildConsent(ownerId: string): Promise<DocumentBuildResult> {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      include: { contacts: true, consents: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!owner) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.REF_NOT_FOUND,
        message: 'Hasta sahibi bulunamadı',
      });
    }
    const labels: Record<string, string> = {
      kvkk: 'KVKK Aydınlatma ve Açık Rıza',
      sms: 'SMS Bildirimi',
      email: 'E-posta Bildirimi',
      whatsapp: 'WhatsApp Bildirimi',
      marketing: 'Pazarlama İletişimi',
    };
    const rows = owner.consents.map((consent) => [
      labels[consent.kind] ?? consent.kind,
      consent.granted ? 'Verildi' : 'Verilmedi',
      consent.grantedAt ? formatTrDateTime(consent.grantedAt) : '—',
      consent.revokedAt ? formatTrDateTime(consent.revokedAt) : '—',
    ]);
    const consentText =
      'İşbu form, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hasta sahibinin ' +
      'iletişim bilgilerinin işlenmesine ve bildirim kanallarının kullanılmasına ilişkin açık rızasını ' +
      'belgeler. Rıza dilediği zaman geri alınabilir; geri alma bildirimi klinik kayıtlarına işlenir.';
    return {
      title: 'Onam Formu',
      sections: [
        {
          type: 'keyValue',
          title: 'Hasta Sahibi',
          rows: [
            { label: 'Ad Soyad', value: `${owner.firstName} ${owner.lastName}` },
            { label: 'Telefon', value: owner.contacts.find((c) => c.kind === 'phone')?.value ?? '—' },
            { label: 'E-posta', value: owner.contacts.find((c) => c.kind === 'email')?.value ?? '—' },
          ],
        },
        { type: 'paragraph', title: 'Aydınlatma Metni', text: consentText },
        {
          type: 'table',
          title: 'Rıza Durumları',
          columns: ['Rıza Türü', 'Durum', 'Verilme', 'Geri Alma'],
          widths: [3, 1.4, 2, 2],
          rows: rows.length > 0 ? rows : [['Kayıt yok', '—', '—', '—']],
        },
      ],
      snapshot: {
        kind: 'consent',
        ownerId: owner.id,
        ownerName: `${owner.firstName} ${owner.lastName}`,
        consentCount: owner.consents.length,
        consents: owner.consents.map((c) => ({
          kind: c.kind,
          granted: c.granted,
          revokedAt: c.revokedAt?.toISOString() ?? null,
        })),
      },
    };
  }

  private async buildLabReport(labOrderId: string): Promise<DocumentBuildResult> {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        patient: { include: { species: true, breed: true, owner: true } },
        test: true,
        veterinarian: true,
        samples: true,
        results: true,
      },
    });
    if (!order) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.REF_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    const statusLabels: Record<string, string> = {
      ordered: 'İstendi',
      sample_collected: 'Numune Alındı',
      in_progress: 'Analizde',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
    };
    const resultRows = order.results.map((result) => {
      const value = toNumber(result.value);
      return [
        order.test.name,
        value !== null ? String(value) : (result.valueText ?? '—'),
        `${order.test.unit ?? ''} ${result.flag ? `(${result.flag})` : ''}`.trim(),
        result.isCritical ? 'KRİTİK' : 'Normal',
        formatTrDateTime(result.resultedAt),
      ];
    });
    return {
      title: 'Lab Raporu',
      sections: [
        {
          type: 'keyValue',
          title: 'Sipariş Bilgileri',
          rows: [
            { label: 'Test', value: `${order.test.name} (${order.test.code})` },
            { label: 'Hasta', value: `${order.patient.name} (${order.patient.code})` },
            {
              label: 'Sahibi',
              value: `${order.patient.owner.firstName} ${order.patient.owner.lastName}`,
            },
            { label: 'Veteriner', value: `${order.veterinarian.firstName} ${order.veterinarian.lastName}` },
            { label: 'Durum', value: statusLabels[order.status] ?? order.status },
            { label: 'Numune Kodu', value: order.samples[0]?.labelCode ?? '—' },
          ],
        },
        {
          type: 'table',
          title: 'Sonuçlar',
          columns: ['Test', 'Sonuç', 'Birim/İşaret', 'Kritiklik', 'Rapor Zamanı'],
          widths: [2.6, 1.4, 1.6, 1.2, 2],
          rows: resultRows.length > 0 ? resultRows : [['—', '—', '—', '—', '—']],
        },
      ],
      snapshot: {
        kind: 'lab_report',
        labOrderId: order.id,
        status: order.status,
        testCode: order.test.code,
        patient: this.patientSummary(order.patient),
        resultCount: order.results.length,
        hasCritical: order.results.some((r) => r.isCritical),
      },
    };
  }

  private async buildDischarge(stayId: string): Promise<DocumentBuildResult> {
    const stay = await this.prisma.hospitalStay.findUnique({
      where: { id: stayId },
      include: {
        patient: { include: { species: true, breed: true, owner: true } },
        kennel: true,
        veterinarian: true,
        observations: { orderBy: { observedAt: 'desc' }, take: 5 },
        medications: true,
      },
    });
    if (!stay) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.REF_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    if (!stay.dischargedAt || !stay.dischargeSummary) {
      throw new BadRequestException({
        code: DOCUMENT_ERROR_CODES.SOURCE_NOT_READY,
        message: 'Taburculuk özeti yalnız taburcu edilmiş yatış için üretilir',
      });
    }
    return {
      title: 'Taburculuk Özeti',
      sections: [
        {
          type: 'keyValue',
          title: 'Yatış Bilgileri',
          rows: [
            { label: 'Hasta', value: `${stay.patient.name} (${stay.patient.code})` },
            {
              label: 'Sahibi',
              value: `${stay.patient.owner.firstName} ${stay.patient.owner.lastName}`,
            },
            { label: 'Veteriner', value: `${stay.veterinarian.firstName} ${stay.veterinarian.lastName}` },
            { label: 'Kabul', value: formatTrDateTime(stay.admittedAt) },
            { label: 'Taburculuk', value: formatTrDateTime(stay.dischargedAt) },
            { label: 'Kafes', value: stay.kennel.code },
            { label: 'Kabul Gerekçesi', value: stay.admissionReason },
          ],
        },
        { type: 'paragraph', title: 'Taburculuk Özeti', text: stay.dischargeSummary },
        {
          type: 'table',
          title: 'Son Gözlemler',
          columns: ['Tür', 'Not', 'Zaman'],
          widths: [1.4, 5, 2.2],
          rows:
            stay.observations.map((o) => [
              o.kind,
              o.notes ?? '—',
              formatTrDateTime(o.observedAt),
            ]),
        },
        ...(stay.medications.length > 0
          ? [
              {
                type: 'paragraph' as const,
                title: 'Yatış İçi Uygulanan Tedaviler',
                text: stay.medications
                  .map((m) => `${m.dose ?? 'tedavi'} — ${formatTrDateTime(m.administeredAt)}`)
                  .join('\n'),
              },
            ]
          : []),
      ],
      snapshot: {
        kind: 'discharge',
        hospitalStayId: stay.id,
        patient: this.patientSummary(stay.patient),
        admittedAt: stay.admittedAt.toISOString(),
        dischargedAt: stay.dischargedAt.toISOString(),
        observationCount: stay.observations.length,
        medicationCount: stay.medications.length,
      },
    };
  }

  private buildFor(kind: DocumentKind, refId: string): Promise<DocumentBuildResult> {
    switch (kind) {
      case 'exam_summary':
        return this.buildExamSummary(refId);
      case 'vaccine_card':
        return this.buildVaccineCard(refId);
      case 'prescription':
        return this.buildPrescription(refId);
      case 'consent':
        return this.buildConsent(refId);
      case 'lab_report':
        return this.buildLabReport(refId);
      case 'discharge':
        return this.buildDischarge(refId);
      default: {
        const exhaustive: never = kind;
        throw new BadRequestException({
          code: DOCUMENT_ERROR_CODES.KIND_REF_MISMATCH,
          message: `Bilinmeyen belge türü: ${String(exhaustive)}`,
        });
      }
    }
  }

  // ------------------------------------------------------------ üretim ve okuma

  async createPrintDocument(auth: AuthContext, dto: CreatePrintDocumentDto, request: AuthRequest) {
    const kind = dto.kind as DocumentKind;
    const meta = DOCUMENT_KIND_META[kind];
    const build = await this.buildFor(kind, dto.refId);
    const snapshot = build.snapshot as {
      patient?: { id: string } | null;
      ownerId?: string;
      owner?: { id: string } | null;
    };

    // Şube kapsamı: kaynak kaydın şubesi üzerinden doğrulanır.
    let branchId = request.branchId ?? '';
    let branchName: string | null = null;
    let branchAddress: string | null = null;
    let branchPhone: string | null = null;
    if (dto.kind === 'prescription' && 'prescriptionId' in build.snapshot) {
      const prescription = await this.prisma.prescription.findUnique({
        where: { id: dto.refId },
        select: { branchId: true },
      });
      branchId = prescription?.branchId ?? branchId;
    } else if (dto.kind === 'exam_summary' && 'encounterId' in build.snapshot) {
      const encounter = await this.prisma.encounter.findUnique({
        where: { id: dto.refId },
        select: { branchId: true },
      });
      branchId = encounter?.branchId ?? branchId;
    } else if (dto.kind === 'lab_report' && 'labOrderId' in build.snapshot) {
      const order = await this.prisma.labOrder.findUnique({
        where: { id: dto.refId },
        select: { branchId: true },
      });
      branchId = order?.branchId ?? branchId;
    } else if (dto.kind === 'discharge' && 'hospitalStayId' in build.snapshot) {
      const stay = await this.prisma.hospitalStay.findUnique({
        where: { id: dto.refId },
        select: { branchId: true },
      });
      branchId = stay?.branchId ?? branchId;
    } else if (dto.kind === 'vaccine_card' && snapshot.patient) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: snapshot.patient.id },
        select: { branchId: true },
      });
      branchId = patient?.branchId ?? branchId;
    }
    // consent: sahip klinik kapsamlıdır → istek şubesi kullanılır.
    if (request.branchId) branchId = request.branchId;
    if (!branchId) {
      throw new BadRequestException({
        code: DOCUMENT_ERROR_CODES.KIND_REF_MISMATCH,
        message: 'Şube çözümlenemedi — X-Branch-Id gönderin',
      });
    }
    this.requireBranchAccess(auth, request, branchId);
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    branchName = branch?.name ?? null;
    branchAddress = branch?.address ?? null;
    branchPhone = branch?.phone ?? null;

    const clinic = await this.prisma.clinic.findUnique({ where: { id: auth.clinicId } });
    // Klinik içinde sıralı numara: son BELGE kaydından ilerlet (unique kısıt
    // yarışta güvence verir; demo ölçeğinde çakışma olasılığı düşüktür).
    const latest = await this.prisma.printDocument.findFirst({
      where: { clinicId: auth.clinicId },
      orderBy: { createdAt: 'desc' },
      select: { documentNo: true },
    });
    const documentNo = nextDocumentNo(latest?.documentNo);

    const pdfBytes = await this.renderer.render({
      clinicName: clinic?.name ?? 'VetCore',
      branchName,
      branchAddress,
      branchPhone,
      documentNo,
      title: build.title,
      generatedAt: new Date(),
      sections: build.sections,
      watermark: build.watermark,
      signature: build.signature,
    });

    const stored = await this.storage.save(
      Buffer.from(pdfBytes),
      `${documentNo}.pdf`,
      'application/pdf',
    );

    const created = await this.prisma.printDocument.create({
      data: {
        clinicId: auth.clinicId,
        branchId,
        kind,
        documentNo,
        title: build.title,
        patientId: snapshot.patient?.id ?? null,
        ownerId: snapshot.ownerId ?? snapshot.owner?.id ?? null,
        encounterId: kind === 'exam_summary' ? dto.refId : null,
        prescriptionId: kind === 'prescription' ? dto.refId : null,
        labOrderId: kind === 'lab_report' ? dto.refId : null,
        hospitalStayId: kind === 'discharge' ? dto.refId : null,
        snapshot: build.snapshot as never,
        storageKey: stored.storageKey,
        fileMime: 'application/pdf',
        fileSize: stored.sizeBytes,
        createdById: auth.staffId as string,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'PRINT_DOCUMENT_CREATED',
      entityType: 'PrintDocument',
      entityId: created.id,
      metadata: { kind, documentNo, refId: dto.refId, fileSize: stored.sizeBytes },
    });
    return {
      id: created.id,
      documentNo,
      kind,
      title: created.title,
      fileSize: created.fileSize,
      authorizedStatus: (build.snapshot as { authorizedStatus?: string }).authorizedStatus ?? null,
      createdAt: created.createdAt.toISOString(),
      downloadUrl: `/api/v1/documents/${created.id}/pdf`,
    };
  }

  async listDocuments(auth: AuthContext, query: ListPrintDocumentsQueryDto, request: AuthRequest) {
    const documents = await this.prisma.printDocument.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(request.branchId ? { branchId: request.branchId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      include: {
        patient: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 50, 100),
      skip: query.skip ?? 0,
    });
    const total = await this.prisma.printDocument.count({
      where: {
        clinicId: auth.clinicId,
        ...(request.branchId ? { branchId: request.branchId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
    });
    return {
      items: documents.map((doc) => ({
        id: doc.id,
        documentNo: doc.documentNo,
        kind: doc.kind,
        title: doc.title,
        patient: doc.patient ? { id: doc.patient.id, name: doc.patient.name, code: doc.patient.code } : null,
        createdBy: doc.createdBy
          ? `${doc.createdBy.firstName} ${doc.createdBy.lastName}`
          : null,
        fileSize: doc.fileSize,
        createdAt: doc.createdAt.toISOString(),
        downloadUrl: `/api/v1/documents/${doc.id}/pdf`,
      })),
      total,
    };
  }

  async getDocument(auth: AuthContext, id: string, request: AuthRequest) {
    const doc = await this.prisma.printDocument.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!doc || doc.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND,
        message: 'Belge bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, doc.branchId);
    return {
      id: doc.id,
      documentNo: doc.documentNo,
      kind: doc.kind,
      title: doc.title,
      patient: doc.patient ? { id: doc.patient.id, name: doc.patient.name, code: doc.patient.code } : null,
      createdBy: doc.createdBy ? `${doc.createdBy.firstName} ${doc.createdBy.lastName}` : null,
      snapshot: doc.snapshot,
      fileSize: doc.fileSize,
      createdAt: doc.createdAt.toISOString(),
      downloadUrl: `/api/v1/documents/${doc.id}/pdf`,
    };
  }

  async readPdf(auth: AuthContext, id: string, request: AuthRequest) {
    const doc = await this.prisma.printDocument.findUnique({ where: { id } });
    if (!doc || doc.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND,
        message: 'Belge bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, doc.branchId);
    const stream = await this.storage.readStream(doc.storageKey);
    if (!stream) {
      throw new NotFoundException({
        code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND,
        message: 'Belge içeriği bulunamadı',
      });
    }
    return {
      stream,
      fileName: `${doc.documentNo}-${doc.kind}.pdf`,
      mimeType: doc.fileMime,
    };
  }
}

/** Decimal serileştirme yardımcıları dışa açık değildir; sadece dahili kullanım. */
export type { DocumentKind };
