/**
 * İzin kataloğu — tek kaynak (seed ve API test fikstürü buradan okur).
 * Yeni izinler faza göre buraya eklenir; gruplar: clinical | inventory | finance |
 * reports | audit | settings | staff.
 */
export const PERMISSIONS = [
  {
    key: 'clinical.sign',
    group: 'clinical',
    name: 'Muayene imzası',
    description: 'Karar ve SOAP kayıtlarını imzalar',
  },
  {
    key: 'inventory.adjust',
    group: 'inventory',
    name: 'Stok düzeltme',
    description: 'Sayım farkı ve manuel stok düzeltmesi yapar',
  },
  {
    key: 'finance.refund',
    group: 'finance',
    name: 'İade',
    description: 'Tahsilat iadesi oluşturur',
  },
  {
    key: 'reports.export',
    group: 'reports',
    name: 'Rapor dışa aktarma',
    description: 'Raporları dışa aktarır',
  },
  {
    key: 'audit.view',
    group: 'audit',
    name: 'Denetim kaydı',
    description: 'Denetim defterini görüntüler',
  },
  {
    key: 'settings.manage',
    group: 'settings',
    name: 'Klinik ayarları',
    description: 'Klinik profili ve ayarları düzenler',
  },
  {
    key: 'branch.manage',
    group: 'settings',
    name: 'Şube yönetimi',
    description: 'Şube kayıtlarını yönetir',
  },
  {
    key: 'staff.manage',
    group: 'staff',
    name: 'Personel yönetimi',
    description: 'Personel, rol ve şube atamalarını yönetir',
  },
  {
    key: 'roles.manage',
    group: 'staff',
    name: 'Rol yönetimi',
    description: 'Rolleri ve izin matrisini düzenler',
  },
  {
    key: 'room.manage',
    group: 'settings',
    name: 'Oda yönetimi',
    description: 'Muayene/operasyon odalarını yönetir',
  },
  {
    key: 'warehouse.manage',
    group: 'inventory',
    name: 'Depo yönetimi',
    description: 'Depo tanımlarını yönetir',
  },
  {
    key: 'owner.manage',
    group: 'clinical',
    name: 'Hasta sahibi yönetimi',
    description: 'Sahip kayıtlarını oluşturur, arşivler ve birleştirir',
  },
  {
    key: 'patient.manage',
    group: 'clinical',
    name: 'Hasta kaydı yönetimi',
    description: 'Hasta, uyarı, kilo ve dosya kayıtlarını yönetir',
  },
  {
    key: 'master.manage',
    group: 'settings',
    name: 'Master veri yönetimi',
    description: 'Tür ve ırk kataloğunu yönetir',
  },
  {
    key: 'appointment.manage',
    group: 'clinical',
    name: 'Randevu yönetimi',
    description: 'Randevu, çalışma saati ve bekleme listesi kayıtlarını yönetir',
  },
  {
    key: 'appointment.override',
    group: 'clinical',
    name: 'Randevu kural istisnası',
    description: 'Çalışma saatleri dışı randevuyu gerekçe ile onaylar',
  },
] as const;
