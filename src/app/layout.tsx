import type { Metadata } from 'next';
import './globals.css';
import DebuggerProvider from '@/components/DebuggerProvider';
import DebuggerPanel from '@/components/DebuggerPanel';

export const metadata: Metadata = {
  title: 'Claude Coder',
  description: 'AI-powered coding assistant with GitHub integration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <DebuggerProvider>
          {children}
          <DebuggerPanel />
        </DebuggerProvider>
      </body>
    </html>
  );
}
