'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { cn } from '@/lib/client/utils';
import {
  LayoutDashboard,
  BookOpen,
  FilePlus,
  Type,
  Settings,
  LogOut,
  X,
  BarChart3,
  Users,
  Library,
  GraduationCap,
} from 'lucide-react';

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/admin/dashboard',
    icon: LayoutDashboard,
    roles: ['superuser', 'admin', 'assistant', 'hod', 'faculty'],
  },
  {
    id: 'query-analytics',
    label: 'Query Analytics',
    path: '/admin/query-analytics',
    icon: BarChart3,
    roles: ['superuser', 'assistant', 'faculty', 'admin', 'hod'],
  },
  {
    id: 'stream-analytics',
    label: 'Stream Analytics',
    path: '/admin/stream-analytics',
    icon: BarChart3,
    roles: ['superuser', 'hod', 'admin'],
  },
  {
    id: 'subject-analysis',
    label: 'Subject Analysis',
    path: '/admin/subject-analysis',
    icon: BookOpen,
    roles: ['superuser', 'assistant', 'faculty', 'admin', 'hod'],
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base',
    path: '/admin/knowledge-base',
    icon: BookOpen,
    roles: ['superuser', 'admin', 'assistant', 'hod', 'faculty'],
  },
  {
    id: 'add-document',
    label: 'Add Document (OCR)',
    path: '/admin/add-document',
    icon: FilePlus,
    roles: ['superuser', 'admin', 'hod', 'faculty'],
  },
  {
    id: 'add-text',
    label: 'Add Text',
    path: '/admin/add-text',
    icon: Type,
    roles: ['superuser', 'admin', 'hod', 'faculty'],
  },
  {
    id: 'student-records',
    label: 'Student Records',
    path: '/admin/students',
    icon: Users,
    roles: ['admin', 'superuser', 'hod'],
  },
  {
    id: 'manage-curriculum',
    label: 'Manage Curriculum',
    path: '/admin/manage-curriculum',
    icon: Library,
    roles: ['admin', 'superuser'],
  },
];

export function Sidebar({
  isMobileOpen,
  onCloseMobile,
}: {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuth();

  const userRole = user?.role || 'faculty';
  const filteredNavItems = navItems.filter(
    (item) =>
      item.roles.includes(userRole) || userRole === 'admin' || userRole === 'superuser'
  );

  const displayName =
    user?.displayName || user?.email?.split('@')[0] || 'Faculty User';
  const avatarSeed = user?.email || user?.uid || 'admin';
  const displayRole = (userRole || 'Faculty').toUpperCase();
  const isSuperuser = userRole === 'superuser' || userRole === 'admin';

  return (
    <aside
      className={cn(
        'w-64 h-full flex flex-col bg-white text-neutral-900 border-r border-neutral-200 z-30 select-none transition-all font-mono',
        isMobileOpen ? 'fixed inset-y-0 left-0 flex shadow-2xl' : 'hidden lg:flex'
      )}
    >
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-neutral-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <span className="font-bold text-[16px] tracking-tight text-neutral-900 truncate">
            Siksha Saathi
          </span>
        </div>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-neutral-500 hover:text-neutral-900"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.path ||
            (item.path !== '/admin/dashboard' && pathname.startsWith(item.path));
          return (
            <Link
              key={item.id}
              href={item.path}
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-all',
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="mt-3 pt-3 border-t border-neutral-200 px-3 pb-3">
        <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-2">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`}
              className="w-8 h-8 rounded-full border border-neutral-200 flex-shrink-0"
              alt=""
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 truncate" title={displayName}>
                {displayName}
              </p>
              <p
                className={`text-xs truncate ${
                  isSuperuser ? 'text-indigo-600 font-semibold' : 'text-neutral-500'
                }`}
                title={displayRole}
              >
                {displayRole}
              </p>
            </div>
            <Link
              href="/admin/user-settings"
              className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded-md transition-colors flex-shrink-0"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
          <button
            onClick={() => {
              logout();
              router.push('/admin/login');
            }}
            className="w-full flex items-center gap-2.5 px-2 py-2 mt-1.5 text-xs font-semibold rounded-md text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
