import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BoxOfficePulse — Enterprise War Room',
  description:
    'Real-time box office analytics & operational intelligence command center powered by ClickHouse and LangGraph AI.',
  keywords: ['box office', 'analytics', 'AI', 'ClickHouse', 'theater', 'revenue'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full dark`}>
      <body className="h-full bg-zinc-950 text-zinc-200 antialiased">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
