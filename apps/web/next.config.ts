import type { NextConfig } from 'next';

const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Faz 01 QA: React Compiler memo slot karışması durum kartlarında yanlış badge
  // render'ına yol açtı (DB kartı API kartının çıktısını gösteriyordu). Next 16'da
  // compiler varsayılan açıktır; tutarlı davranış için devre dışı bırakıldı.
  reactCompiler: false,
  async rewrites() {
    return [
      {
        // Web istemcisi API'ye göreli yollarla erişir; hedef API_PROXY_TARGET ile verilir.
        source: '/api/v1/:path*',
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
