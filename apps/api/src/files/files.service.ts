import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth/auth-context';
import { LocalPrivateStorageAdapter, type PrivateStorageAdapter } from './private-storage';

/** MIME beyaz listesi — çalıştırılabilir/aktif içerik kabul edilmez. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024); // 10 MB

/** Dosya türü çıkarımı: MIME + ad uzantısından (görüntüleme etiketi için). */
function detectKind(mimeType: string): 'document' | 'image' | 'lab-result' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'document';
  return 'other';
}

/**
 * Hasta dosyaları — private storage arkasında (kabul kriteri: dosya URL'si
 * yetkisiz kullanıcıya erişim vermez). Metadata listeler; içerik yalnızca
 * yetki + şube kapsamı doğrulayan indirme ucuyla akar.
 */
@Injectable()
export class FilesService {
  private readonly storage: PrivateStorageAdapter;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject('PRIVATE_STORAGE_ADAPTER') storage?: PrivateStorageAdapter,
  ) {
    this.storage = storage ?? new LocalPrivateStorageAdapter();
  }

  /** Hasta erişim yetkisi: şube kapsamı (hastalar şube kapsamlıdır). */
  private async assertPatientAccess(auth: AuthContext, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, code: true, name: true, archivedAt: true, ownerId: true },
    });
    if (!patient) throw new NotFoundException('Hasta bulunamadı');
    if (!auth.allBranches && !auth.branchIds.includes(patient.branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
    return patient;
  }

  async listForPatient(auth: AuthContext, patientId: string) {
    await this.assertPatientAccess(auth, patientId);
    // storage_key bilinçli olarak döndürülmez — yalnızca indirme ucu kullanır.
    return this.prisma.fileAsset.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        kind: true,
        createdAt: true,
        uploadedByStaffId: true,
      },
    });
  }

  async upload(
    auth: AuthContext,
    patientId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    const patient = await this.assertPatientAccess(auth, patientId);
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `Dosya en fazla ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB olabilir`,
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(`Desteklenmeyen dosya türü: ${file.mimetype}`);
    }
    const safeName = file.originalname.replace(/[\\/\r\n]/g, '_').slice(0, 160);
    const stored = await this.storage.save(file.buffer, safeName, file.mimetype);
    const asset = await this.prisma.fileAsset.create({
      data: {
        clinicId: auth.clinicId,
        patientId,
        uploadedByStaffId: auth.staffId,
        fileName: safeName,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        kind: detectKind(file.mimetype),
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        kind: true,
        createdAt: true,
        uploadedByStaffId: true,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: patient.branchId,
      action: 'patient.file.upload',
      entityType: 'patient',
      entityId: patientId,
      metadata: {
        code: patient.code,
        fileName: safeName,
        sizeBytes: stored.sizeBytes,
        kind: asset.kind,
      },
    });
    return asset;
  }

  /** İndirme: yetki + şube kapsamı doğrulanır; dosya akışla döner (URL paylaşılmaz). */
  async download(auth: AuthContext, fileAssetId: string) {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id: fileAssetId },
      include: {
        patient: { select: { id: true, clinicId: true, branchId: true, code: true, name: true } },
      },
    });
    if (!asset || asset.patient.clinicId !== auth.clinicId) {
      throw new NotFoundException('Dosya bulunamadı');
    }
    if (!auth.allBranches && !auth.branchIds.includes(asset.patient.branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
    const stream = await this.storage.readStream(asset.storageKey);
    if (!stream) throw new NotFoundException('Dosya içeriği bulunamadı');
    return {
      stream,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      patientCode: asset.patient.code,
    };
  }
}
