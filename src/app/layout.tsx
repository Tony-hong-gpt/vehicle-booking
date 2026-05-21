import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '차량 사용 신청 시스템',
  description: '차량 사용 신청 관리 시스템',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased overflow-x-hidden">{children}</body>
    </html>
  );
}
