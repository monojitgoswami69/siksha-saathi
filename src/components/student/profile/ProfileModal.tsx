'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, GraduationCap, Hash, BookOpen, Layers, Save, Lock, ShieldCheck } from 'lucide-react';
import { useStudentAuth } from '@/context/StudentAuthContext';
import { useToast } from '@/context/ToastContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, profile, updateProfile } = useStudentAuth();
  const { showSuccess, showError } = useToast();

  const [formData, setFormData] = useState({
    name: profile?.name || user?.displayName || '',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setFormData({ name: profile?.name || user?.displayName || '' });
      setPasswords({ currentPassword: '', newPassword: '' });
    }
  }, [isOpen, profile, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, any> = { name: formData.name, displayName: formData.name };
      if (passwords.newPassword) {
        payload.currentPassword = passwords.currentPassword;
        payload.newPassword = passwords.newPassword;
      }
      const ok = await updateProfile(payload);
      if (ok) {
        showSuccess('Profile updated successfully');
        setPasswords({ currentPassword: '', newPassword: '' });
        onClose();
      } else {
        showError('Failed to update profile');
      }
    } catch {
      showError('Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const readOnlyField = (
    icon: React.ReactNode,
    label: string,
    value: string | undefined
  ) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon}
        <input
          type="text"
          value={value || '—'}
          readOnly
          className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed font-medium"
        />
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden z-10"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Student Profile</h3>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>
                Academic details (stream, semester, section, roll) are managed by your administrator and cannot be
                self-edited.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your Full Name"
                  className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {readOnlyField(
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />,
              'Roll Number',
              profile?.roll
            )}

            <div className="grid grid-cols-3 gap-3">
              {readOnlyField(
                <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-3" />,
                'Stream',
                profile?.stream
              )}
              {readOnlyField(
                <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-3" />,
                'Semester',
                profile?.sem
              )}
              {readOnlyField(
                <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-3" />,
                'Section',
                profile?.section
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Change Password
              </p>
              <div className="space-y-2">
                <input
                  type="password"
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                  placeholder="Current password (required to set new)"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
                <input
                  type="password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  placeholder="New password (leave blank to keep)"
                  minLength={passwords.newPassword ? 6 : 0}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
