'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentAuth } from '@/context/StudentAuthContext';
import { api } from '@/lib/client/api';
import Dropdown from '@/components/student/common/Dropdown';
import { FilePreview } from '@/components/student/FilePreview';
import { DocumentInfo } from '@/types';

type SortOption = 'name' | 'date' | 'size';
type ViewMode = 'grid' | 'list';

export default function ResourcesPage() {
  const router = useRouter();
  const { user } = useStudentAuth();

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<DocumentInfo | null>(null);
  const [isGeneratingQuizId, setIsGeneratingQuizId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Filters and views
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<SortOption>('name');
  const [searchQuery, setSearchQuery] = useState('');

  const getFileType = (filename: string) => {
    if (!filename) return 'DOC';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toUpperCase() : 'DOC';
  };

  const loadDocs = async () => {
    setIsLoadingDocs(true);
    setDocError(null);
    try {
      const data = await api.documents.list();
      setDocuments(data.documents || []);
    } catch (err: any) {
      console.error('Failed to load documents:', err);
      setDocError('Failed to fetch documents. Please check your data source.');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [user]);

  const handleGenerateQuiz = async (doc: DocumentInfo) => {
    setIsGeneratingQuizId(doc.document_id);
    try {
      const quizData = await api.quiz.generate(doc.subject || 'Course Material', 5, { document_id: doc.document_id });
      sessionStorage.setItem('currentQuiz', JSON.stringify(quizData));
      router.push('/exam/quiz');
    } catch (err: any) {
      alert('Failed to generate quiz: ' + (err.message || 'Error occurred'));
    } finally {
      setIsGeneratingQuizId(null);
    }
  };

  const handleDownload = useCallback(async (doc: DocumentInfo) => {
    setDownloadingId(doc.document_id);
    try {
      await api.documents.download(doc.document_id, doc.file_name || doc.title || 'document');
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download failed. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  }, []);

  // Fetch preview URL when doc is selected
  useEffect(() => {
    if (!selectedPreviewDoc) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const previewInfo = await api.documents.getPreviewUrl(selectedPreviewDoc.document_id);
        if (!cancelled && previewInfo.preview_url) {
          setPreviewUrl(previewInfo.preview_url);
        }
      } catch (err) {
        console.error('Preview fetch failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPreviewDoc]);

  const processedDocs = useMemo(() => {
    let result = [...documents];

    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(
        (doc) =>
          doc.title?.toLowerCase().includes(lowerQ) ||
          doc.subject?.toLowerCase().includes(lowerQ) ||
          doc.file_name?.toLowerCase().includes(lowerQ)
      );
    }

    result.sort((a, b) => {
      if (sortOption === 'name') {
        const nameA = a.title || a.file_name || '';
        const nameB = b.title || b.file_name || '';
        return nameA.localeCompare(nameB);
      } else if (sortOption === 'date') {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      } else if (sortOption === 'size') {
        return (b.chunks_count || b.total_chunks || 0) - (a.chunks_count || a.total_chunks || 0);
      }
      return 0;
    });

    return result;
  }, [documents, searchQuery, sortOption]);

  const groupedDocs = useMemo(() => {
    const groups: Record<string, DocumentInfo[]> = {};
    for (const doc of processedDocs) {
      const subject = doc.subject || 'General / Uncategorized';
      if (!groups[subject]) groups[subject] = [];
      groups[subject].push(doc);
    }
    return groups;
  }, [processedDocs]);

  return (
    <div className="flex-1 overflow-y-auto px-[34px] md:px-[38px] py-4 scrollbar-hide font-body">
      <div className="max-w-full mx-auto space-y-8">
        {/* Header Section */}
        <header className="space-y-4">
          <h1 className="text-3xl font-extrabold text-slate-800 font-headline">Study Resources</h1>
          <p className="text-slate-500 text-sm max-w-2xl leading-relaxed">
            Access all your uploaded study materials securely. Organize, preview, and review your notes,
            grouped elegantly by subject for your convenience.
          </p>
        </header>

        {/* Controls Bar (Sticky) */}
        <div className="sticky top-[-16px] z-20 bg-[#f1f5f9] pt-4 pb-4 -mx-1 px-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
            {/* Search */}
            <div className="relative max-w-sm w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0d47a1]/20 focus:border-[#0d47a1] transition-all placeholder:text-slate-400 font-body"
              />
            </div>

            {/* Filters & View Toggles */}
            <div className="flex items-center gap-3 self-end md:self-auto">
              {/* Sort Dropdown */}
              <Dropdown
                value={sortOption}
                onChange={(val) => setSortOption(val as SortOption)}
                options={[
                  { label: 'Name', value: 'name' },
                  { label: 'Date Uploaded', value: 'date' },
                  { label: 'Size (Chunks)', value: 'size' },
                ]}
                className="w-48"
              />

              {/* View Mode */}
              <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#0d47a1] shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Grid View"
                >
                  <span className="material-symbols-outlined text-[18px]">grid_view</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-[#0d47a1] shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="List View"
                >
                  <span className="material-symbols-outlined text-[18px]">view_list</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Display Documents */}
        {isLoadingDocs ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-[#0d47a1] rounded-full animate-spin"></div>
            <p className="text-slate-500 text-sm font-medium animate-pulse">
              Fetching your resources...
            </p>
          </div>
        ) : docError ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-dashed border-red-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">error</span>
            </div>
            <h3 className="text-lg font-bold text-slate-700">Backend Connection Error</h3>
            <p className="text-slate-500 text-sm mt-2 max-w-sm">{docError}</p>
          </div>
        ) : Object.keys(groupedDocs).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">inbox</span>
            </div>
            <h3 className="text-lg font-bold text-slate-700">No Resources Found</h3>
            <p className="text-slate-500 text-sm mt-2">
              {searchQuery
                ? 'No matches found for your search.'
                : "You haven't uploaded any documents yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-10 pb-20">
            {Object.entries(groupedDocs).map(([subject, docs]) => (
              <section key={subject} className="space-y-4">
                <h2 className="text-xl font-bold text-slate-800 font-headline border-b border-slate-200 pb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0d47a1] text-xl">folder</span>
                  {subject}
                  <span className="ml-2 bg-slate-100 text-slate-500 text-xs py-0.5 px-2.5 rounded-full font-bold">
                    {docs.length}
                  </span>
                </h2>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {docs.map((doc) => (
                      <div
                        key={doc.document_id}
                        onClick={() => setSelectedPreviewDoc(doc)}
                        className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(13,71,161,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col group relative overflow-hidden cursor-pointer"
                      >
                        <div className="absolute top-0 right-0 w-[50px] h-[50px] bg-blue-50 rounded-bl-full -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <button
                          type="button"
                          className="absolute top-1 right-1 p-1 text-slate-400 hover:text-[#0d47a1] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 cursor-pointer hover:scale-125 active:scale-90 group-hover:translate-x-0 translate-x-2 disabled:opacity-50"
                          title="Download resource"
                          disabled={downloadingId === doc.document_id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {downloadingId === doc.document_id ? 'hourglass_top' : 'download'}
                          </span>
                        </button>

                        <h3 className="text-sm font-bold text-slate-800 mb-1 line-clamp-2 leading-snug group-hover:text-[#0d47a1] transition-colors">
                          {doc.title || doc.file_name}
                        </h3>
                        <p className="text-xs font-semibold text-slate-400 capitalize mb-4 line-clamp-1 flex items-center gap-2">
                          {doc.stream || 'General'}{' '}
                          {doc.semester ? `• Sem ${doc.semester}` : ''}
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                            {getFileType(doc.file_name || doc.title)}
                          </span>
                        </p>

                        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/chat?document_id=${doc.document_id}`);
                            }}
                            className="flex-1 bg-blue-50 text-[#0d47a1] py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors text-center cursor-pointer"
                          >
                            Ask Doubt
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleGenerateQuiz(doc);
                            }}
                            disabled={isGeneratingQuizId === doc.document_id}
                            className="flex-1 bg-[#0d47a1] text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-800 transition-colors text-center disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {isGeneratingQuizId === doc.document_id ? '...' : 'Quiz'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {docs.map((doc) => (
                      <div
                        key={doc.document_id}
                        onClick={() => setSelectedPreviewDoc(doc)}
                        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-100 transition-all duration-300 flex items-center gap-6 group cursor-pointer relative"
                      >
                        {/* File Icon column */}
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex flex-col items-center justify-center shrink-0 border border-blue-100 group-hover:scale-105 transition-transform duration-300">
                          <span className="material-symbols-outlined text-[#0d47a1] text-2xl">
                            {getFileType(doc.file_name || doc.title) === 'PDF'
                              ? 'picture_as_pdf'
                              : 'description'}
                          </span>
                          <span className="text-[9px] font-black uppercase text-[#0d47a1]/70 mt-0.5 tracking-tighter line-clamp-1">
                            {getFileType(doc.file_name || doc.title)}
                          </span>
                        </div>

                        {/* Info column */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h3 className="text-[15px] font-bold text-slate-800 truncate group-hover:text-[#0d47a1] transition-colors leading-tight mb-1">
                            {doc.title || doc.file_name}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                            <span className="bg-slate-100 px-2 py-0.5 rounded-lg text-slate-600 border border-slate-200/50">
                              Semester {doc.semester || '-'}
                            </span>
                            <span className="hidden sm:inline w-1 h-1 bg-slate-300 rounded-full"></span>
                            <span className="truncate max-w-[120px] uppercase">
                              {doc.stream || 'General'}
                            </span>
                            {doc.section && (
                              <>
                                <span className="hidden sm:inline w-1 h-1 bg-slate-300 rounded-full"></span>
                                <span className="truncate max-w-[100px] uppercase text-slate-500">
                                  {doc.section}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Date Column */}
                        <div className="hidden lg:flex flex-col items-end shrink-0 mr-4">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                            Modified
                          </span>
                          <span className="text-xs font-bold text-slate-600 mt-1.5">
                            {new Date(doc.created_at || Date.now()).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>

                        {/* Actions column */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/chat?document_id=${doc.document_id}`);
                            }}
                            className="px-4 bg-blue-50 text-[#0d47a1] py-2.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            Ask Doubt
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleGenerateQuiz(doc);
                            }}
                            disabled={isGeneratingQuizId === doc.document_id}
                            className="px-5 w-32 bg-[#0d47a1] text-white py-2.5 rounded-xl text-xs font-bold hover:bg-blue-800 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            {isGeneratingQuizId === doc.document_id ? '...' : 'Generate Quiz'}
                          </button>
                          <button
                            type="button"
                            className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                            disabled={downloadingId === doc.document_id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDownload(doc);
                            }}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {downloadingId === doc.document_id ? 'hourglass_top' : 'download'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/* Document Preview Modal */}
        {selectedPreviewDoc && (
          <FilePreview
            document={selectedPreviewDoc}
            previewUrl={previewUrl}
            onClose={() => setSelectedPreviewDoc(null)}
            onDownload={() => handleDownload(selectedPreviewDoc)}
          />
        )}
      </div>
    </div>
  );
}
