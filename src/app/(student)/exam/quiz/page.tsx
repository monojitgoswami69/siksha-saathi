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
    async function loadQuiz() {
      let data: any = null;
      const stored = sessionStorage.getItem('currentQuiz');
      if (stored) {
        try {
          data = JSON.parse(stored);
        } catch {}
      }

      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const quizIdParam = urlParams?.get('id');

      if ((!data || !data.questions || data.questions.length === 0) && quizIdParam) {
        try {
          data = await api.quiz.get(quizIdParam);
        } catch (e) {
          console.error('Failed to fetch quiz by id:', e);
        }
      }

      if (!data) {
        router.push('/exam');
        return;
      }

      const questionsList: QuizQuestion[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.questions)
        ? data.questions
        : [];

      if (questionsList.length === 0) {
        router.push('/exam');
        return;
      }

      const normalized: QuizResponse = {
        quiz_id: data.quiz_id || quizIdParam || `quiz_${Date.now()}`,
        subject: data.subject || 'Academic Assessment',
        num_questions: questionsList.length,
        questions: questionsList,
      };

      if (data.is_review || data.review_mode) {
        if (data.answers) {
          setSelectedAnswers(data.answers);
        }
        setQuizState('reviewing');
      }

      setTimeRemaining(Math.max(questionsList.length * 60, 900));
      setQuizData(normalized);
    }

    loadQuiz();
  }, [router]);

  const score = quizData?.questions
    ? quizData.questions.filter((q) => selectedAnswers[q.id] === q.correct_option).length
    : 0;
  const totalQuestions = quizData?.questions?.length ?? 0;
  const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
  const isReviewing = quizState === 'reviewing';
  const correctCount = score;
  const incorrectCount = quizData?.questions
    ? quizData.questions.filter((q) => selectedAnswers[q.id] && selectedAnswers[q.id] !== q.correct_option).length
    : 0;
  const skippedCount = quizData?.questions
    ? quizData.questions.filter((q) => !selectedAnswers[q.id]).length
    : 0;

  const handleSubmitQuiz = useCallback(async () => {
    if (quizData) {
      try {
        await api.quiz.submit({
          quiz_id: quizData.quiz_id,
          subject: quizData.subject,
          score,
          total_questions: totalQuestions,
          answers: selectedAnswers,
          questions: quizData.questions,
          time_taken: timeTaken,
        });
      } catch (err) {
        console.error('Failed to submit quiz', err);
      }
    }
    setQuizState('result_screen');
  }, [quizData, score, totalQuestions, selectedAnswers, timeTaken]);

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
    quizData?.questions?.map((q, idx) => {
      let status: 'attempted' | 'review' | 'skipped' | 'not_visited' | 'correct' | 'incorrect' = 'not_visited';
      if (isReviewing) {
        const studentAns = selectedAnswers[q.id];
        if (!studentAns) {
          status = 'skipped';
        } else if (studentAns === q.correct_option) {
          status = 'correct';
        } else {
          status = 'incorrect';
        }
      } else {
        if (reviewAnswers[q.id]) {
          status = 'review';
        } else if (selectedAnswers[q.id]) {
          status = 'attempted';
        } else if (idx < currentIndex) {
          status = 'skipped';
        } else {
          status = 'not_visited';
        }
      }
      return {
        id: idx + 1,
        questionId: q.id,
        status,
      };
    }) || [];

  const handleSelectAnswer = (label: string) => {
    if (quizState !== 'taking' || !currentQuestion) return;
    const newAnswers = {
      ...selectedAnswers,
      [currentQuestion.id]: label,
    };
    setSelectedAnswers(newAnswers);

    if (quizData?.quiz_id) {
      api.quiz
        .updateProgress(quizData.quiz_id, {
          selected_answers: newAnswers,
          review_answers: reviewAnswers,
          status: 'in_progress',
        })
        .catch((e) => console.warn('Auto-save progress failed:', e));
    }
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
    const newAnswers = { ...selectedAnswers };
    delete newAnswers[currentQuestion.id];
    setSelectedAnswers(newAnswers);

    if (quizData?.quiz_id) {
      api.quiz
        .updateProgress(quizData.quiz_id, {
          selected_answers: newAnswers,
          review_answers: reviewAnswers,
          status: Object.keys(newAnswers).length > 0 ? 'in_progress' : 'available',
        })
        .catch((e) => console.warn('Auto-save progress failed:', e));
    }
  };

  const handleToggleReview = () => {
    if (quizState !== 'taking' || !currentQuestion) return;
    const newReviews = {
      ...reviewAnswers,
      [currentQuestion.id]: !reviewAnswers[currentQuestion.id],
    };
    setReviewAnswers(newReviews);

    if (quizData?.quiz_id) {
      api.quiz
        .updateProgress(quizData.quiz_id, {
          selected_answers: selectedAnswers,
          review_answers: newReviews,
          status: 'in_progress',
        })
        .catch((e) => console.warn('Auto-save progress failed:', e));
    }
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-body p-4">
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

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-body text-[#2e3440] selection:bg-[#5e81ac]/20 overflow-hidden w-full relative">
      {/* Top Banner/Nav */}
      <nav className="z-40 bg-white border-b border-slate-200/80 px-5 flex items-center justify-between h-[54px] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (quizState === 'taking' && Object.keys(selectedAnswers).length > 0) {
                if (confirm('Leave quiz? Your progress will be lost.')) router.push('/exam');
              } else {
                router.push('/exam');
              }
            }}
            className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-50"
            title="Exit Exam"
          >
            <span className="material-symbols-outlined text-[20px] text-slate-400">close</span>
          </button>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {quizData.subject || 'Comprehensive Assessment'}
            </h1>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <p className="text-xs font-medium text-slate-400">
              {isReviewing ? 'Exam Review & Solutions' : 'Knowledge Arena'}
            </p>
          </div>
        </div>

        {/* Status / Timer Widget */}
        {isReviewing ? (
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[16px] text-slate-500">grading</span>
            <span className="text-xs font-bold text-slate-700">
              Score: {score}/{totalQuestions} ({Math.round(percentage)}%)
            </span>
          </div>
        ) : quizState === 'taking' ? (
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200/80 px-3 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[16px] text-orange-500">
              timer
            </span>
            <span className="text-xs font-bold text-orange-700 font-mono tracking-wider">
              {formatTime(timeRemaining)}
            </span>
          </div>
        ) : null}
      </nav>

      {/* Main Container: Sidebar + Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Question Map */}
        <aside className="w-[260px] bg-white border-r border-slate-200/80 flex flex-col flex-shrink-0 z-10 overflow-hidden">
          {/* Scrollable Question Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-5 pb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-4 text-center">
              QUESTION MAP
            </h3>

            {/* Legend Map */}
            {isReviewing ? (
              <div className="grid grid-cols-3 gap-1.5 mb-5 px-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-emerald-600"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Correct
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-red-500"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Wrong
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-yellow-400"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Skipped
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-2 gap-x-2 mb-5 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-xs bg-emerald-600"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Attempted
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-xs bg-red-500"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Review
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-xs bg-yellow-400"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Skipped
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-xs bg-slate-100 border border-slate-300"></div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Unvisited
                  </span>
                </div>
              </div>
            )}

            {/* Question Grid Map */}
            <div className="grid grid-cols-5 gap-1.5">
              {questionsMap.map((q, idx) => {
                let boxClasses = '';

                if (isReviewing) {
                  if (q.status === 'correct') {
                    boxClasses = 'bg-emerald-600 text-white shadow-xs border-emerald-700';
                  } else if (q.status === 'incorrect') {
                    boxClasses = 'bg-red-500 text-white shadow-xs border-red-600';
                  } else {
                    // skipped or not answered
                    boxClasses = 'bg-yellow-400 text-yellow-950 shadow-xs border-yellow-500 font-bold';
                  }
                } else {
                  if (q.status === 'review') {
                    boxClasses = 'bg-red-500 text-white shadow-xs border-red-600';
                  } else if (q.status === 'attempted') {
                    boxClasses = 'bg-emerald-600 text-white shadow-xs border-emerald-700';
                  } else if (q.status === 'skipped') {
                    boxClasses = 'bg-yellow-400 text-yellow-950 shadow-xs border-yellow-500 font-bold';
                  } else {
                    boxClasses = 'bg-slate-50 border-slate-200/80 text-slate-400';
                  }
                }

                if (idx === currentIndex) {
                  boxClasses += ' ring-2 ring-blue-500 ring-offset-1 font-black';
                }

                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all hover:brightness-95 border active:scale-95 cursor-pointer ${boxClasses}`}
                  >
                    {q.id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixed Bottom Features */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
            {isReviewing ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-emerald-50 border border-emerald-200/80 p-2 rounded-xl">
                    <div className="text-base font-bold text-emerald-700 leading-tight">
                      {correctCount}
                    </div>
                    <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">
                      Correct
                    </div>
                  </div>
                  <div className="bg-red-50 border border-red-200/80 p-2 rounded-xl">
                    <div className="text-base font-bold text-red-700 leading-tight">
                      {incorrectCount}
                    </div>
                    <div className="text-[9px] font-bold text-red-600 uppercase tracking-wider mt-0.5">
                      Incorrect
                    </div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200/80 p-2 rounded-xl">
                    <div className="text-base font-bold text-yellow-800 leading-tight">
                      {skippedCount}
                    </div>
                    <div className="text-[9px] font-bold text-yellow-700 uppercase tracking-wider mt-0.5">
                      Skipped
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 p-2.5 rounded-xl text-center shadow-xs">
                  <div className="text-xs font-semibold text-slate-500">
                    Accuracy: <strong className="text-slate-800 font-bold">{Math.round(percentage)}%</strong> ({score}/{totalQuestions})
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => router.push('/exam')}
                  className="w-full h-[38px] bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  <span>Exit Review</span>
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white border border-slate-200/70 p-2.5 rounded-xl text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <div className="text-base font-bold text-emerald-600 leading-tight">
                      {Object.keys(selectedAnswers).length}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      Attempted
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200/70 p-2.5 rounded-xl text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <div className="text-base font-bold text-red-500 leading-tight">
                      {Object.values(reviewAnswers).filter(Boolean).length}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      Review
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  className="w-full h-[38px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs transition-all shadow-[0_2px_8px_rgba(16,185,129,0.2)] active:scale-[0.98] flex items-center justify-center gap-1.5 tracking-wide cursor-pointer"
                >
                  <span>Submit Exam</span>
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Right Section: Question & Options Area */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-hide py-6 px-6">
            <div className="max-w-3xl mx-auto pt-2">
              <h2 className="text-lg md:text-xl font-bold text-slate-800 mb-6 leading-snug tracking-tight">
                {currentQuestion.question}
              </h2>

              {/* Options List */}
              <div className="space-y-3">
                {currentQuestion.options.map((option) => {
                  const isSelected = selectedAnswers[currentQuestion.id] === option.label;
                  const isCorrectAnswer = option.label === currentQuestion.correct_option;

                  let containerClasses = 'bg-white border border-slate-200/80 hover:border-blue-300 hover:shadow-xs';
                  let letterBoxClasses = 'bg-slate-50 border border-slate-200/70 text-slate-500';

                  if (isReviewing) {
                    if (isCorrectAnswer) {
                      containerClasses = 'bg-emerald-50/90 border-emerald-500 ring-1 ring-emerald-500/30';
                      letterBoxClasses = 'bg-emerald-600 text-white border-transparent';
                    } else if (isSelected) {
                      containerClasses = 'bg-red-50/90 border-red-500 ring-1 ring-red-500/30';
                      letterBoxClasses = 'bg-red-500 text-white border-transparent';
                    } else {
                      containerClasses = 'bg-white border-slate-200/60 opacity-60';
                      letterBoxClasses = 'bg-slate-50 border-slate-200/70 text-slate-400';
                    }
                  } else if (isSelected) {
                    containerClasses = 'bg-blue-50/30 border-blue-600 shadow-xs ring-1 ring-blue-500/20';
                    letterBoxClasses = 'bg-blue-600 text-white border-transparent shadow-xs';
                  }

                  return (
                    <div
                      key={option.label}
                      onClick={() => !isReviewing && handleSelectAnswer(option.label)}
                      className={`w-full flex items-center p-3.5 md:p-4 rounded-xl transition-all duration-200 text-left ${containerClasses} ${
                        !isReviewing ? 'cursor-pointer active:scale-[0.99]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3.5 w-full">
                        <span
                          className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs transition-all border ${letterBoxClasses}`}
                        >
                          {option.label}
                        </span>
                        <span
                          className={`text-sm md:text-[15px] font-medium flex-1 text-slate-800 leading-relaxed ${
                            isCorrectAnswer || isSelected ? 'font-semibold' : ''
                          }`}
                        >
                          {option.text}
                        </span>

                        {/* Review Mode Badges */}
                        {isReviewing && isCorrectAnswer && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            <span className="material-symbols-outlined text-[15px]">check_circle</span>
                            {isSelected ? 'Correct • Your Answer' : 'Correct Answer'}
                          </span>
                        )}
                        {isReviewing && isSelected && !isCorrectAnswer && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200 shrink-0">
                            <span className="material-symbols-outlined text-[15px]">cancel</span>
                            Your Choice (Incorrect)
                          </span>
                        )}

                        {/* Taking Mode Radio Indicator */}
                        {!isReviewing && (
                          <div
                            className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-slate-300 bg-transparent'
                            }`}
                          >
                            {isSelected && (
                              <div className="w-2.5 h-2.5 bg-blue-600 rounded-full shadow-xs"></div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explanation box during review mode */}
              {isReviewing && (
                <div className="mt-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-3">
                      {selectedAnswers[currentQuestion.id] === currentQuestion.correct_option ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <span className="material-symbols-outlined text-[15px]">check_circle</span>
                          CORRECT
                        </span>
                      ) : selectedAnswers[currentQuestion.id] ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                          <span className="material-symbols-outlined text-[15px]">cancel</span>
                          INCORRECT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <span className="material-symbols-outlined text-[15px]">help</span>
                          NOT ANSWERED
                        </span>
                      )}

                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="text-slate-500">
                          Your Option:{' '}
                          {selectedAnswers[currentQuestion.id] ? (
                            <strong
                              className={`font-bold ${
                                selectedAnswers[currentQuestion.id] === currentQuestion.correct_option
                                  ? 'text-emerald-700'
                                  : 'text-red-600'
                              }`}
                            >
                              Option {selectedAnswers[currentQuestion.id]}
                            </strong>
                          ) : (
                            <strong className="text-amber-700 font-bold">Not Answered</strong>
                          )}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500">
                          Correct Option:{' '}
                          <strong className="text-emerald-700 font-bold">
                            Option {currentQuestion.correct_option}
                          </strong>
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Explanation & Solution
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {currentQuestion.explanation || 'No detailed explanation provided for this question.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <footer className="h-[74px] bg-white border-t border-slate-200/80 flex items-center justify-between px-6 md:px-10 flex-shrink-0 z-50">
            <div className="w-1/4 flex justify-start">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-2 h-[42px] px-5 rounded-xl font-medium text-sm text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)] disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none whitespace-nowrap cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-slate-400">arrow_back</span>
                <span>Previous</span>
              </button>
            </div>

            <div className="w-2/4 flex items-center justify-center gap-3 md:gap-4">
              {isReviewing ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/70">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">help</span>
                  <span>Question {currentIndex + 1} of {totalQuestions}</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClearAnswer}
                    disabled={!selectedAnswers[currentQuestion.id]}
                    className="inline-flex items-center gap-1.5 h-[42px] px-4 rounded-xl font-medium text-sm text-slate-600 hover:text-red-600 hover:bg-red-50/80 border border-transparent hover:border-red-200/80 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap cursor-pointer"
                    title="Clear selected option"
                  >
                    <span className="material-symbols-outlined text-[18px]">backspace</span>
                    <span>Clear Answer</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`inline-flex items-center gap-2 h-[42px] px-4 rounded-xl font-medium text-sm transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer border ${
                      reviewAnswers[currentQuestion.id]
                        ? 'bg-red-500 text-white border-red-600 shadow-[0_2px_8px_rgba(239,68,68,0.25)]'
                        : 'bg-red-50/80 text-red-700 border-red-200/80 hover:bg-red-100/80 hover:border-red-300'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        reviewAnswers[currentQuestion.id] ? 'fill-white' : 'text-red-500'
                      }`}
                    >
                      bookmark
                    </span>
                    <span>{reviewAnswers[currentQuestion.id] ? 'Marked for Review' : 'Mark for Review'}</span>
                  </button>
                </>
              )}
            </div>

            <div className="w-1/4 flex justify-end">
              {currentIndex === totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={isReviewing ? () => router.push('/exam') : handleSubmitQuiz}
                  className="inline-flex items-center gap-2 h-[42px] px-6 rounded-xl font-headline font-bold text-sm tracking-wide text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_16px_rgba(16,185,129,0.25)] hover:shadow-[0_6px_22px_rgba(16,185,129,0.35)] whitespace-nowrap cursor-pointer"
                >
                  <span>{isReviewing ? 'Finish Review' : 'Submit Exam'}</span>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="group inline-flex items-center gap-2 h-[42px] px-6 rounded-xl font-headline font-bold text-sm tracking-wide text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_16px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_22px_rgba(37,99,235,0.35)] whitespace-nowrap cursor-pointer"
                >
                  <span>Next</span>
                  <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </button>
              )}
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
