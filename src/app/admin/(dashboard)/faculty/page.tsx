'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import {
  UserCog,
  Search,
  UserPlus,
  RefreshCw,
  X,
  ShieldCheck,
  KeyRound,
  Trash2,
  Pencil,
} from 'lucide-react';
import { formatDate } from '@/lib/client/utils';

type Role = 'admin' | 'hod' | 'faculty';

interface FacultyUser {
  uid: string;
  email: string;
  role: Role;
  display_name: string;
  stream?: string;
  department?: string;
  organization_name?: string;
  created_at: string;
}

const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-indigo-950 text-indigo-300 border border-indigo-800',
  hod: 'bg-violet-950 text-violet-300 border border-violet-800',
  faculty: 'bg-slate-800 text-slate-300 border border-slate-700',
};

export default function ManageFacultyPage() {
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<FacultyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FacultyUser | null>(null);
  const [resetTarget, setResetTarget] = useState<FacultyUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'faculty' as Role,
    stream: '',
    department: '',
  });
  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.admin.listFaculty();
      setUsers(res.users || []);
    } catch {
      showError('Failed to load faculty directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      email: '',
      password: '',
      displayName: '',
      role: 'faculty',
      stream: '',
      department: '',
    });
    setShowModal(true);
  };

  const openEdit = (u: FacultyUser) => {
    setEditing(u);
    setForm({
      email: u.email,
      password: '',
      displayName: u.display_name,
      role: u.role,
      stream: u.stream || '',
      department: u.department || '',
    });
    setShowModal(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.admin.updateFaculty(editing.uid, {
          displayName: form.displayName,
          role: form.role,
          stream: form.stream || undefined,
          department: form.department || undefined,
        });
        showSuccess('Faculty account updated');
      } else {
        await api.admin.createFaculty({
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
          stream: form.stream || undefined,
          department: form.department || undefined,
        });
        showSuccess('Faculty account created');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      showError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSubmitting(true);
    try {
      await api.admin.resetFacultyPassword(resetTarget.uid, newPassword);
      showSuccess('Password reset successfully');
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      showError(err.message || 'Reset failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (u: FacultyUser) => {
    if (!confirm(`Delete faculty account "${u.display_name}" (${u.email})? This cannot be undone.`)) return;
    try {
      await api.admin.deleteFaculty(u.uid);
      showSuccess('Account deleted');
      setUsers((prev) => prev.filter((x) => x.uid !== u.uid));
    } catch (err: any) {
      showError(err.message || 'Delete failed');
    }
  };

  const filtered = users.filter(
    (u) =>
      (u.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Manage Faculty & Coordinators</h1>
          <p className="text-xs text-slate-400 mt-1">
            Provision teachers, HODs, and administrators. Assign roles, streams, and reset passwords.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Faculty</span>
          </button>
          <button
            onClick={load}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or department..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-slate-400">Loading faculty records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserCog className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white">No Faculty Found</h4>
            <p className="text-xs text-slate-400 mt-1">Add teachers and coordinators using the button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Stream / Dept</th>
                  <th className="py-3 px-4">Added</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-800 font-bold flex items-center justify-center text-[10px] text-indigo-400">
                        {u.display_name?.charAt(0) || 'F'}
                      </div>
                      <span>{u.display_name}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">{u.email}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded font-semibold uppercase ${ROLE_STYLE[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      <span className="uppercase">{u.stream || '—'}</span>
                      {u.department ? <span className="text-slate-500"> / {u.department}</span> : null}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{formatDate(u.created_at)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setResetTarget(u);
                            setNewPassword('');
                          }}
                          className="p-1.5 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 rounded-lg transition-colors"
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1.5 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-950 text-indigo-400 rounded-xl">
                  {editing ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {editing ? 'Edit Faculty Account' : 'Add Faculty Account'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editing ? 'Update role and profile details.' : 'Provision a new dashboard user.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {!editing && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="faculty@university.edu"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                      Initial Password <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="min 6 chars"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:ring-2 focus:ring-indigo-500/30 outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="e.g. Dr. Jane Smith"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  >
                    <option value="faculty">Faculty</option>
                    <option value="hod">HOD</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Stream</label>
                  <input
                    type="text"
                    value={form.stream}
                    onChange={(e) => setForm({ ...form, stream: e.target.value })}
                    placeholder="e.g. cse"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="e.g. CSE"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  />
                </div>
              </div>

              {form.role === 'admin' && (
                <div className="flex items-start gap-2 bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-3 text-[11px] text-indigo-200/90">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Admins have full access across the platform, including faculty and curriculum management.</span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
                >
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-950 text-amber-400 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Reset Password</h3>
                  <p className="text-xs text-slate-400">{resetTarget.email}</p>
                </div>
              </div>
              <button
                onClick={() => setResetTarget(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitReset} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">New Password</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="min 6 chars"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:ring-2 focus:ring-indigo-500/30 outline-none"
                />
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                >
                  {submitting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
