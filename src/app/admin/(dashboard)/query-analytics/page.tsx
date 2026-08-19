'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import {
  AlertTriangle,
  Users,
  BookOpen,
  TrendingDown,
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
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Academic Risk & Query Analytics</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Machine learning doubt tracking identifying students struggling with complex concepts.
        </p>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">At-Risk Students</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-bold text-rose-600">{data.at_risk_students.length}</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-2">High density of conceptual questions</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Weak Concept Domains</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-bold text-amber-600">{data.weak_domains.length}</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-2">Subjects with lowest understanding ratings</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Target Stream</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-bold text-indigo-600 uppercase">{data.stream || 'CSE'}</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-2">Department wide monitoring</p>
        </div>
      </div>

      {/* At-Risk Students Table */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
        <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>Students Requiring Faculty Assistance</span>
        </h3>

        {loading ? (
          <div className="py-12 text-center text-neutral-400 text-xs">Loading risk data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold">
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Total Doubts Asked</th>
                  <th className="py-3 px-4">Friction Concept Areas</th>
                  <th className="py-3 px-4 text-right">Suggested Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.at_risk_students.map((student, i) => (
                  <tr key={i} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-neutral-900">{student.name}</td>
                    <td className="py-3.5 px-4 font-mono text-neutral-600">{student.roll}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded font-bold">
                        {student.total_queries} Queries
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {student.top_subjects.map((sub, j) => (
                          <span key={j} className="px-2 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-200 rounded font-medium text-[11px]">
                            {sub}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer">
                        Targeted Revision
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weak Concept Domains */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
        <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight mb-6">Subject Understanding Index</h3>

        <div className="space-y-4">
          {data.weak_domains.map((dom, i) => (
            <div key={i} className="p-4 bg-neutral-50/70 border border-neutral-200 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-neutral-900 text-sm">{dom.subject}</span>
                <span className="text-xs font-bold text-indigo-600">
                  {dom.proficiency}% Comprehension Index
                </span>
              </div>
              <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
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
                <div className="mt-3 text-[11px] text-neutral-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-neutral-400" />
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
