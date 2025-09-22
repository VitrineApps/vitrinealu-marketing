import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Approvals Portal',
  description: 'Approve or reject workflows from any device.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 font-sans">{children}</body>
    </html>
  );
}
