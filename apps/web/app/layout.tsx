import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Shippie — Ship your apps, not your source',
    template: '%s · Shippie',
  },
  description: 'No app store. Just the web, installed. Deploy PWAs from Claude Code in 60 seconds. Open source, BYO backend.',
  applicationName: 'Shippie',
  authors: [{ name: 'Shippie' }],
  keywords: ['pwa', 'app marketplace', 'vibe coding', 'app store alternative', 'open source', 'deploy pwa', 'ai apps'],
  metadataBase: new URL('https://shippie.app'),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Shippie',
  },
  icons: {
    icon: [
      { url: '/brand/favicon.ico', sizes: 'any' },
      { url: '/brand/app-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/app-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/brand/app-icon-180.png',
  },
  openGraph: {
    title: 'Shippie',
    description: 'Ship your apps, not your source. The open marketplace for web apps built with AI.',
    url: 'https://shippie.app',
    siteName: 'Shippie',
    locale: 'en_US',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#14120F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        {children}
        {/* Dark-first: apply stored theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('shippie-theme')||'dark';document.documentElement.setAttribute('data-theme',t)})();if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){})}`,
          }}
        />
      </body>
    </html>
  );
}
