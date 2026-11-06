import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Providers } from './providers';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
});

export const metadata: Metadata = {
  title: 'VetCore — Veteriner Klinik Yönetim Platformu',
  description:
    'Hasta ve hasta sahibi kayıtları, randevular, muayene ve tedavi süreçleri, aşı ve reçete kayıtları, depo/stok ve finans işlemlerini tek sistemde birleştiren klinik yönetim platformu.',
  authors: [{ name: 'VetCore' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased bg-background text-foreground`}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
