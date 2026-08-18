'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, DocumentInfo } from '@/types';
import { api } from '@/lib/client/api';
import { FilePreview } from '@/components/student/FilePreview';
import { BookOpen, FileText, ExternalLink } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  userName?: string | null;
  userEmail?: string | null;
}

export function ChatArea({ messages, isStreaming, userName, userEmail }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const [previewDoc, setPreviewDoc] = useState<DocumentInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number | undefined>(undefined);
  const [highlightedChunk, setHighlightedChunk] = useState<{
    text: string;
    paragraph_id?: string;
    chunk_type?: string;
    page?: number;
  } | null>(null);

  const isNearBottom = () => {
    const container = scrollRef.current;
    if (!container) return true;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= 120;
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (!isNearBottom()) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: isStreaming ? 'auto' : 'smooth',
      });
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [messages, isStreaming]);

  const handleOpenSource = async (docId?: string, title?: string, page?: number) => {
    if (!docId) return;
    setPreviewDoc({
      id: docId,
      document_id: docId,
      title: title || 'Course Document',
      file_name: title || 'document.pdf',
    } as DocumentInfo);
    setPreviewPage(page);
    setPreviewUrl(null);
    setHighlightedChunk(null);

    try {
      const res = await api.documents.getPreviewUrl(docId);
      setPreviewUrl(res.preview_url || null);
    } catch {
      setPreviewUrl(null);
    }
  };

  // Open a specific chunk by ordinal (from an inline [[#n]] citation).
  const handleOpenCitation = async (
    n: number,
    sources?: Array<any>
  ): Promise<void> => {
    const src = sources?.find((s) => s.n === n) || sources?.[n - 1];
    if (!src) return;
    const docId = src.document_id;
    const chunkId = src.chunk_id;
    setPreviewDoc({
      id: docId,
      document_id: docId,
      title: src.title || src.file_name || 'Course Document',
      file_name: src.file_name || src.title || 'document.pdf',
    } as DocumentInfo);
    setPreviewPage(src.page);
    setPreviewUrl(null);
    setHighlightedChunk(null);

    if (docId && chunkId) {
      try {
        const res = await api.documents.getChunk(docId, chunkId);
        setPreviewUrl(res.preview_url || null);
        setHighlightedChunk({
          text: res.chunk?.raw_content || '',
          paragraph_id: res.chunk?.paragraph_id,
          chunk_type: res.chunk?.chunk_type,
          page: res.chunk?.page_start || src.page,
        });
      } catch {
        // Fall back to plain preview fetch
        try {
          const r2 = await api.documents.getPreviewUrl(docId);
          setPreviewUrl(r2.preview_url || null);
        } catch {}
      }
    } else if (docId) {
      try {
        const r2 = await api.documents.getPreviewUrl(docId);
        setPreviewUrl(r2.preview_url || null);
      } catch {}
    }
  };

  // Convert [[#n]] citation tags into markdown links a custom renderer turns
  // into clickable chips. cite://<n> hrefs are intercepted (never navigated).
  const renderCitations = (content: string) =>
    content.replace(/\[\[#(\d+)\]\]/g, (_, n) => `[#${n}](cite://${n})`);

  if (messages.length === 0) {
    const firstName = userName ? userName.split(' ')[0] : 'Student';
    return (
      <div className="flex-1 px-8 py-10 overflow-y-auto w-full space-y-8 pb-32 flex flex-col items-center justify-center font-body">
        <div className="flex flex-col items-center justify-center py-12 text-center max-w-5xl mx-auto w-full">
          <h2 className="text-3xl font-extrabold font-headline tracking-tight text-slate-800">
            How can I help you today, {firstName}?
          </h2>
          <p className="text-slate-500/70 text-sm mt-3 max-w-sm">
            Ask a question to start learning with your Socratic AI course tutor!
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 px-4 md:px-8 py-6 overflow-y-auto overflow-x-hidden w-full mb-32 flex flex-col items-center font-chat"
      >
        <div className="w-full max-w-3xl flex flex-col">
          {messages.map((msg, idx) => {
            const isBot = (msg.role as string) !== 'user';
            const isLastBot = isBot && idx === messages.length - 1;
            const isStreamingThis = isLastBot && isStreaming;
            const isEmpty = isBot && !msg.content;
            const previousRole = idx > 0 ? messages[idx - 1].role : null;
            const previousIsUser = previousRole === 'user';
            const sources = msg.sources || [];

            return (
              <div key={idx} className="flex flex-col w-full">
                <div
                  className={`w-full flex items-start gap-4 md:gap-6 ${
                    idx > 0 && !isBot ? 'mt-8' : 'mt-0'
                  }`}
                >
                  {/* Avatar */}
                  {isBot ? (
                    <div className="w-8 h-8 flex-shrink-0"></div>
                  ) : (
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-100 border border-slate-200 shadow-sm">
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${
                          userEmail || userName || 'default'
                        }&backgroundColor=b6e3f4`}
                        alt="User"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {isBot && idx > 0 && previousIsUser && (
                      <div className="w-full h-[2px] bg-slate-300/80 my-3" />
                    )}

                    {!isBot ? (
                      <div
                        className="text-[15px] md:text-base leading-relaxed text-slate-800 whitespace-pre-wrap mt-1"
                        style={{ fontFamily: '"JetBrains Mono", monospace' }}
                      >
                        {msg.content}
                      </div>
                    ) : (
                      <div
                        className={`text-[15px] md:text-base leading-relaxed text-[#23457a] w-full ${
                          isStreamingThis ? 'streaming-bubble' : ''
                        }`}
                      >
                        {isEmpty ? (
                          <div className="flex items-center gap-2 text-[#23457a]/50 mt-2">
                            <span className="flex gap-1">
                              <span
                                className="w-1.5 h-1.5 bg-[#23457a]/50 rounded-full animate-bounce"
                                style={{ animationDelay: '0ms' }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-[#23457a]/50 rounded-full animate-bounce"
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-[#23457a]/50 rounded-full animate-bounce"
                                style={{ animationDelay: '300ms' }}
                              />
                            </span>
                          </div>
                        ) : (
                          <>
                            <div
                              className="prose prose-slate max-w-none 
                                prose-p:mt-1 prose-p:mb-2 prose-p:leading-relaxed prose-p:first:mt-1 prose-p:text-[#23457a]
                                prose-ul:my-3 prose-ol:my-3 prose-li:my-1.5 prose-li:text-[#23457a] prose-li:leading-relaxed
                                prose-headings:font-bold prose-headings:text-[#1e3a63] prose-headings:mt-6 prose-headings:mb-3 prose-headings:first:mt-1
                                prose-code:bg-slate-100/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[14px] prose-code:text-[#0d47a1] prose-code:before:content-none prose-code:after:content-none
                                prose-pre:bg-[#0f172a] prose-pre:text-slate-50 prose-pre:rounded-xl prose-pre:p-4 prose-pre:my-4 prose-pre:shadow-sm
                                prose-strong:text-[#193259] prose-strong:font-semibold
                                prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                                prose-hr:my-8 prose-hr:border-slate-300/70"
                              style={{ fontFamily: '"JetBrains Mono", monospace' }}
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ href, children }) => {
                                    if (href && href.startsWith('cite://')) {
                                      const n = parseInt(href.replace('cite://', ''), 10);
                                      return (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            handleOpenCitation(n, msg.sources);
                                          }}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 align-middle cursor-pointer"
                                          title={`Open source #${n}`}
                                        >
                                          <FileText className="w-2.5 h-2.5" />#{n}
                                        </button>
                                      );
                                    }
                                    return (
                                      <a href={href} target="_blank" rel="noopener noreferrer">
                                        {children}
                                      </a>
                                    );
                                  },
                                }}
                              >
                                {renderCitations(msg.content)}
                              </ReactMarkdown>
                              {isStreamingThis && (
                                <span className="inline-block w-2 h-4 bg-slate-400 ml-1 animate-pulse rounded-sm align-middle" />
                              )}
                            </div>

                            {/* Interactive Grounded Sources */}
                            {sources.length > 0 && !isStreamingThis && (
                              <div className="mt-4 pt-3 border-t border-slate-200/60">
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wider">
                                  <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>Verified Course Sources</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {sources.map((src: any, i: number) => {
                                    const title = typeof src === 'string' ? src : src.title || src.file_name || 'Document';
                                    const page = typeof src === 'object' ? src.page : undefined;
                                    const docId = typeof src === 'object' ? src.document_id : undefined;

                                    return (
                                      <button
                                        key={i}
                                        onClick={() => handleOpenSource(docId, title, page)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer shadow-xs"
                                        title={`View "${title}" ${page ? `(Page ${page})` : ''}`}
                                      >
                                        <FileText className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                        <span className="truncate max-w-[200px]">{title}</span>
                                        {page && (
                                          <span className="px-1 py-0.2 bg-indigo-200/80 text-indigo-900 rounded text-[10px] font-bold">
                                            p. {page}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <FilePreview
        document={previewDoc}
        previewUrl={previewUrl}
        initialPage={previewPage}
        highlightedChunk={highlightedChunk}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewUrl(null);
          setPreviewPage(undefined);
          setHighlightedChunk(null);
        }}
      />
    </>
  );
}

export default ChatArea;
