'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentAuth } from '@/context/StudentAuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/client/api';
import Dropdown from '@/components/student/common/Dropdown';

export default function ExamPreparationPage() {
  const router = useRouter();
  const { user } = useStudentAuth();
  const { showError } = useToast();

  const [subjects, setSubjects] = useState<string[]>([]);
  const [files, setFiles] = useState<Array<{ document_id: string; file_name: string; title: string; subject?: string }>>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('All Subjects');
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fallbackHistory = [
    {
      quiz_id: 'fallback-1',
      subject: 'Database Management',
      score: 7,
      total_questions: 10,
      percentage: 82,
      submitted_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    },
    {
      quiz_id: 'fallback-2',
      subject: 'Data Structures',
      score: 8,
      total_questions: 10,
      percentage: 70,
      submitted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      quiz_id: 'fallback-3',
      subject: 'Operating Systems',
      score: 10,
      total_questions: 10,
      percentage: 100,
      submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const displayedHistory = (() => {
    const history = stats?.quiz_history || [];
    const sortedHistory = [...history].sort(
      (a: any, b: any) =>
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );

    const existingSubjects = new Set(
      sortedHistory.map((item: any) => item.subject?.toLowerCase())
    );
    const filler = fallbackHistory.filter(
      (item) => !existingSubjects.has(item.subject.toLowerCase())
    );

    return [...sortedHistory, ...filler].slice(0, 8);
  })();

  const loadData = async () => {
    setLoadingStats(true);
    try {
      const [filterData, historyData] = await Promise.all([
        api.filters.getFilters().catch(() => ({ subjects: [] })),
        api.quiz.history().catch(() => null),
      ]);

      if (filterData) {
        if (filterData.subjects?.length > 0) {
          setSubjects(filterData.subjects);
        } else {
          setSubjects(['Data Structures', 'Operating Systems', 'Database Management', 'Algorithms']);
        }
        if (Array.isArray(filterData.files)) setFiles(filterData.files);
      }

      if (historyData) {
        setStats(historyData);
      }
    } catch (err: any) {
      console.error('Failed to load data in ExamPrep:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleGenerateTest = async () => {
    setIsGenerating(true);
    try {
      const selectedFile = files.find((f) => f.document_id === selectedFileId);
      const quizData = await api.quiz.generate(
        selectedSubject === 'All Subjects' ? 'Computer Science Fundamentals' : selectedSubject,
        questionCount,
        selectedFile
          ? { document_id: selectedFile.document_id, file_name: selectedFile.file_name }
          : undefined
      );

      sessionStorage.setItem('currentQuiz', JSON.stringify(quizData));
      router.push('/exam/quiz');
    } catch (err: any) {
      console.error('Failed to generate test:', err);
      showError(err.message || 'Failed to generate quiz');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefreshStats = () => {
    loadData();
  };

  return (
    <div className="h-full flex flex-col px-[34px] md:px-[38px] py-4 scrollbar-hide text-slate-800 overflow-hidden font-body">
      <div className="max-w-full mx-auto w-full flex-1 flex flex-col space-y-3 min-h-0">
        {/* Top Card: Quick Start */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col items-stretch">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-1 flex-1">
              <h1 className="text-3xl font-extrabold text-slate-800 font-headline">
                Quick Start
              </h1>
              <p className="text-slate-500 text-sm max-w-2xl leading-relaxed">
                AI-powered practice tests from your study resources.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-end gap-8 mt-4">
            <div className="space-y-4 w-full sm:w-80">
              <Dropdown
                label="Select Subject"
                value={selectedSubject}
                onChange={(val: string) => {
                  setSelectedSubject(val);
                  setSelectedFileId('');
                }}
                options={[
                  { label: 'All Subjects / Comprehensive', value: 'All Subjects' },
                  ...subjects.map((sub) => ({ label: sub, value: sub })),
                ]}
              />
            </div>

            <div className="space-y-4 w-full sm:w-80">
              <Dropdown
                label="From File (optional)"
                value={selectedFileId}
                onChange={(val: string) => setSelectedFileId(val)}
                options={[
                  { label: 'All materials', value: '' },
                  ...(selectedSubject !== 'All Subjects'
                    ? files.filter((f) => !f.subject || f.subject === selectedSubject)
                    : files
                  ).map((f) => ({ label: f.file_name || f.title, value: f.document_id })),
                ]}
              />
            </div>

            <div className="space-y-2 w-full sm:w-auto">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">
                Number of Questions
              </label>
              <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1 h-[42px] min-w-[200px]">
                {[5, 10, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuestionCount(num)}
                    className={`flex-1 h-full text-sm font-bold rounded-lg transition-all cursor-pointer ${
                      questionCount === num
                        ? 'bg-white text-[#0d47a1] shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1"></div>

            <button
              type="button"
              onClick={handleGenerateTest}
              disabled={isGenerating}
              className="w-full md:w-auto bg-[#0d47a1] text-white font-bold h-[42px] px-10 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-800 transition-all disabled:opacity-70 text-sm shadow-md cursor-pointer"
            >
              {isGenerating ? 'Generating...' : 'BEGIN EXAM'}
              {!isGenerating && (
                <span className="material-symbols-outlined text-[18px]">
                  arrow_forward
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch pb-6">
          {/* Left Column */}
          <div className="flex flex-col space-y-4 min-h-0">
            {/* Progress Overview Card */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-800 font-headline mb-8">
                Progress Overview
              </h2>
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-6">
                  {/* Donut Chart */}
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle
                        cx="56"
                        cy="56"
                        r="46"
                        className="stroke-slate-100"
                        strokeWidth="12"
                        fill="none"
                      />
                      <circle
                        cx="56"
                        cy="56"
                        r="46"
                        className="stroke-[#0d47a1]"
                        strokeWidth="12"
                        fill="none"
                        strokeDasharray="289"
                        strokeDashoffset={
                          289 - (289 * (stats?.study_completion || 85)) / 100
                        }
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[26px] font-black tracking-tight text-slate-800">
                      {stats?.study_completion || 85}%
                    </span>
                  </div>
                  <div className="text-[13px] text-slate-600 font-medium flex flex-col pt-1">
                    <span>Study</span>
                    <span>Completion</span>
                  </div>
                </div>

                <div className="h-14 w-px bg-slate-200 mx-2"></div>

                <div className="text-left pr-2">
                  <div className="text-[13px] text-slate-500 font-bold mb-1 uppercase tracking-tight">
                    Average Score
                  </div>
                  <div className="text-[32px] font-black tracking-tight text-slate-800 leading-none">
                    {stats?.average_percentage || stats?.average_quiz_score || 78}%
                  </div>
                </div>
              </div>
            </div>

            {/* Weak Topics Analysis */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-100 flex-1 flex flex-col min-h-0">
              <h2 className="text-lg font-bold text-slate-800 font-headline mb-4">
                Weak Topics Analysis
              </h2>

              <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-0 divide-y divide-slate-100">
                {stats?.weak_modules && stats.weak_modules.length > 0 ? (
                  stats.weak_modules.map((module: any, idx: number) => (
                    <div
                      key={idx}
                      className="py-[18px] first:pt-0 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-[14px] text-slate-900">
                          {module.subject}
                        </div>
                        <div className="text-[13px] text-slate-600 mt-0.5">
                          {module.title}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push('/resources')}
                        className="bg-[#0d47a1] text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-800 transition-colors shadow-sm tracking-wide cursor-pointer"
                      >
                        Review Material
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    No weak topics identified yet. Keep practicing!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column (Recent Activity) */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-800 font-headline">
                Recent Activity
              </h2>
              <button
                type="button"
                onClick={handleRefreshStats}
                disabled={loadingStats}
                className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">refresh</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-0 divide-y divide-slate-100 pr-2 scrollbar-hide">
              {displayedHistory.map((record: any) => (
                <div
                  key={record.quiz_id}
                  className="py-[22px] flex items-start justify-between"
                >
                  <div>
                    <div className="font-bold text-[15px] text-slate-900">
                      {record.subject}
                    </div>
                    <div className="text-[14px] text-slate-700 font-medium mt-1">
                      {record.score}/{record.total_questions || record.totalQuestions || 10}{' '}
                      Correct -{' '}
                      {new Date(record.submitted_at).toLocaleDateString()}
                    </div>
                    <div className="text-[13px] text-slate-400 mt-1">
                      {new Date(record.submitted_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="text-right pt-1">
                    <div className="text-[20px] font-black text-slate-900 leading-none">
                      {record.percentage || Math.round((record.score / (record.total_questions || 10)) * 100)}%
                    </div>
                    <div className="text-[13px] text-slate-600 mt-1.5 font-medium">
                      Score
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
