'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { BookOpen, AlertCircle, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';

export default function SubjectAnalysisPage() {
  const [subjects, setSubjects] = useState([
    { subject: 'Data Structures', topic: 'Tree Traversal & Binary Search', proficiency: 45, pendingDoubts: 14, action: 'Schedule Concept Revision Session' },
    { subject: 'Operating Systems', topic: 'Process Synchronization & Semaphores', proficiency: 72, pendingDoubts: 6, action: 'Provide Practice Worksheet' },
    { subject: 'Algorithms', topic: 'Dynamic Programming & Memoization', proficiency: 38, pendingDoubts: 19, action: 'Faculty Office Hours Review' },
    { subject: 'DBMS', topic: 'Normal Forms & BCNF Decomposition', proficiency: 84, pendingDoubts: 3, action: 'Advanced Lab Problem' },
  ]);

  const [studentRisks, setStudentRisks] = useState([
    { initials: 'RS', name: 'Rahul Sharma', id: 'CS2101', level: 'Critical', frictionPoints: ['Recursion', 'Trees'], action: 'Targeted Revision' },
    { initials: 'PV', name: 'Priya Varma', id: 'CS2124', level: 'Moderate', frictionPoints: ['Process Sync'], action: 'Extra Assignment' },
    { initials: 'AP', name: 'Amit Patel', id: 'CS2145', level: 'Stable', frictionPoints: ['Hashing'], action: 'None Required' },
  ]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Subject & Concept Deep-Dive Analysis</h1>
        <p className="text-xs text-slate-400 mt-1">
          Topic-level doubt frequency index and automated pedagogical action recommendations for faculty.
        </p>
      </div>

      {/* Topic Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {subjects.map((s, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{s.subject}</span>
                <h3 className="text-lg font-bold text-white mt-1">{s.topic}</h3>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  s.proficiency >= 70
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : s.proficiency >= 50
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {s.proficiency}% Mastery
              </span>
            </div>

            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full ${
                  s.proficiency >= 70 ? 'bg-emerald-500' : s.proficiency >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${s.proficiency}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-800 text-slate-400">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>{s.pendingDoubts} active student doubts</span>
              </span>
              <span className="font-semibold text-indigo-400 bg-indigo-950/60 px-2 py-1 rounded-md">
                {s.action}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Student Intervention Priority */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        <h3 className="text-lg font-bold text-white mb-4">Student Intervention Priority Queue</h3>

        <div className="space-y-3">
          {studentRisks.map((st, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-slate-800 font-bold text-white flex items-center justify-center">
                  {st.initials}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">{st.name}</h4>
                  <p className="text-slate-400">
                    Roll: <span className="font-mono text-slate-300">{st.id}</span> • Friction Areas:{' '}
                    <span className="text-rose-400 font-medium">{st.frictionPoints.join(', ')}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-2.5 py-1 rounded-full font-bold ${
                    st.level === 'Critical'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : st.level === 'Moderate'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {st.level} Risk
                </span>
                <span className="hidden sm:inline font-semibold text-slate-300">{st.action}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
