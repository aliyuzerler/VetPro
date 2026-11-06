/**
 * VetCore faz planı — prompts/phases/ klasöründeki 15 fazın paylaşılan tanımı.
 * Web durum sayfası ve dokümantasyon bu listeyi kullanır.
 * Yeni faz eklenirse prompts/phases/ ve docs/IMPLEMENTATION_STATUS.md de güncellenmelidir.
 */
export interface PhaseDefinition {
  /** 1'den başlayan faz numarası */
  id: number;
  /** prompts/phases/ dosya adı öneki */
  slug: string;
  /** Türkçe faz başlığı */
  title: string;
}

export const PHASES: readonly PhaseDefinition[] = [
  { id: 1, slug: 'foundation-build', title: 'Monorepo ve altyapı' },
  { id: 2, slug: 'design-shell-build', title: 'Tasarım sistemi ve uygulama kabukları' },
  { id: 3, slug: 'identity-clinic-build', title: 'Kimlik, personel, klinik ve şube kurulumu' },
  { id: 4, slug: 'owners-patients-build', title: 'Hasta sahibi ve hasta yönetimi' },
  { id: 5, slug: 'appointments-flowboard-build', title: 'Randevu takvimi ve klinik akış panosu' },
  { id: 6, slug: 'clinical-services-build', title: 'Muayene, SOAP ve hizmet kayıtları' },
  { id: 7, slug: 'inventory-build', title: 'Ürün, tedarikçi, parti ve stok yönetimi' },
  { id: 8, slug: 'service-stock-atomic-build', title: 'Hizmet → stok → ücret atomik işlemi' },
  { id: 9, slug: 'finance-build', title: 'Finans, kasa ve alacaklar' },
  { id: 10, slug: 'prescriptions-vaccines-build', title: 'Reçete, aşı ve hatırlatmalar' },
  { id: 11, slug: 'lab-surgery-hospital-build', title: 'Laboratuvar, cerrahi ve yatış' },
  { id: 12, slug: 'notifications-documents-build', title: 'Bildirimler, dokümanlar ve entegrasyonlar' },
  { id: 13, slug: 'mobile-offline-build', title: 'Mobil iş akışları ve çevrimdışı senkron' },
  { id: 14, slug: 'reports-import-export-backup-build', title: 'Raporlar, içe/dışa aktarım ve yedekleme' },
  { id: 15, slug: 'hardening-release-build', title: 'Güvenlik, performans, dağıtım ve sürüm' },
] as const;

/** Şu anda yürütülmekte olan faz. Faz tamamlandığında güncellenir. */
export const CURRENT_PHASE_ID = 1;

/** Uygulama sürümü — kök package.json ve CHANGELOG ile eşit tutulur. */
export const APP_VERSION = '0.1.0';

export function getPhase(id: number): PhaseDefinition | undefined {
  return PHASES.find((phase) => phase.id === id);
}
