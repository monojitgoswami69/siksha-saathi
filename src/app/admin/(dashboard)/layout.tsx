'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { Sidebar } from '@/components/admin/AppShell/Sidebar';
import { Menu, Shield } from 'lucide-react';

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAdminAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/admin/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50 text-neutral-900 font-mono">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen w-full bg-neutral-50 text-neutral-900 flex overflow-hidden font-mono">
      <Sidebar isMobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-neutral-50">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 bg-neutral-100 rounded-lg text-neutral-700 hover:text-neutral-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-neutral-900 text-sm">Faculty Dashboard</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-md border border-indigo-100">
            <Shield className="w-3.5 h-3.5" />
            <span>Admin</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-neutral-50 text-neutral-900">
          {children}
        </main>
      </div>
    </div>
  );
}
