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
  Plus,
} from 'lucide-react';

type Role = 'admin' | 'hod' | 'faculty';

interface Assignment {
  stream: string;
  semester: string;
  section: string;
  subject: string;
}

interface FacultyUser {
  uid: string;
  email: string;
  role: Role;
  display_name: string;
  stream?: string;
  department?: string;
  organization_name?: string;
  hod_streams?: string[];
  faculty_assignments?: Assignment[];
  created_at: string;
}

const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  hod: 'bg-violet-50 text-violet-700 border border-violet-200',
  faculty: 'bg-neutral-100 text-neutral-700 border border-neutral-200',
};

const SEMS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export default function ManageFacultyPage() {
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<FacultyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FacultyUser | null>(null);
  const [resetTarget, setResetTarget] = useState<FacultyUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Curriculum data for dropdowns
  const [curriculum, setCurriculum] = useState<Record<string, Record<string, string[]>>>({});
  const [filterStreams, setFilterStreams] = useState<string[]>([]);
  const [filterSections, setFilterSections] = useState<string[]>([]);

  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'faculty' as Role,
    department: '',
    hodStreams: [] as string[],
    assignments: [] as Assignment[],
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
    api.filters
      .getFilters()
      .then((data) => {
        if (data?.curriculum) setCurriculum(data.curriculum);
        if (Array.isArray(data.streams)) setFilterStreams(data.streams);
        if (Array.isArray(data.sections)) setFilterSections(data.sections);
      })
      .catch(() => {});
  }, []);

  const allStreams = Array.from(new Set([...filterStreams, ...Object.keys(curriculum)])).sort();

  const openCreate = () => {
    setEditing(null);
    setForm({
      email: '',
      password: '',
      displayName: '',
      role: 'faculty',
      department: '',
      hodStreams: [],
      assignments: [],
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
      department: u.department || '',
      hodStreams: u.hod_streams || [],
      assignments: u.faculty_assignments || [],
    });
    setShowModal(true);
  };

  const toggleHodStream = (s: string) => {
    setForm((f) => {
      const has = f.hodStreams.includes(s);
      return { ...f, hodStreams: has ? f.hodStreams.filter((x) => x !== s) : [...f.hodStreams, s] };
    });
  };

  const addAssignment = () => {
    const firstStream = allStreams[0] || 'cse';
    const firstSem = SEMS[0];
    const firstSection = filterSections[0] || `${firstStream}1`;
    const firstSubject = curriculum[firstStream]?.[firstSem]?.[0] || 'General';
    setForm((f) => ({
      ...f,
      assignments: [...f.assignments, { stream: firstStream, semester: firstSem, section: firstSection, subject: firstSubject }],
    }));
  };

  const updateAssignment = (idx: number, field: keyof Assignment, value: string) => {
    setForm((f) => ({
      ...f,
      assignments: f.assignments.map((a, i) => (i === idx ? { ...a, [field]: value } : a)),
    }));
  };

  const removeAssignment = (idx: number) => {
    setForm((f) => ({ ...f, assignments: f.assignments.filter((_, i) => i !== idx) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        displayName: form.displayName,
        role: form.role,
        department: form.department || undefined,
        hodStreams: form.hodStreams,
        facultyAssignments: form.assignments,
      };
      if (editing) {
        await api.admin.updateFaculty(editing.uid, payload);
        showSuccess('Faculty account updated');
      } else {
        await api.admin.createFaculty({
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
          department: form.department || undefined,
          hodStreams: form.hodStreams,
          facultyAssignments: form.assignments,
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
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Manage Faculty & Coordinators</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Provision teachers/HODs. Assign multiple streams (HOD) and multiple subject/sem/section combos (faculty).
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Faculty</span>
          </button>
          <button
            onClick={load}
            className="p-2.5 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-600 hover:text-neutral-900 transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, email, or department..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none shadow-sm transition-all"
        />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-neutral-500">Loading faculty records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserCog className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-neutral-900">No Faculty Found</h4>
            <p className="text-xs text-neutral-500 mt-1">Add teachers and coordinators using the button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">HOD Streams</th>
                  <th className="py-3 px-4">Teaches</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((u) => (
                  <tr key={u.uid} className="hover:bg-neutral-50/80 transition-colors align-top">
                    <td className="py-3.5 px-4 font-bold text-neutral-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 font-bold flex items-center justify-center text-[10px] text-indigo-700 flex-shrink-0">
                          {u.display_name?.charAt(0) || 'F'}
                        </div>
                        <div className="min-w-0">
                          <div>{u.display_name}</div>
                          <div className="font-mono font-normal text-neutral-500 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded font-semibold uppercase text-[11px] ${ROLE_STYLE[u.role]}`}>{u.role}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {(u.hod_streams || []).length ? (
                          u.hod_streams!.map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 uppercase text-[10px] font-bold">{s}</span>
                          ))
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {(u.faculty_assignments || []).slice(0, 4).map((a, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200 text-[10px]" title={`${a.stream} • ${a.subject}`}>
                            {a.subject} <span className="text-neutral-500">(S{a.semester}/{a.section})</span>
                          </span>
                        ))}
                        {(u.faculty_assignments || []).length > 4 && (
                          <span className="text-neutral-500 text-[10px]">+{(u.faculty_assignments || []).length - 4} more</span>
                        )}
                        {(u.faculty_assignments || []).length === 0 && <span className="text-neutral-400">—</span>}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setResetTarget(u); setNewPassword(''); }}
                          className="p-1.5 hover:bg-amber-50 text-neutral-400 hover:text-amber-600 rounded-lg transition-colors"
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(u)} className="p-1.5 hover:bg-rose-50 text-neutral-400 hover:text-rose-600 rounded-lg transition-colors" title="Delete">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto text-neutral-900">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pb-3 border-b border-neutral-100 z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  {editing ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-base">{editing ? 'Edit Faculty Account' : 'Add Faculty Account'}</h3>
                  <p className="text-xs text-neutral-500">{editing ? 'Update role and assignments.' : 'Provision a new dashboard user.'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Display Name</label>
                  <input type="text" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Dr. Jane Smith" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                    <option value="faculty">Faculty</option>
                    <option value="hod">HOD</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {!editing && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Email</label>
                      <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="faculty@university.edu" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Initial Password <span className="text-rose-500">*</span></label>
                      <input type="text" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 6 chars" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Department</label>
                  <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Computer Science" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                </div>
              </div>

              {/* HOD streams (multi-select) */}
              <div className="pt-4 border-t border-neutral-100">
                <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">HOD of streams {form.role === 'hod' && <span className="text-violet-600 normal-case font-normal">(select all that apply)</span>}</p>
                <div className="flex flex-wrap gap-2">
                  {allStreams.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleHodStream(s)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase transition-all ${
                        form.hodStreams.includes(s) ? 'bg-violet-600 text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Faculty teaching assignments */}
              <div className="pt-4 border-t border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Teaching assignments (subject/sem/section)</p>
                  <button type="button" onClick={addAssignment} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-semibold transition-colors">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {form.assignments.length === 0 && (
                    <p className="text-[11px] text-neutral-400">None yet. A user with no assignments + no HOD streams sees nothing.</p>
                  )}
                  {form.assignments.map((a, idx) => {
                    const subjects = curriculum[a.stream]?.[a.semester] || [];
                    return (
                      <div key={idx} className="grid grid-cols-5 gap-2 items-center bg-neutral-50 border border-neutral-200 rounded-xl p-2">
                        <select value={a.stream} onChange={(e) => updateAssignment(idx, 'stream', e.target.value)} className="bg-white border border-neutral-200 rounded-lg text-[11px] text-neutral-900 px-1.5 py-1 outline-none uppercase font-semibold">
                          {allStreams.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={a.semester} onChange={(e) => updateAssignment(idx, 'semester', e.target.value)} className="bg-white border border-neutral-200 rounded-lg text-[11px] text-neutral-900 px-1.5 py-1 outline-none">
                          {SEMS.map((s) => <option key={s} value={s}>Sem {s}</option>)}
                        </select>
                        <input list={`sec-${idx}`} value={a.section} onChange={(e) => updateAssignment(idx, 'section', e.target.value)} placeholder="section" className="bg-white border border-neutral-200 rounded-lg text-[11px] text-neutral-900 px-1.5 py-1 outline-none uppercase" />
                        <datalist id={`sec-${idx}`}>{filterSections.map((s) => <option key={s} value={s} />)}</datalist>
                        <select value={a.subject} onChange={(e) => updateAssignment(idx, 'subject', e.target.value)} className="bg-white border border-neutral-200 rounded-lg text-[11px] text-neutral-900 px-1.5 py-1 outline-none truncate">
                          <option value="General">General</option>
                          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button type="button" onClick={() => removeAssignment(idx)} className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg justify-self-end transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {form.role === 'admin' && (
                <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[11px] text-indigo-800">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-600" />
                  <span>Admins have full access across the platform (stream assignments optional).</span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-neutral-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40">
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl text-neutral-900">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><KeyRound className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-base">Reset Password</h3>
                  <p className="text-xs text-neutral-500">{resetTarget.email}</p>
                </div>
              </div>
              <button onClick={() => setResetTarget(null)} className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">New Password</label>
                <input type="text" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min 6 chars" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-neutral-100">
                <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40">
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
