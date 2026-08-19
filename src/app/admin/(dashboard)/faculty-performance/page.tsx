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
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Faculty Performance</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Subjects, semesters &amp; sections each faculty teaches, with per-subject query heatmaps.{' '}
            <span className="text-neutral-700 font-semibold">Scope: {scopeLabel}</span>
          </p>
        </div>
        <button
          onClick={load}
          className="p-2.5 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-600 hover:text-neutral-900 transition-colors shadow-sm self-start sm:self-auto"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center bg-white border border-neutral-200 rounded-xl shadow-sm">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-neutral-500">Loading faculty performance...</p>
        </div>
      ) : faculty.length === 0 ? (
        <div className="py-16 text-center bg-white border border-neutral-200 rounded-xl shadow-sm">
          <UserCheck className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-neutral-900">No Faculty Data</h4>
          <p className="text-xs text-neutral-500 mt-1">
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
                className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 font-bold flex items-center justify-center text-sm text-indigo-600 flex-shrink-0">
                      {f.name?.charAt(0) || 'F'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">{f.name}</p>
                      <p className="text-xs text-neutral-500 font-mono truncate">{f.email}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-indigo-600">{f.total_queries}</p>
                    <p className="text-[10px] text-neutral-400 uppercase font-semibold">queries</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 uppercase font-semibold border border-neutral-200">
                    {f.stream || '—'}
                  </span>
                  {f.department && (
                    <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                      {f.department}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                    {f.doc_count} docs
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <p className="text-neutral-400 uppercase font-semibold mb-1 text-[10px]">Subjects</p>
                    <div className="flex flex-wrap gap-1">
                      {(f.subjects.length ? f.subjects : ['—']).map((s, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200 truncate max-w-[110px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-neutral-400 uppercase font-semibold mb-1 text-[10px]">Sems</p>
                    <div className="flex flex-wrap gap-1">
                      {(f.semesters.length ? f.semesters : ['—']).map((s, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-neutral-400 uppercase font-semibold mb-1 text-[10px]">Sections</p>
                    <div className="flex flex-wrap gap-1">
                      {(f.sections.length ? f.sections : ['—']).map((s, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200 uppercase">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100">
                  <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-indigo-600" /> Subject heatmap
                  </p>
                  {f.subject_heatmap.length === 0 ? (
                    <p className="text-[11px] text-neutral-400">No queries on this faculty&rsquo;s materials yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {f.subject_heatmap
                        .slice()
                        .sort((a, b) => b.query_count - a.query_count)
                        .map((h, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] text-neutral-600 w-32 truncate">{h.subject}</span>
                            <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${Math.max(6, (h.query_count / maxQ) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-neutral-800 w-8 text-right font-semibold">
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
