'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import {
  BarChart3,
  AlertTriangle,
  Users,
  BookOpen,
  ArrowRight,
  TrendingDown,
  Sparkles,
} from 'lucide-react';

export default function QueryAnalyticsPage() {
  const [data, setData] = useState<{
    total_queries: number;
    total_students: number;
    at_risk_students: Array<{ name: string; roll: string; total_queries: number; top_subjects: string[] }>;
    weak_domains: Array<{ subject: string; proficiency: number; struggling_students?: string[] }>;
    stream: string;
  }>({
    total_queries: 0,
    total_students: 0,
    at_risk_students: [],
    weak_domains: [],
    stream: 'CSE',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.analytics
      .overview()
      .then((res) => {
        if (res) setData(res);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white">Academic Risk & Query Analytics</h1>
        <p className="text-xs text-slate-400 mt-1">
          Machine learning doubt tracking identifying students struggling with complex concepts.
        </p>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-400 uppercase">At-Risk Students</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-black text-rose-400">{data.at_risk_students.length}</span>
            <div className="p-2 bg-rose-950 text-rose-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">High density of conceptual questions</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-400 uppercase">Weak Concept Domains</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-black text-amber-400">{data.weak_domains.length}</span>
            <div className="p-2 bg-amber-950 text-amber-400 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Subjects with lowest understanding ratings</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-400 uppercase">Target Stream</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-black text-indigo-400 uppercase">{data.stream || 'CSE'}</span>
            <div className="p-2 bg-indigo-950 text-indigo-400 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Department wide monitoring</p>
        </div>
      </div>

      {/* At-Risk Students Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <span>Students Requiring Faculty Assistance</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Total Doubts Asked</th>
                <th className="py-3 px-4">Friction Concept Areas</th>
                <th className="py-3 px-4 text-right">Suggested Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.at_risk_students.map((student, i) => (
                <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white">{student.name}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{student.roll}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 bg-rose-950 text-rose-300 rounded font-bold">
                      {student.total_queries} Queries
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1">
                      {student.top_subjects.map((sub, j) => (
                        <span key={j} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-medium">
                          {sub}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="text-indigo-400 font-semibold hover:underline cursor-pointer">
                      Targeted Revision
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weak Concept Domains */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        <h3 className="text-lg font-bold text-white mb-6">Subject Understanding Index</h3>

        <div className="space-y-5">
          {data.weak_domains.map((dom, i) => (
            <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-sm">{dom.subject}</span>
                <span className="text-xs font-bold text-indigo-400">
                  {dom.proficiency}% Comprehension Index
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    dom.proficiency >= 70
                      ? 'bg-emerald-500'
                      : dom.proficiency >= 50
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${dom.proficiency}%` }}
                />
              </div>
              {dom.struggling_students && dom.struggling_students.length > 0 && (
                <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>Struggling Students: {dom.struggling_students.join(', ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
