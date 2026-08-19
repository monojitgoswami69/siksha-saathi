'use client';

import React, { useState } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/client/api';
import { User, Building2, Save, KeyRound } from 'lucide-react';

export default function UserSettingsPage() {
  const { user } = useAdminAuth();
  const { showSuccess, showError } = useToast();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        displayName: displayName.trim(),
        department: department.trim(),
      };

      if (newPassword) {
        if (!currentPassword) {
          showError('Current password is required to change your password');
          setSaving(false);
          return;
        }
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      await api.auth.updateProfile(payload, 'admin');
      showSuccess('Profile settings updated successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      showError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-mono">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Faculty & Admin Settings</h1>
        <p className="text-xs text-neutral-500 mt-1">Manage your account profile, role access, and security credentials.</p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-8 space-y-6 shadow-sm">
        <div className="flex items-center gap-4 pb-6 border-b border-neutral-100">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'admin'}`}
            alt="Avatar"
            className="w-16 h-16 rounded-full border border-neutral-200 bg-neutral-50"
          />
          <div>
            <h3 className="text-lg font-bold text-neutral-900">{displayName || user?.displayName || 'Administrator'}</h3>
            <p className="text-xs text-neutral-500">{user?.email}</p>
            <span className="inline-block px-2 py-0.5 mt-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded uppercase border border-indigo-100">
              Role: {user?.role || 'Admin'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Display Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Department</label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">Stream & teaching assignments are managed by an admin via Manage Faculty.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Change Security Password</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Update Settings'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
