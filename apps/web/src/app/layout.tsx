import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientWrapper from '@/components/client-wrapper';

export const metadata: Metadata = {
  title: 'Corpus Dashboard',
  description: 'Training and health data analytics',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}
