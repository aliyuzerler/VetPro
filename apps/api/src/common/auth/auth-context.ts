/**
 * Kimlik bağlamı — JwtAuthGuard her isteğe ekler; diğer guard ve servisler okur.
 * İzinler ve şubeler her istekte veritabanından taze yüklenir: yetki değişikliği
 * anında etkin olur (token içinde taşınmaz).
 */
export type AuthContext = {
  staffId: string;
  clinicId: string;
  /// Bağlı oturum (Session.id) — refresh rotasyonu ve aktif şube güncellemesi için.
  sessionId: string;
  /// Oturumun aktif şubesi; null ise seçilmemiş/tüm şubeler modu.
  activeBranchId: string | null;
  /// Rolü tüm şubelere açık personel (ör. Klinik Yöneticisi).
  allBranches: boolean;
  /// StaffBranch kayıtlarından erişilebilir şube kimlikleri.
  branchIds: string[];
  /// Rollerin birleşim izin anahtarları.
  permissions: string[];
};

export type AuthRequest = {
  auth?: AuthContext;
  branchId?: string;
} & Record<string, unknown>;
