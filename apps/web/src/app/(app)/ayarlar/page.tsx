'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Denetim } from '@/components/settings/denetim';
import { KlinikProfili } from '@/components/settings/klinik-profili';
import { Lisans } from '@/components/settings/lisans';
import { Personel } from '@/components/settings/personel';
import { Roller } from '@/components/settings/roller';
import { Subeler } from '@/components/settings/subeler';

const TABS = ['klinik', 'subeler', 'personel', 'roller', 'denetim', 'lisans'] as const;
type TabKey = (typeof TABS)[number];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TABS as readonly string[]).includes(value);
}

function AyarlarIcerik() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const currentTab = isTabKey(tabParam) ? tabParam : 'klinik';

  function onTabChange(value: string) {
    router.replace(`/ayarlar?tab=${value}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Klinik Ayarları</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Klinik profili, şubeler, personel, roller, denetim kaydı ve lisans.
        </p>
      </div>

      <Tabs value={currentTab} onValueChange={onTabChange}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="klinik" className="min-h-11">
            Klinik Profili
          </TabsTrigger>
          <TabsTrigger value="subeler" className="min-h-11">
            Şubeler
          </TabsTrigger>
          <TabsTrigger value="personel" className="min-h-11">
            Personel
          </TabsTrigger>
          <TabsTrigger value="roller" className="min-h-11">
            Roller ve İzinler
          </TabsTrigger>
          <TabsTrigger value="denetim" className="min-h-11" data-testid="tab-denetim">
            Denetim Kaydı
          </TabsTrigger>
          <TabsTrigger value="lisans" className="min-h-11" data-testid="tab-lisans">
            Lisans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="klinik" className="mt-4">
          <KlinikProfili />
        </TabsContent>
        <TabsContent value="subeler" className="mt-4">
          <Subeler />
        </TabsContent>
        <TabsContent value="personel" className="mt-4">
          <Personel />
        </TabsContent>
        <TabsContent value="roller" className="mt-4">
          <Roller />
        </TabsContent>
        <TabsContent value="denetim" className="mt-4">
          <Denetim />
        </TabsContent>
        <TabsContent value="lisans" className="mt-4">
          <Lisans />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AyarlarPage() {
  return (
    <Suspense fallback={null}>
      <AyarlarIcerik />
    </Suspense>
  );
}
