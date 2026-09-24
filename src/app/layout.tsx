import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Family Tree',
  description: 'A shared, collaborative family tree.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Family Tree' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,   // the canvas handles its own pinch-zoom
  viewportFit: 'cover',  // draw under the notch, padded back via safe-area insets
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#12161b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
