'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { BookOpen, Filter } from 'lucide-react';

export default function StreamAnalyticsPage() {
  const [semester, setSemester] = useState('All');
  const [data, setData] = useState<{
    stream: string;
    semester: string;
    total_queries: number;
    subjects: Array<{
      subject: string;
      total_queries: number;
      chunk_count: number;
      student_count: number;
      query_density: number;
      proficiency_score: number;
      pending_doubts: number;
    }>;
  }>({
    stream: 'CSE',
    semester: 'All',
    total_queries: 0,
    subjects: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.analytics
      .stream(semester === 'All' ? undefined : semester)
      .then((res) => {
        if (res) setData(res);
      })
      .finally(() => setLoading(false));
  }, [semester]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Stream & Department Analytics</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Department-wide breakdown of student questions, chunk density, and conceptual proficiency.
          </p>
        </div>

        {/* Semester Filter */}
        <div className="flex items-center gap-1.5 bg-white border border-neutral-200 p-1.5 rounded-xl shadow-sm">
          <Filter className="w-4 h-4 text-neutral-400 ml-2" />
          <span className="text-xs text-neutral-500 font-semibold mr-1">Semester:</span>
          {['All', '1', '2', '3', '4', '5', '6'].map((sem) => (
            <button
              key={sem}
              onClick={() => setSemester(sem)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                semester === sem
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              {sem === 'All' ? 'All' : `Sem ${sem}`}
            </button>
          ))}
        </div>
      </div>

      {/* Stream Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Department Stream</span>
          <h3 className="text-3xl font-bold text-neutral-900 mt-2 uppercase">{data.stream || 'CSE'}</h3>
          <p className="text-xs text-neutral-500 mt-1">Computer Science & Engineering</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Total Doubts Logged</span>
          <h3 className="text-3xl font-bold text-indigo-600 mt-2">{data.total_queries}</h3>
          <p className="text-xs text-neutral-500 mt-1">Socratic queries in selected semester</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Tracked Subjects</span>
          <h3 className="text-3xl font-bold text-emerald-600 mt-2">{data.subjects.length}</h3>
          <p className="text-xs text-neutral-500 mt-1">Active syllabus topics</p>
        </div>
      </div>

      {/* Detailed Subject Table */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
        <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight mb-5">Subject Understanding & Query Density</h3>

        {loading ? (
          <div className="py-12 text-center text-neutral-400 text-xs">Loading analytics...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold">
                  <th className="py-3 px-4">Subject Name</th>
                  <th className="py-3 px-4">Total Questions</th>
                  <th className="py-3 px-4">Active Students</th>
                  <th className="py-3 px-4">Content Chunks</th>
                  <th className="py-3 px-4">Query Density</th>
                  <th className="py-3 px-4">Proficiency Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.subjects.map((sub, i) => (
                  <tr key={i} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-neutral-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <span>{sub.subject}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-neutral-800">{sub.total_queries}</td>
                    <td className="py-3.5 px-4 text-neutral-600">{sub.student_count} students</td>
                    <td className="py-3.5 px-4 text-neutral-600">{sub.chunk_count} chunks</td>
                    <td className="py-3.5 px-4 font-mono text-neutral-700">{sub.query_density} q/chunk</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold ${
                            sub.proficiency_score >= 75
                              ? 'text-emerald-600'
                              : sub.proficiency_score >= 60
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {sub.proficiency_score}%
                        </span>
                        <div className="w-20 bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              sub.proficiency_score >= 75
                                ? 'bg-emerald-500'
                                : sub.proficiency_score >= 60
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${sub.proficiency_score}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
