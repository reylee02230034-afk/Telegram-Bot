import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: '约课地图 - 老师学生双端平台',
  description: '基于 Telegram Bot + Mini App 的老师约课地图',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  userScalable: false,
};

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY || '';
const AMAP_SECURITY_CODE = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || '';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://unpkg.com/@twa-dev/sdk@7.0.0/telegram-web-app.js" />
        {AMAP_KEY && AMAP_SECURITY_CODE && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window._AMapSecurityConfig={securityJsCode:'${AMAP_SECURITY_CODE}'}`,
            }}
          />
        )}
        {AMAP_KEY && (
          <script
            async
            defer
            src={`https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Heatmap,AMap.MarkerCluster`}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
