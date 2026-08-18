'use client';

import React, { useState } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/client/api';
import { Shield, User, Mail, Building2, Lock, Save, KeyRound } from 'lucide-react';

export default function UserSettingsPage() {
  const { user } = useAdminAuth();
  const { showSuccess, showError } = useToast();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [stream, setStream] = useState(user?.stream || 'cse');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isNonAdmin = user?.role && user.role !== 'admin';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        displayName: displayName.trim(),
      };
      // Only admins may self-edit stream here (route also enforces this).
      if (!isNonAdmin) {
        payload.stream = stream.trim();
      }

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
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Faculty & Admin Settings</h1>
        <p className="text-xs text-slate-400 mt-1">Manage your account profile, role access, and security credentials.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-800">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'admin'}`}
            alt="Avatar"
            className="w-16 h-16 rounded-full border border-slate-700 bg-slate-800"
          />
          <div>
            <h3 className="text-lg font-bold text-white">{displayName || user?.displayName || 'Administrator'}</h3>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <span className="inline-block px-2 py-0.5 mt-1.5 bg-indigo-950 text-indigo-300 text-[10px] font-bold rounded uppercase">
              Role: {user?.role || 'Admin'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Display Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">
                Department / Stream {isNonAdmin && <span className="text-slate-600 normal-case font-normal">(admin-managed)</span>}
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={stream}
                  onChange={(e) => setStream(e.target.value)}
                  disabled={!!isNonAdmin}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase focus:ring-2 focus:ring-indigo-500/30 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              <span>Change Security Password</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Update Settings'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
