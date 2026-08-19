'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { BookOpen, AlertCircle, RefreshCw } from 'lucide-react';

export default function SubjectAnalysisPage() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [atRisk, setAtRisk] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [streamRes, overviewRes] = await Promise.all([
        api.analytics.stream().catch(() => ({ subjects: [] })),
        api.analytics.overview().catch(() => ({ at_risk_students: [], weak_domains: [] })),
      ]);
      const subs = (streamRes.subjects || []).map((s: any) => ({
        subject: s.subject,
        proficiency: s.proficiency_score ?? 0,
        pendingDoubts: s.total_queries ?? 0,
        chunkCount: s.chunk_count ?? 0,
        studentCount: s.student_count ?? 0,
        queryDensity: s.query_density ?? 0,
      }));
      setSubjects(subs);

      const risks = (overviewRes.at_risk_students || []).map((s: any) => ({
        name: s.name,
        id: s.roll,
        level: s.total_queries >= 30 ? 'Critical' : s.total_queries >= 15 ? 'Moderate' : 'Stable',
        frictionPoints: s.top_subjects || [],
        total: s.total_queries,
      }));
      setAtRisk(risks);
    } catch {
      setSubjects([]);
      setAtRisk([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Subject & Concept Deep-Dive Analysis</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Per-subject query density, proficiency scores, and at-risk student identification — scoped to your role.
          </p>
        </div>
        <button
          onClick={load}
          className="p-2.5 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-600 hover:text-neutral-900 transition-colors shadow-sm"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center bg-white border border-neutral-200 rounded-xl shadow-sm">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-neutral-500">Loading subject analytics...</p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="py-16 text-center bg-white border border-neutral-200 rounded-xl shadow-sm">
          <BookOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-neutral-900">No Subject Data Yet</h4>
          <p className="text-xs text-neutral-500 mt-1">Subjects appear here once students query course materials.</p>
        </div>
      ) : (
        <>
          {/* Subject Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {subjects.map((s, i) => (
              <div key={i} className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{s.subject}</span>
                    <h3 className="text-base font-bold text-neutral-900 mt-1">{s.chunkCount} chunks • {s.studentCount} students</h3>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    s.proficiency >= 70
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : s.proficiency >= 50
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {s.proficiency}% Mastery
                  </span>
                </div>

                <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden mb-4">
                  <div className={`h-full rounded-full ${
                    s.proficiency >= 70 ? 'bg-emerald-500' : s.proficiency >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                  }`} style={{ width: `${s.proficiency}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs pt-3 border-t border-neutral-100 text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span>{s.pendingDoubts} queries (density: {s.queryDensity})</span>
                  </span>
                  <span className={`font-semibold px-2 py-1 rounded-md text-[11px] ${
                    s.proficiency < 50 ? 'text-rose-700 bg-rose-50 border border-rose-100' :
                    s.proficiency < 70 ? 'text-amber-700 bg-amber-50 border border-amber-100' :
                    'text-emerald-700 bg-emerald-50 border border-emerald-100'
                  }`}>
                    {s.proficiency < 50 ? 'Schedule Revision Session' : s.proficiency < 70 ? 'Provide Practice Worksheet' : 'Advanced Lab Problem'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* At-Risk Students */}
          {atRisk.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
              <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight mb-4">At-Risk Student Intervention Queue</h3>
              <div className="space-y-3">
                {atRisk.map((st, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 bg-neutral-50/70 border border-neutral-200 rounded-xl text-xs">
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 font-bold text-indigo-700 flex items-center justify-center flex-shrink-0">
                        {(st.name || '?').charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-neutral-900 text-xs">{st.name}</h4>
                        <p className="text-neutral-500">
                          Roll: <span className="font-mono text-neutral-700">{st.id}</span> • Friction:{' '}
                          <span className="text-rose-600 font-medium">{(st.frictionPoints || []).join(', ') || '—'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full font-bold ${
                        st.level === 'Critical'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : st.level === 'Moderate'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {st.level} Risk
                      </span>
                      <span className="text-neutral-500 font-medium">{st.total} queries</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
