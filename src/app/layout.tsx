import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/context/ToastContext';
import { StudentAuthProvider } from '@/context/StudentAuthContext';
import { AdminAuthProvider } from '@/context/AdminAuthContext';
import { ChatProvider } from '@/context/ChatContext';

export const metadata: Metadata = {
  title: 'Siksha Saathi - AI Academic Intelligence & Socratic Tutor',
  description: 'Production-grade AI Academic Intelligence and Socratic Tutoring platform for college students and faculty.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inclusive+Sans:ital@0;1&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Jura:wght@300..700&family=Nova+Flat&family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className="h-full antialiased font-sans bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white" suppressHydrationWarning>
        <ToastProvider>
          <StudentAuthProvider>
            <AdminAuthProvider>
              <ChatProvider>{children}</ChatProvider>
            </AdminAuthProvider>
          </StudentAuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
