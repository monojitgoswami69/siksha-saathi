'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentAuth } from '@/context/StudentAuthContext';
import { api } from '@/lib/client/api';
import { QuizResponse, QuizQuestion } from '@/types';

type QuizState = 'taking' | 'result_screen' | 'reviewing';

export default function QuizTakingPage() {
  const router = useRouter();
  const { user } = useStudentAuth();

  const [quizData, setQuizData] = useState<QuizResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [reviewAnswers, setReviewAnswers] = useState<Record<number, boolean>>({});
  const [quizState, setQuizState] = useState<QuizState>('taking');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);

  // Initial load
  useEffect(() => {
    const stored = sessionStorage.getItem('currentQuiz');
    if (!stored) {
      // Fallback sample quiz
      const fallbackQuiz: QuizResponse = {
        quiz_id: 'mock-123',
        subject: 'Sample Academic Quiz',
        num_questions: 3,
        questions: [
          {
            id: 1,
            question: 'What is the primary function of an operating system kernel?',
            options: [
              { label: 'A', text: 'Managing hardware resources and core system execution' },
              { label: 'B', text: 'Displaying web browser graphics' },
              { label: 'C', text: 'Executing high-level spreadsheet calculations' },
              { label: 'D', text: 'Formatting plain text files' },
            ],
            correct_option: 'A',
            explanation:
              'The kernel is the foundational core of an operating system, managing CPU scheduling, memory allocation, and peripheral I/O.',
          },
          {
            id: 2,
            question: 'Which algorithmic complexity denotes logarithmic time growth?',
            options: [
              { label: 'A', text: 'O(n)' },
              { label: 'B', text: 'O(log n)' },
              { label: 'C', text: 'O(n²)' },
              { label: 'D', text: 'O(1)' },
            ],
            correct_option: 'B',
            explanation:
              'O(log n) represents logarithmic time complexity, characteristic of binary search operations.',
          },
          {
            id: 3,
            question: 'In relational database theory, what does ACID stand for?',
            options: [
              { label: 'A', text: 'Atomicity, Consistency, Isolation, Durability' },
              { label: 'B', text: 'Automatic, Concurrent, Isolated, Dynamic' },
              { label: 'C', text: 'Array, Cursor, Index, Database' },
              { label: 'D', text: 'Allocation, Cache, Interface, Driver' },
            ],
            correct_option: 'A',
            explanation:
              'ACID properties guarantee that database transactions are processed reliably.',
          },
        ],
      };

      setQuizData(fallbackQuiz);
      setTimeRemaining(900);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as QuizResponse;
      setTimeRemaining(Math.max((parsed.questions?.length || 5) * 60, 900));
      setQuizData(parsed);
    } catch {
      router.push('/exam');
    }
  }, [router]);

  const score = quizData
    ? quizData.questions.filter((q) => selectedAnswers[q.id] === q.correct_option).length
    : 0;
  const totalQuestions = quizData?.questions.length ?? 0;
  const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

  const handleSubmitQuiz = useCallback(async () => {
    if (quizData) {
      try {
        await api.quiz.submit({
          quiz_id: quizData.quiz_id,
          subject: quizData.subject,
          score,
          total_questions: totalQuestions,
        });
      } catch (err) {
        console.error('Failed to submit quiz', err);
      }
    }
    setQuizState('result_screen');
  }, [quizData, score, totalQuestions]);

  // Timer logic
  useEffect(() => {
    if (quizState !== 'taking' || !quizData) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          handleSubmitQuiz();
          return 0;
        }
        return prev - 1;
      });
      setTimeTaken((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [quizState, quizData, handleSubmitQuiz]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion: QuizQuestion | null = quizData?.questions[currentIndex] ?? null;

  // Build questions map for sidebar tracking
  const questionsMap =
    quizData?.questions.map((q, idx) => ({
      id: idx + 1,
      questionId: q.id,
      status: reviewAnswers[q.id]
        ? 'review'
        : selectedAnswers[q.id]
        ? 'attempted'
        : idx < currentIndex
        ? 'skipped'
        : 'not_visited',
    })) || [];

  const handleSelectAnswer = (label: string) => {
    if (quizState !== 'taking' || !currentQuestion) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: label,
    }));
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleClearAnswer = () => {
    if (quizState !== 'taking' || !currentQuestion) return;
    setSelectedAnswers((prev) => {
      const newAnswers = { ...prev };
      delete newAnswers[currentQuestion.id];
      return newAnswers;
    });
  };

  const handleToggleReview = () => {
    if (quizState !== 'taking' || !currentQuestion) return;
    setReviewAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: !prev[currentQuestion.id],
    }));
  };

  if (!quizData || !currentQuestion) {
    return (
      <div className="flex bg-[#fafafc] h-screen w-screen items-center justify-center font-body">
        <div className="w-8 h-8 border-3 border-slate-200 border-t-[#5e81ac] rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- RESULT SCREEN ---
  if (quizState === 'result_screen') {
    return (
      <div className="min-h-screen bg-[#fafafc] flex items-center justify-center font-body p-4">
        <div className="bg-white rounded-3xl p-10 md:p-12 shadow-xl max-w-lg w-full text-center border border-slate-100">
          <div
            className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
              percentage >= 80
                ? 'bg-green-100'
                : percentage >= 50
                ? 'bg-amber-100'
                : 'bg-red-100'
            }`}
          >
            <span
              className={`material-symbols-outlined text-4xl ${
                percentage >= 80
                  ? 'text-green-600'
                  : percentage >= 50
                  ? 'text-amber-600'
                  : 'text-red-500'
              }`}
            >
              {percentage >= 50 ? 'check_circle' : 'cancel'}
            </span>
          </div>
          <h1 className="text-3xl font-black text-[#2e3440] mb-4">Quiz Completed!</h1>
          <p className="text-lg text-[#4c566a] mb-6">
            You scored <span className="font-black text-[#5e81ac]">{score}</span> out of{' '}
            <span className="font-black">{totalQuestions}</span> questions
          </p>
          <div className="text-5xl font-black text-[#5e81ac] mb-8">
            {Math.round(percentage)}%
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setQuizState('reviewing');
                setCurrentIndex(0);
              }}
              className="px-8 py-4 bg-[#5e81ac] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-[#4c566a] transition-colors shadow-md cursor-pointer"
            >
              Review Answers
            </button>
            <button
              type="button"
              onClick={() => router.push('/exam')}
              className="px-8 py-4 bg-white border-2 border-slate-200 text-[#4c566a] rounded-2xl font-black uppercase tracking-widest hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isReviewing = quizState === 'reviewing';

  return (
    <div className="h-screen bg-[#fafafc] flex flex-col font-body text-[#2e3440] selection:bg-[#5e81ac]/20 overflow-hidden w-full relative">
      {/* Top Banner/Nav */}
      <nav className="z-40 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between h-[70px] flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (quizState === 'taking' && Object.keys(selectedAnswers).length > 0) {
                if (confirm('Leave quiz? Your progress will be lost.')) router.push('/exam');
              } else {
                router.push('/exam');
              }
            }}
            className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-2xl text-slate-300">close</span>
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-[13px] font-bold text-[#4c566a] uppercase tracking-wider">
              {quizData.subject || 'MOCK COMPREHENSIVE EXAM'}
            </h1>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <p className="text-[13px] font-medium text-[#4c566a]/70">Knowledge Arena</p>
          </div>
        </div>

        {/* Timer Widget */}
        {quizState === 'taking' && (
          <div className="flex items-center gap-2 bg-[#fff7ed] border border-orange-100 px-4 py-2 rounded-xl shadow-sm">
            <span className="material-symbols-outlined text-[20px] text-orange-400">
              timer
            </span>
            <span className="text-[15px] font-bold text-orange-600 font-mono tracking-wider">
              {formatTime(timeRemaining)}
            </span>
          </div>
        )}
      </nav>

      {/* Main Container: Sidebar + Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Question Map */}
        <aside className="w-[320px] bg-white border-r border-slate-200 flex flex-col shadow-sm flex-shrink-0 z-10 overflow-hidden">
          {/* Scrollable Question Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-8 pb-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#4c566a]/60 mb-8 text-center">
              QUESTION MAP
            </h3>

            {/* Legend Map */}
            <div className="grid grid-cols-2 gap-y-4 mb-10 pl-2">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-[#22c55e]"></div>
                <span className="text-[10px] font-bold text-[#4c566a]/80 uppercase tracking-wider">
                  ATTEMPTED
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-[#ef4444]"></div>
                <span className="text-[10px] font-bold text-[#4c566a]/80 uppercase tracking-wider">
                  REVIEW
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-[#f59e0b]"></div>
                <span className="text-[10px] font-bold text-[#4c566a]/80 uppercase tracking-wider">
                  SKIPPED
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-[#f1f5f9] border border-slate-200"></div>
                <span className="text-[10px] font-bold text-[#4c566a]/80 uppercase tracking-wider">
                  NOT VISITED
                </span>
              </div>
            </div>

            {/* Question Grid Map */}
            <div className="grid grid-cols-5 gap-3">
              {questionsMap.map((q, idx) => {
                let boxClasses = 'bg-[#f1f5f9] border-transparent text-[#4c566a]/40';

                if (q.status === 'review') {
                  boxClasses = 'bg-[#ef4444] text-white shadow-sm ring-red-500/20';
                } else if (q.status === 'attempted') {
                  boxClasses = 'bg-[#22c55e] text-white shadow-sm ring-green-500/20';
                } else if (q.status === 'skipped') {
                  boxClasses = 'bg-[#f59e0b] text-white shadow-sm ring-orange-500/20';
                }

                if (idx === currentIndex) {
                  boxClasses =
                    'border-[#5e81ac] text-[#5e81ac] bg-blue-50 transition-all scale-110 z-10 shadow-sm font-black';
                }

                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-all hover:brightness-95 border active:scale-95 cursor-pointer ${boxClasses}`}
                  >
                    {q.id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixed Bottom Features */}
          <div className="p-6 border-t border-slate-100 bg-[#fcfdfe]/50 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-100 p-4 rounded-[20px] text-center shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <div className="text-xl font-black text-[#10b981] mb-1 tracking-tight">
                  {Object.keys(selectedAnswers).length}
                </div>
                <div className="text-[9px] font-black text-[#4c566a]/40 uppercase tracking-[0.1em]">
                  ATTEMPTED
                </div>
              </div>
              <div className="bg-white border border-slate-100 p-4 rounded-[20px] text-center shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <div className="text-xl font-black text-[#5e81ac] mb-1 tracking-tight">
                  {Object.values(reviewAnswers).filter(Boolean).length}
                </div>
                <div className="text-[9px] font-black text-[#4c566a]/40 uppercase tracking-[0.1em]">
                  REVIEW
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitQuiz}
              className="w-full h-[52px] bg-[#6d8bbd] hover:bg-[#5e81ac] text-white rounded-[16px] font-bold text-sm transition-all shadow-[0_4px_12px_rgba(109,139,189,0.2)] active:scale-[0.98] flex items-center justify-center tracking-wide cursor-pointer"
            >
              Submit Exam
            </button>
          </div>
        </aside>

        {/* Right Section: Question & Options Area */}
        <div className="flex-1 flex flex-col bg-[#fafafc] overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-10 px-4">
            <div className="max-w-6xl mx-auto py-10 px-2">
              <div className="flex items-center justify-between mb-10">
                <div className="inline-flex items-center px-4 py-1.5 bg-blue-50 rounded-full text-[#5e81ac] border border-blue-100 shadow-sm">
                  <span className="text-[11px] font-black tracking-[0.1em] uppercase flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-[#5e81ac]">
                      help
                    </span>
                    QUESTION {String(currentIndex + 1).padStart(2, '0')} OF {totalQuestions}
                  </span>
                </div>
                <span className="text-[11px] font-black text-[#4c566a]/40 uppercase tracking-widest">
                  POINTS: 2.0
                </span>
              </div>

              <h2 className="text-[26px] font-black text-[#2e3440] mb-12 leading-tight tracking-tight">
                {currentQuestion.question}
              </h2>

              {/* Options List */}
              <div className="space-y-4">
                {currentQuestion.options.map((option) => {
                  const isSelected = selectedAnswers[currentQuestion.id] === option.label;

                  let containerClasses =
                    'bg-white border border-slate-200/80 hover:border-[#5e81ac]/30 hover:shadow-lg hover:-translate-y-0.5';
                  let letterBoxClasses = 'bg-slate-50 border border-slate-100 text-[#4c566a]/50';

                  if (isSelected) {
                    containerClasses =
                      'bg-white border-[#5e81ac] shadow-[0_10px_25px_rgba(94,129,172,0.15)] ring-1 ring-[#5e81ac]/20';
                    letterBoxClasses = 'bg-[#5e81ac] text-white border-transparent shadow-md';
                  }

                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => !isReviewing && handleSelectAnswer(option.label)}
                      disabled={isReviewing}
                      className={`w-full flex items-center p-6 rounded-3xl group transition-all duration-300 text-left active:scale-[0.98] cursor-pointer ${containerClasses}`}
                    >
                      <div className="flex items-center gap-6 w-full">
                        <span
                          className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center font-black text-base transition-all border ${letterBoxClasses}`}
                        >
                          {option.label}
                        </span>
                        <span
                          className={`text-[17px] font-bold flex-1 text-[#4c566a] transition-colors group-hover:text-[#2e3440] ${
                            isSelected ? 'text-[#2e3440]' : ''
                          }`}
                        >
                          {option.text}
                        </span>
                        <div
                          className={`w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-[#5e81ac] bg-[#f0f7ff]'
                              : 'border-slate-200 bg-transparent'
                          }`}
                        >
                          {isSelected && (
                            <div className="w-3.5 h-3.5 bg-[#5e81ac] rounded-full shadow-sm animate-in zoom-in-50 duration-300"></div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Explanation box during review mode */}
              {isReviewing && currentQuestion.explanation && (
                <div className="mt-12 bg-blue-50 border border-blue-100 rounded-3xl p-8 animate-in slide-in-from-bottom-5 duration-500">
                  <h4 className="text-[12px] font-black text-[#5e81ac] uppercase tracking-widest mb-4">
                    EXPLANATION
                  </h4>
                  <p className="text-base font-medium text-[#4c566a] leading-relaxed">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <footer className="h-[100px] bg-white border-t border-slate-200 flex items-center justify-between px-12 flex-shrink-0 z-50">
            <div className="w-1/3">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="h-[52px] px-8 bg-blue-50 text-[#5e81ac] rounded-2xl font-black text-[13px] uppercase tracking-widest flex items-center gap-2 transition-all hover:brightness-95 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                PREVIOUS
              </button>
            </div>

            <div className="w-1/3 flex items-center justify-center gap-6">
              {!isReviewing && (
                <>
                  <button
                    type="button"
                    onClick={handleClearAnswer}
                    className="h-[52px] px-8 bg-red-50 text-red-500 rounded-2xl font-black text-[13px] uppercase tracking-widest transition-all hover:brightness-95 active:scale-95 cursor-pointer"
                  >
                    CLEAR ANSWER
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`h-[52px] px-8 rounded-2xl font-black text-[13px] uppercase tracking-widest flex items-center gap-2 transition-all hover:brightness-95 active:scale-95 border cursor-pointer ${
                      reviewAnswers[currentQuestion.id]
                        ? 'text-white bg-orange-500 border-orange-500 shadow-sm'
                        : 'text-orange-500 bg-orange-50 border-orange-100'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        reviewAnswers[currentQuestion.id] ? 'fill-white' : ''
                      }`}
                    >
                      bookmark
                    </span>
                    {reviewAnswers[currentQuestion.id] ? 'MARKED' : 'MARK REVIEW'}
                  </button>
                </>
              )}
            </div>

            <div className="w-1/3 flex justify-end">
              {currentIndex === totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  className="h-[52px] px-10 bg-blue-50 text-[#5e81ac] rounded-2xl font-black text-[13px] uppercase tracking-widest flex items-center gap-2 transition-all hover:brightness-95 active:scale-95 cursor-pointer"
                >
                  {isReviewing ? 'FINISH REVIEW' : 'SUBMIT EXAM'}
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-[52px] px-12 bg-blue-50 text-[#5e81ac] rounded-2xl font-black text-[13px] uppercase tracking-widest flex items-center gap-3 transition-all hover:brightness-95 active:scale-95 cursor-pointer"
                >
                  NEXT
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              )}
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
