'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentAuth } from '@/context/StudentAuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/client/api';
import Dropdown from '@/components/student/common/Dropdown';
import { ClipboardCheck, ClipboardList, Loader2, ChevronRight } from 'lucide-react';

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
  const [openingQuizId, setOpeningQuizId] = useState<string | null>(null);
  const [activeQuizzes, setActiveQuizzes] = useState<any[]>([]);

  const allQuizzes = useMemo(() => {
    const incomplete = (activeQuizzes || []).map((q: any) => ({
      ...q,
      is_completed: false,
      timestamp: new Date(q.updated_at || q.created_at || 0).getTime(),
    }));

    const completed = (stats?.quiz_history || []).map((q: any) => ({
      ...q,
      is_completed: true,
      timestamp: new Date(q.submitted_at || q.created_at || 0).getTime(),
    }));

    return [...incomplete, ...completed].sort((a, b) => b.timestamp - a.timestamp);
  }, [activeQuizzes, stats?.quiz_history]);

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
          setSubjects([]);
        }
        if (Array.isArray(filterData.files)) setFiles(filterData.files);
      }

      if (historyData) {
        setStats(historyData);
        if (Array.isArray(historyData.active_quizzes)) {
          setActiveQuizzes(historyData.active_quizzes);
        }
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
        selectedSubject === 'All Subjects' ? 'Comprehensive Assessment' : selectedSubject,
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

  const handleOpenAssessment = async (quizId: string) => {
    try {
      setOpeningQuizId(quizId);
      const detail = await api.quiz.get(quizId);
      if (detail && detail.questions?.length > 0) {
        sessionStorage.setItem(
          'currentQuiz',
          JSON.stringify({
            quiz_id: detail.quiz_id,
            subject: detail.subject,
            questions: detail.questions,
            answers: detail.answers,
            score: detail.score,
            total_questions: detail.total_questions,
            percentage: detail.percentage,
            review_mode: true,
            is_review: true,
          })
        );
        router.push(`/exam/quiz?id=${quizId}`);
      } else {
        showError('Could not load assessment details');
      }
    } catch (err: any) {
      console.error('Failed to open assessment:', err);
      showError(err.message || 'Failed to open assessment');
    } finally {
      setOpeningQuizId(null);
    }
  };

  const handleResumeQuiz = async (quizId: string) => {
    try {
      setOpeningQuizId(quizId);
      const detail = await api.quiz.get(quizId);
      if (detail && detail.questions?.length > 0) {
        sessionStorage.setItem(
          'currentQuiz',
          JSON.stringify({
            quiz_id: detail.quiz_id,
            subject: detail.subject,
            questions: detail.questions,
            answers: detail.answers || {},
            review_answers: detail.review_answers || {},
            status: detail.status || 'in_progress',
            is_review: false,
          })
        );
        router.push(`/exam/quiz?id=${quizId}`);
      } else {
        showError('Could not load quiz details');
      }
    } catch (err: any) {
      console.error('Failed to resume quiz:', err);
      showError(err.message || 'Failed to resume quiz');
    } finally {
      setOpeningQuizId(null);
    }
  };

  const handleDeleteActiveQuiz = async (quizId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Discard this incomplete quiz?')) return;
    try {
      await api.quiz.delete(quizId);
      setActiveQuizzes((prev) => prev.filter((q) => q.quiz_id !== quizId));
    } catch (err: any) {
      showError(err.message || 'Failed to delete quiz');
    }
  };

  return (
    <div className="h-full flex flex-col px-[34px] md:px-[38px] py-4 scrollbar-hide text-slate-800 overflow-hidden font-body bg-slate-50">
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

          <div className="flex flex-col md:flex-row md:items-end gap-5 md:gap-6 mt-5">
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
              className="group relative inline-flex items-center justify-center gap-2.5 h-[42px] px-7 rounded-xl font-headline font-bold text-sm tracking-wide text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_16px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_22px_rgba(37,99,235,0.35)] disabled:opacity-60 disabled:pointer-events-none disabled:shadow-none whitespace-nowrap cursor-pointer shrink-0"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                  <span>Generating Quiz...</span>
                </>
              ) : (
                <>
                  <span>Begin Exam</span>
                  <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1 shrink-0">
                    arrow_forward
                  </span>
                </>
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
                        className="stroke-[#0d47a1] transition-all duration-700"
                        strokeWidth="12"
                        fill="none"
                        strokeDasharray="289"
                        strokeDashoffset={
                          289 - (289 * (stats?.study_completion ?? (stats?.total_quizzes && stats.total_quizzes > 0 ? Math.min(100, stats.total_quizzes * 10) : 0))) / 100
                        }
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[26px] font-black tracking-tight text-slate-800">
                      {stats?.study_completion ?? (stats?.total_quizzes && stats.total_quizzes > 0 ? Math.min(100, stats.total_quizzes * 10) : 0)}%
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
                    {stats && stats.total_quizzes > 0 ? `${Math.round(stats.average_percentage)}%` : '—'}
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

          {/* Right Column (Unified Quiz History) */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">Quiz History</span>
                {allQuizzes.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                    {allQuizzes.length}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleRefreshStats}
                disabled={loadingStats}
                className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 cursor-pointer p-1"
                title="Refresh Assessments"
              >
                <span className={`material-symbols-outlined text-[18px] ${loadingStats ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>

            {/* UNIFIED QUIZ LIST */}
            <div className="flex-1 overflow-y-auto space-y-1 divide-y divide-slate-100 pr-1 scrollbar-hide">
              {allQuizzes.length > 0 ? (
                allQuizzes.map((quiz: any) => {
                  const isOpening = openingQuizId === quiz.quiz_id;
                  const scorePct =
                    quiz.is_completed
                      ? quiz.percentage ??
                        Math.round((quiz.score / (quiz.total_questions || quiz.totalQuestions || 10)) * 100)
                      : null;

                  return (
                    <button
                      key={quiz.quiz_id}
                      type="button"
                      onClick={() =>
                        quiz.is_completed
                          ? handleOpenAssessment(quiz.quiz_id)
                          : handleResumeQuiz(quiz.quiz_id)
                      }
                      disabled={openingQuizId !== null}
                      className="w-full py-3.5 px-3 rounded-xl flex items-center justify-between text-left hover:bg-slate-50 transition-all group cursor-pointer border border-transparent hover:border-slate-200/80 active:scale-[0.99] disabled:opacity-60"
                      title={quiz.is_completed ? 'Click to review this assessment' : 'Click to resume this quiz'}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 flex items-center justify-center w-6 h-6">
                          {isOpening ? (
                            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          ) : quiz.is_completed ? (
                            <ClipboardCheck className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                          ) : (
                            <ClipboardList className="w-5 h-5 text-amber-500 group-hover:text-amber-600 transition-colors" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[14px] text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {quiz.subject}
                          </div>
                          <div className="text-[12px] text-slate-600 font-medium mt-0.5 flex items-center gap-1.5">
                            <span>
                              {quiz.is_completed
                                ? `${quiz.score}/${quiz.total_questions || quiz.totalQuestions || 10} Correct`
                                : `${quiz.answered_count || 0}/${quiz.num_questions || quiz.total_questions || 10} Answered`}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>
                              {new Date(
                                quiz.submitted_at || quiz.updated_at || quiz.created_at
                              ).toLocaleDateString()}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400">
                              {new Date(
                                quiz.submitted_at || quiz.updated_at || quiz.created_at
                              ).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        {quiz.is_completed ? (
                          <div className="text-right">
                            <div
                              className={`text-[18px] font-black leading-none ${
                                (scorePct ?? 0) >= 50 ? 'text-emerald-600' : 'text-amber-600'
                              }`}
                            >
                              {scorePct}%
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">
                              Score
                            </div>
                          </div>
                        ) : (
                          <div className="text-right">
                            <div className="text-[14px] font-bold text-amber-600 leading-none">
                              Incomplete
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">
                              Status
                            </div>
                          </div>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="h-full min-h-[160px] flex flex-col items-center justify-center py-10 text-center text-slate-400">
                  <span className="material-symbols-outlined text-3xl mb-2 text-slate-300">
                    history_edu
                  </span>
                  <p className="text-sm font-medium text-slate-500">No quizzes yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">Start your first test on the left to track progress!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
