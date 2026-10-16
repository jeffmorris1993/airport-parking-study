import type { Metadata, Viewport } from 'next';
import './globals.css';
import { STUDY } from '@config/study';

export const metadata: Metadata = {
  title: STUDY.studyTitle,
  description: 'A short study about airport parking and travel.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f1f4fa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
