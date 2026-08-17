'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { BarChart3, BookOpen, Layers, Filter, CheckCircle2, AlertCircle } from 'lucide-react';

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
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Stream & Department Analytics</h1>
          <p className="text-xs text-slate-400 mt-1">
            Department-wide breakdown of student questions, chunk density, and conceptual proficiency.
          </p>
        </div>

        {/* Semester Filter */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
          <Filter className="w-4 h-4 text-slate-400 ml-2" />
          <span className="text-xs text-slate-400 font-semibold">Semester:</span>
          {['All', '1', '2', '3', '4', '5', '6'].map((sem) => (
            <button
              key={sem}
              onClick={() => setSemester(sem)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                semester === sem ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {sem === 'All' ? 'All' : `Sem ${sem}`}
            </button>
          ))}
        </div>
      </div>

      {/* Stream Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-400 uppercase">Department Stream</span>
          <h3 className="text-3xl font-black text-white mt-2 uppercase">{data.stream || 'CSE'}</h3>
          <p className="text-[11px] text-slate-400 mt-1">Computer Science & Engineering</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-400 uppercase">Total Doubts Logged</span>
          <h3 className="text-3xl font-black text-indigo-400 mt-2">{data.total_queries}</h3>
          <p className="text-[11px] text-slate-400 mt-1">Socratic queries in selected semester</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-400 uppercase">Tracked Subjects</span>
          <h3 className="text-3xl font-black text-emerald-400 mt-2">{data.subjects.length}</h3>
          <p className="text-[11px] text-slate-400 mt-1">Active syllabus topics</p>
        </div>
      </div>

      {/* Detailed Subject Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        <h3 className="text-lg font-bold text-white mb-6">Subject Understanding & Query Density</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                <th className="py-3 px-4">Subject Name</th>
                <th className="py-3 px-4">Total Questions</th>
                <th className="py-3 px-4">Active Students</th>
                <th className="py-3 px-4">Content Chunks</th>
                <th className="py-3 px-4">Query Density</th>
                <th className="py-3 px-4">Proficiency Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.subjects.map((sub, i) => (
                <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    <span>{sub.subject}</span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-200">{sub.total_queries}</td>
                  <td className="py-3.5 px-4 text-slate-400">{sub.student_count} students</td>
                  <td className="py-3.5 px-4 text-slate-400">{sub.chunk_count} chunks</td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{sub.query_density} q/chunk</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold ${
                          sub.proficiency_score >= 75
                            ? 'text-emerald-400'
                            : sub.proficiency_score >= 60
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {sub.proficiency_score}%
                      </span>
                      <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden">
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
      </div>
    </div>
  );
}
