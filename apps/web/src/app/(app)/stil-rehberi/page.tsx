'use client';

import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { ACCENT_COLORS, BRAND_COLORS, NEUTRAL_COLORS, STATUS_COLORS } from '@vetcore/ui-tokens';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusChip, type StatusTone } from '@/components/design-system/status-chip';
import { EmptyState, ErrorState, UnauthorizedState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';

/**
 * Tasarım sistemi hikâye sayfası — Faz 02 kabul kriteri:
 * "Loading/empty/error/unauthorized durumları demo component storylerinde görülmeli."
 * Tüm örnekler design/tokens.json kaynaklı tokenları kullanır; hardcoded renk yoktur.
 */

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-1 rounded-md border border-border bg-card p-2">
      <span
        className="h-9 w-full rounded-sm border border-border"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />
      <span className="font-mono text-[11px] font-medium">{name}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{hex}</span>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-card" id={id}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export default function StyleGuidePage() {
  const { toast } = useToast();
  const [demoErrorShown, setDemoErrorShown] = useState(false);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight">Tasarım Sistemi</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          VetCore bileşen hikâyeleri. Kaynak: <span className="font-mono">design/tokens.json</span>{' '}
          ve <span className="font-mono">design/DESIGN_SYSTEM.md</span>. Tüm metinler Türkçe klinik
          terminolojisiyle yazılmıştır: Hasta (hayvan), Hasta Sahibi (müşteri değil).
        </p>
      </header>

      {/* 1 — Renkler */}
      <Section
        id="renkler"
        title="Renk tokenları"
        description="Marka derin teal, yumuşak nane yüzeyleri, sıcak koral vurgu; durum renkleri yalnızca durum semantiği içindir."
      >
        <div className="flex flex-wrap gap-2">
          {Object.entries(BRAND_COLORS).map(([step, hex]) => (
            <Swatch key={`brand-${step}`} name={`brand.${step}`} hex={hex} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(NEUTRAL_COLORS).map(([step, hex]) => (
            <Swatch key={`neutral-${step}`} name={`neutral.${step}`} hex={hex} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_COLORS).map(([name, hex]) => (
            <Swatch key={`status-${name}`} name={`status.${name}`} hex={hex} />
          ))}
          <Swatch name="accent.600" hex={ACCENT_COLORS[600]} />
          <Swatch name="accent.100" hex={ACCENT_COLORS[100]} />
        </div>
      </Section>

      {/* 2 — Tipografi */}
      <Section
        id="tipografi"
        title="Tipografi ve Türkçe karakterler"
        description="Inter; sayfa başlığı 28–32px, bölüm başlığı 18–20px, gövde 14–15px, yoğun tablo en az 13px, yardımcı metin 12px. Para/miktar/saat için tabular numerals."
      >
        <div className="flex flex-col gap-2">
          <span className="text-[32px] font-bold leading-tight tracking-tight">
            H1 — Klinik Kayıt (32px)
          </span>
          <span className="text-2xl font-bold leading-tight">H2 — Muayene Özeti (24px)</span>
          <span className="text-lg font-semibold leading-tight">H3 — Vital Bulgular (18px)</span>
          <span className="text-sm leading-relaxed">
            Gövde metni (14px) — Hasta sahibi Ayşe Yılmaz, hasta Tekir bugün genel muayene için
            geldi. Veteriner hekim Dr. Ayşe Demir muayeneyi gerçekleştirdi.
          </span>
          <span className="text-xs text-muted-foreground">
            Yardımcı metin (12px) — Kayıt tarihi: 07.11.2026, saat 09:30 (24 saat biçimi).
          </span>
          <span className="tnum text-sm">
            Tabular numerals — ₺18.450,00 · 3 adet · 09:30 · 12.5 kg
          </span>
        </div>
        <div className="rounded-md border border-border bg-brand-50 p-4">
          <p className="text-base font-medium">Türkçe glif kontrolü: İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cümle örneği: İğne ve şişe ödünç kayıtları Çarşamba günü Üsküdar Şubesi&apos;nde
            güncellendi; kâğıt formlar yoğun bakım arşivine taşındı, ödemeler Öğleden sonra
            doğrulandı. (Türkçede sözcük başında Ğ yer almaz; glif yine de doğru çizilir.)
          </p>
        </div>
      </Section>

      {/* 3 — Butonlar */}
      <Section
        id="butonlar"
        title="Butonlar"
        description="Birincil eylem tahmin edilebilir konumda; koral vurgu yalnızca seçili vurgularda. Masaüstünde minimum 36px, mobil dokunma hedefi 44px."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button className="min-h-11">Randevu Oluştur</Button>
          <Button variant="secondary" className="min-h-11">
            Hasta Kaydet
          </Button>
          <Button variant="outline" className="min-h-11">
            Dışa Aktar
          </Button>
          <Button variant="ghost" className="min-h-11">
            İptal
          </Button>
          <Button variant="destructive" className="min-h-11">
            Kaydı Sil
          </Button>
          <Button disabled className="min-h-11">
            Faz 06&apos;da aktif
          </Button>
        </div>
      </Section>

      {/* 4 — Form */}
      <Section
        id="form"
        title="Form düzeni"
        description="Etiket kontrolün üzerinde, ipucu altta, hata alanın yanında; anlamlı bölümler halinde gruplanır."
      >
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patient-name">Hasta adı</Label>
            <Input id="patient-name" placeholder="örn. Tekir" />
            <span className="text-xs text-muted-foreground">
              Hasta adı, tür ve ırk kayıt sırasında istenir.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="microchip">Mikroçip no</Label>
            <Input id="microchip" aria-invalid placeholder="15 hane" />
            <span className="text-xs text-status-danger">
              Mikroçip numarası 15 haneli olmalıdır.
            </span>
          </div>
        </div>
      </Section>

      {/* 5 — Durum rozetleri */}
      <Section
        id="rozetler"
        title="Durum rozetleri"
        description="Durum asla yalnızca renkle iletilmez: nokta + ikon + metin birlikte kullanılır."
      >
        <div className="flex flex-wrap items-center gap-3">
          {(Object.keys(STATUS_COLORS) as Array<keyof typeof STATUS_COLORS>).map((tone) => (
            <StatusChip key={tone} tone={tone as StatusTone} label={`Taslak — ${tone}`} />
          ))}
          <StatusChip tone="neutral" label="Planlandı" />
        </div>
        <p className="text-xs text-muted-foreground">
          Sıra: success (Tamamlandı), warning (Beklemede), danger (İptal), info (Sürüyor) ve nötr
          (Planlandı) örnekleri.
        </p>
      </Section>

      {/* 6 — Tablo */}
      <Section
        id="tablo"
        title="Yoğun tablo"
        description="Uzun listelerde yapışkan başlık, belirgin satır vurgusu, kompakt ama okunabilir yoğunluk; sayısal sütunlar sağa hizalı."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">Adet</TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Birim Fiyatı</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="tnum text-right">2</TableCell>
              <TableCell>Kombinizasyon aşısı (1 doz)</TableCell>
              <TableCell className="tnum text-right">₺850,00</TableCell>
              <TableCell className="tnum text-right font-medium">₺1.700,00</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="tnum text-right">1</TableCell>
              <TableCell>İyot solüsyonu 500 ml</TableCell>
              <TableCell className="tnum text-right">₺240,50</TableCell>
              <TableCell className="tnum text-right font-medium">₺240,50</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="tnum text-right">3</TableCell>
              <TableCell>Genel muayene hizmeti</TableCell>
              <TableCell className="tnum text-right">₺550,00</TableCell>
              <TableCell className="tnum text-right font-medium">₺1.650,00</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      {/* 7 — Modal ve Çekmece */}
      <Section
        id="modal"
        title="Modal ve çekmece"
        description="Modal yalnızca odaklı onay/görev için; bağlam görünür kalacaksa hızlı oluşturma/düzenlemede çekmece (drawer) kullanılır."
      >
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-h-11">
                Modal aç (onay örneği)
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Kaydı kesinleştir</DialogTitle>
                <DialogDescription>
                  Kesinleştirme sonrası kayıt değiştirilemez hâle gelir. Bu bir demo penceresidir;
                  gerçek iş akışı Faz 06&apos;da eklenir.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Vazgeç</Button>
                </DialogClose>
                <Button>Kesinleştir</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="min-h-11">
                Çekmeceyi aç (hızlı form)
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Hızlı hasta ara</SheetTitle>
                <SheetDescription>
                  Bağlam görünür kalır; Faz 04&apos;te gerçek arama bağlanacak.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-2 px-4">
                <Label htmlFor="sheet-search">Arama</Label>
                <Input id="sheet-search" placeholder="Hasta adı veya mikroçip" />
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            className="min-h-11"
            onClick={() =>
              toast({ title: 'Kaydedildi (demo)', description: 'Faz 02 demo bildirimi.' })
            }
          >
            Toast göster
          </Button>
        </div>
      </Section>

      {/* 8 — Durum hikâyeleri */}
      <Section
        id="durumlar"
        title="Durum hikâyeleri"
        description="Yükleme iskeletleri düzeni korur; boş durum bir sonraki yararlı eylemi açıklar; hata yeniden deneme yolu sunar; yetkisiz durum rol eksikliğini belirtir."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-md border border-border p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Yükleme (skeleton)
            </span>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Boş
            </span>
            <EmptyState
              title="Bu hafta için vadesi gelen aşı yok"
              description="Aşı takvimi Faz 10'da aktifleşecek; o zamana kadar bu liste boş kalır."
              action={
                <Button size="sm" variant="outline" className="min-h-9" disabled>
                  Aşı takvimini aç — Faz 10
                </Button>
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hata
            </span>
            <ErrorState
              title="Rapor yüklenemedi"
              description="Sunucuya ulaşılamadı. Tekrar deneyin; sorun sürerse klinik yöneticisiyle iletişime geçin."
              onRetry={() => setDemoErrorShown((v) => !v)}
            />
            {demoErrorShown && (
              <p className="text-xs text-status-success">
                Tekrar deneme tetiklendi (demo davranışı — gerçek istek yapmaz).
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Yetkisiz
            </span>
            <UnauthorizedState
              title="Finans bölümü yetkinizde değil"
              description="Resepsiyon rolü iade işlemlerini göremez. Yetki matrisi Faz 03'te tanımlanacak."
            />
          </div>
        </div>
      </Section>

      {/* 9 — Erişilebilirlik */}
      <Section
        id="erisilebilirlik"
        title="Erişilebilirlik"
        description="WCAG 2.2 AA hedeflenir: görünür odak halkası, klavye desteği, ekran okuyucu adları, renk dışı durum ipuçları, hareket azaltma desteği."
      >
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Klavye ile gezinin: Tab / Shift+Tab — odak halkası görünürdür.</li>
          <li>Tüm ikon düğmelerinin aria-label değerleri vardır (Bildirimler, Yardım, Profil).</li>
          <li>Durumlar renk + ikon + metin ile birlikte iletilir.</li>
          <li>Sistem &quot;reduced motion&quot; ayarına saygı gösterir.</li>
        </ul>
        <div className="flex items-center gap-2 rounded-md bg-brand-50 p-3 text-sm text-brand-900">
          <HeartPulse className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Bu sayfa bir hikâye galerisidir; hiçbir buton gerçek klinik verisi değiştirmez.
          </span>
        </div>
      </Section>
    </div>
  );
}
