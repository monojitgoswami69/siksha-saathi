'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { BookOpen, AlertCircle, RefreshCw, X, ChevronRight, GraduationCap, TrendingDown } from 'lucide-react';

export default function SubjectAnalysisPage() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [atRisk, setAtRisk] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [subjectDetail, setSubjectDetail] = useState<any>(null);
  const [subjectLoading, setSubjectLoading] = useState(false);

  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [studentLoading, setStudentLoading] = useState(false);

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
        uid: s.id,
        name: s.name,
        roll: s.roll,
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

  const loadSubjectDetail = async (subject: string) => {
    setSelectedSubject(subject);
    setSubjectLoading(true);
    setSubjectDetail(null);
    try {
      const res = await api.analytics.subject(subject);
      setSubjectDetail(res);
    } catch {
      setSubjectDetail(null);
    } finally {
      setSubjectLoading(false);
    }
  };

  const loadStudentDetail = async (uid: string) => {
    setSelectedStudentUid(uid);
    setStudentLoading(true);
    setStudentDetail(null);
    try {
      const res = await api.analytics.student(uid);
      setStudentDetail(res);
    } catch {
      setStudentDetail(null);
    } finally {
      setStudentLoading(false);
    }
  };

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
              <div
                key={i}
                onClick={() => loadSubjectDetail(s.subject)}
                className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
              >
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
                  <span className="flex items-center gap-1 text-indigo-600 font-semibold">
                    Drill down <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* At-Risk Students */}
          {atRisk.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
              <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight mb-4">At-Risk Student Intervention Queue</h3>
              <p className="text-xs text-neutral-500 mb-4">Click any student to view their detailed query and quiz analytics.</p>
              <div className="space-y-3">
                {atRisk.map((st, i) => (
                  <div
                    key={i}
                    onClick={() => loadStudentDetail(st.uid)}
                    className="flex items-center justify-between p-3.5 bg-neutral-50/70 border border-neutral-200 rounded-xl text-xs cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 font-bold text-indigo-700 flex items-center justify-center flex-shrink-0">
                        {(st.name || '?').charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-neutral-900 text-xs">{st.name}</h4>
                        <p className="text-neutral-500">
                          Roll: <span className="font-mono text-neutral-700">{st.roll}</span> • Friction:{' '}
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
                      <ChevronRight className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Subject Drill-Down Modal */}
      {selectedSubject && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSubject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-neutral-100">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">{selectedSubject}</h2>
                <p className="text-xs text-neutral-500">Subject-level deep-dive analytics</p>
              </div>
              <button onClick={() => setSelectedSubject(null)} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {subjectLoading ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs text-neutral-500">Loading subject detail...</p>
                </div>
              ) : subjectDetail ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-indigo-700">{subjectDetail.total_queries || 0}</div>
                      <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mt-1">Total Queries</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-700">{subjectDetail.student_count || 0}</div>
                      <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mt-1">Students</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-amber-700">{subjectDetail.proficiency || 0}%</div>
                      <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mt-1">Proficiency</div>
                    </div>
                  </div>

                  {subjectDetail.semester_breakdown && subjectDetail.semester_breakdown.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-3">Semester Breakdown</h4>
                      <div className="space-y-2">
                        {subjectDetail.semester_breakdown.map((sem: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs">
                            <span className="font-semibold text-neutral-700">Semester {sem.semester}</span>
                            <span className="font-bold text-indigo-600">{sem.query_count} queries</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-neutral-500 text-center py-8">No data available for this subject.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Student Drill-Down Modal */}
      {selectedStudentUid && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStudentUid(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 font-bold text-indigo-700 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">{studentDetail?.student?.name || 'Student'}</h2>
                  <p className="text-xs text-neutral-500">{studentDetail?.student?.email || ''}</p>
                </div>
              </div>
              <button onClick={() => setSelectedStudentUid(null)} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {studentLoading ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs text-neutral-500">Loading student analytics...</p>
                </div>
              ) : studentDetail ? (
                <>
                  {/* Student Profile */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Roll</div>
                      <div className="text-sm font-bold text-neutral-900 mt-0.5">{studentDetail.student?.roll || '—'}</div>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Stream</div>
                      <div className="text-sm font-bold text-neutral-900 mt-0.5 uppercase">{studentDetail.student?.stream || '—'}</div>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Semester</div>
                      <div className="text-sm font-bold text-neutral-900 mt-0.5">{studentDetail.student?.sem || '—'}</div>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Section</div>
                      <div className="text-sm font-bold text-neutral-900 mt-0.5">{studentDetail.student?.section || '—'}</div>
                    </div>
                  </div>

                  {/* Total Queries */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-indigo-700">{studentDetail.total_queries || 0}</div>
                    <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mt-1">Total Socratic Queries</div>
                  </div>

                  {/* Queries by Subject */}
                  {studentDetail.queries_by_subject && studentDetail.queries_by_subject.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                        Friction Points (Queries by Subject)
                      </h4>
                      <div className="space-y-2">
                        {studentDetail.queries_by_subject.map((qs: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs">
                            <span className="font-semibold text-neutral-700">{qs.subject || 'General'}</span>
                            <span className="font-bold text-rose-600">{qs.count} queries</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Quizzes */}
                  {studentDetail.recent_quizzes && studentDetail.recent_quizzes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-3">Recent Quiz Performance</h4>
                      <div className="space-y-2">
                        {studentDetail.recent_quizzes.map((quiz: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs">
                            <div>
                              <span className="font-bold text-neutral-900">{quiz.score}/{quiz.total_questions}</span>
                              <span className="text-neutral-500 ml-2">({quiz.percentage}%)</span>
                            </div>
                            <span className="text-neutral-500">{new Date(quiz.submitted_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-neutral-500 text-center py-8">No data available for this student.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
