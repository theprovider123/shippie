import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Shippie',
    template: '%s · Shippie',
  },
  description: 'Apps on your phone, without the App Store.',
  applicationName: 'Shippie',
  authors: [{ name: 'Shippie' }],
  keywords: ['pwa', 'app marketplace', 'vibe coding', 'app store alternative'],
  metadataBase: new URL('https://shippie.app'),
  openGraph: {
    title: 'Shippie',
    description: 'Apps on your phone, without the App Store.',
    url: 'https://shippie.app',
    siteName: 'Shippie',
    locale: 'en_US',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
