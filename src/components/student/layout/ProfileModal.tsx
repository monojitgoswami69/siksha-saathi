'use client';

import React, { useState } from 'react';
import { useStudentAuth } from '@/context/StudentAuthContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, profile, updateProfile } = useStudentAuth();
  const [name, setName] = useState(user?.displayName || 'Student');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await updateProfile({ name });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const userEmail = user?.email || 'student@university.edu';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 font-body relative">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold font-headline text-slate-800">Student Profile</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group w-24 h-24 mb-3">
              <div className="w-full h-full rounded-full overflow-hidden border-4 border-[#f1f5f9] relative">
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userEmail}&backgroundColor=b6e3f4`}
                  alt="Profile"
                  className="object-cover w-full h-full"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 font-medium">{userEmail}</p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#f8fafc] border border-slate-200 text-slate-800 px-4 py-3 rounded-xl focus:border-[#1a559e] focus:ring-1 focus:ring-[#1a559e] transition-all font-medium text-sm outline-none"
                />
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  edit
                </span>
              </div>
            </div>

            {/* Academic Details (Read Only) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Stream
                </p>
                <p className="text-sm font-bold text-slate-700 mt-0.5 uppercase">
                  {profile?.stream || 'CSE'}
                </p>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Semester
                </p>
                <p className="text-sm font-bold text-slate-700 mt-0.5">
                  Semester {profile?.sem || profile?.semester || '1'}
                </p>
              </div>
            </div>

            <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Roll Number
              </p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">
                {profile?.roll || profile?.rollNumber || 'CS2026-001'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#f8fafc] border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-sm font-bold text-white bg-[#0d47a1] hover:bg-blue-800 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
