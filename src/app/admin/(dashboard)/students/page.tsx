'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import {
  Users,
  Search,
  Upload,
  UserPlus,
  Filter,
  CheckCircle2,
  FileSpreadsheet,
  X,
  RefreshCw,
} from 'lucide-react';
import { formatDate } from '@/lib/client/utils';

export default function StudentsPage() {
  const { showSuccess, showError } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStream, setSelectedStream] = useState('All');
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // Enroll modal state
  const [csvText, setCsvText] = useState('');
  const [enrollStream, setEnrollStream] = useState('cse');
  const [enrollSem, setEnrollSem] = useState('1');
  const [enrolling, setEnrolling] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getStudents({
        stream: selectedStream === 'All' ? undefined : selectedStream,
      });
      setStudents(res.students || []);
    } catch {
      showError('Failed to load student directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [selectedStream]);

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;

    setEnrolling(true);
    try {
      const res = await api.admin.enrollStudents({
        csv_data: csvText,
        stream: enrollStream,
        semester: enrollSem,
      });

      showSuccess(res.message || `Successfully enrolled ${res.enrolled} students`);
      setShowEnrollModal(false);
      setCsvText('');
      loadStudents();
    } catch (err: any) {
      showError(err.message || 'Enrollment failed');
    } finally {
      setEnrolling(false);
    }
  };

  const filtered = students.filter(
    (s) =>
      (s.name || s.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.roll || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Student Directory & Enrollment</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage enrolled college student profiles, batches, and batch import via CSV/TSV spreadsheets.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowEnrollModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Batch Enroll Students</span>
          </button>
          <button
            onClick={loadStudents}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name, roll, or email..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl w-full sm:w-auto overflow-x-auto">
          <Filter className="w-4 h-4 text-slate-400 ml-2" />
          <span className="text-xs text-slate-400 font-semibold">Stream:</span>
          {['All', 'cse', 'it', 'ece', 'ee'].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStream(st)}
              className={`px-3 py-1 rounded-xl text-xs font-bold uppercase transition-all ${
                selectedStream === st ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-slate-400">Loading student records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white">No Students Found</h4>
            <p className="text-xs text-slate-400 mt-1">Enroll students using the batch import button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">University Email</th>
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Stream / Sem</th>
                  <th className="py-3 px-4">Academic Batch</th>
                  <th className="py-3 px-4">Enrolled Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((st) => (
                  <tr key={st.uid} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-800 font-bold flex items-center justify-center text-[10px] text-indigo-400">
                        {st.name?.charAt(0) || 'S'}
                      </div>
                      <span>{st.name || st.display_name}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">{st.email}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{st.roll || 'N/A'}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded font-semibold uppercase">
                        {st.stream || 'CSE'}
                      </span>{' '}
                      <span className="text-slate-400">/ Sem {st.sem || '1'}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{st.batch || '2024-2028'}</td>
                    <td className="py-3.5 px-4 text-slate-500">{formatDate(st.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CSV Batch Enrollment Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-950 text-indigo-400 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Batch Enroll Students</h3>
                  <p className="text-xs text-slate-400">Paste CSV/TSV with header: email, name, roll, stream, sem</p>
                </div>
              </div>
              <button onClick={() => setShowEnrollModal(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Default Stream</label>
                  <select
                    value={enrollStream}
                    onChange={(e) => setEnrollStream(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  >
                    <option value="cse">CSE</option>
                    <option value="it">IT</option>
                    <option value="ece">ECE</option>
                    <option value="ee">EE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Default Semester</label>
                  <select
                    value={enrollSem}
                    onChange={(e) => setEnrollSem(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  >
                    {['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  CSV Student Data
                </label>
                <textarea
                  rows={8}
                  required
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={`email,name,roll,stream,sem\nstudent1@university.edu,John Doe,CS21001,cse,1\nstudent2@university.edu,Jane Smith,CS21002,cse,1`}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:ring-2 focus:ring-indigo-500/30 outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enrolling || !csvText.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
                >
                  {enrolling ? 'Enrolling...' : 'Import & Create Accounts'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
