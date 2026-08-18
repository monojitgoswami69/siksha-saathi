'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { UserCheck, RefreshCw, BookOpen } from 'lucide-react';

interface FacultyHeatItem {
  subject: string;
  query_count: number;
}

interface FacultyMember {
  uid: string;
  email: string;
  name: string;
  stream?: string;
  department?: string;
  doc_count: number;
  total_queries: number;
  subjects: string[];
  semesters: string[];
  sections: string[];
  subject_heatmap: FacultyHeatItem[];
}

export default function FacultyPerformancePage() {
  const { showError } = useToast();
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeMode, setScopeMode] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.analytics.faculty();
      setFaculty(res.faculty || []);
      setScopeMode(res.scope_mode || 'all');
    } catch {
      showError('Failed to load faculty performance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const scopeLabel =
    scopeMode === 'stream' ? 'Your Stream' : scopeMode === 'faculty' ? 'Your Materials' : 'All Streams';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Faculty Performance</h1>
          <p className="text-xs text-slate-400 mt-1">
            Subjects, semesters &amp; sections each faculty teaches, with per-subject query heatmaps.
            <span className="text-slate-300"> Scope: {scopeLabel}</span>
          </p>
        </div>
        <button
          onClick={load}
          className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-slate-400">Loading faculty performance...</p>
        </div>
      ) : faculty.length === 0 ? (
        <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl">
          <UserCheck className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-white">No Faculty Data</h4>
          <p className="text-xs text-slate-400 mt-1">
            Faculty appear here once they upload course materials and students query them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {faculty.map((f) => {
            const maxQ = Math.max(1, ...f.subject_heatmap.map((h) => h.query_count));
            return (
              <div
                key={f.uid}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-800 font-bold flex items-center justify-center text-sm text-indigo-400 flex-shrink-0">
                      {f.name?.charAt(0) || 'F'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{f.name}</p>
                      <p className="text-xs text-slate-400 font-mono truncate">{f.email}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-black text-indigo-400">{f.total_queries}</p>
                    <p className="text-[10px] text-slate-500 uppercase">queries</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-semibold">
                    {(f.stream || '—')}
                  </span>
                  {f.department && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">{f.department}</span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-semibold">
                    {f.doc_count} docs
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <p className="text-slate-500 uppercase font-semibold mb-1">Subjects</p>
                    <div className="flex flex-wrap gap-1">
                      {(f.subjects.length ? f.subjects : ['—']).map((s, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-[110px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase font-semibold mb-1">Sems</p>
                    <div className="flex flex-wrap gap-1">
                      {(f.semesters.length ? f.semesters : ['—']).map((s, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500 uppercase font-semibold mb-1">Sections</p>
                    <div className="flex flex-wrap gap-1">
                      {(f.sections.length ? f.sections : ['—']).map((s, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3" /> Subject heatmap
                  </p>
                  {f.subject_heatmap.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No queries on this faculty&rsquo;s materials yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {f.subject_heatmap
                        .slice()
                        .sort((a, b) => b.query_count - a.query_count)
                        .map((h, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 w-32 truncate">{h.subject}</span>
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full"
                                style={{ width: `${Math.max(6, (h.query_count / maxQ) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-slate-300 w-8 text-right">
                              {h.query_count}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
