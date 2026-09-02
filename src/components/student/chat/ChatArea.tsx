'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, DocumentInfo } from '@/types';
import { api } from '@/lib/client/api';
import { FilePreview } from '@/components/student/FilePreview';
import { FileText, ExternalLink, Link } from 'lucide-react';

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


  // Open a specific chunk by ordinal (from an inline [[#n]] citation).
  const handleOpenCitation = async (
    n: number,
    sources?: Array<any>
  ): Promise<void> => {
    const src = sources?.find((s) => s.n === n) || sources?.[n - 1];
    if (!src) return;
    const docId = src.document_id;
    const chunkId = src.chunk_id;
    const title = src.title || src.file_name || 'Course Document';
    const fileName = src.file_name || (src.title?.endsWith('.pdf') ? src.title : `${src.title}.pdf`);

    setPreviewDoc({
      id: docId,
      document_id: docId,
      title,
      file_name: fileName,
      subject: src.subject,
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

  const handleOpenSourceItem = async (src: any) => {
    if (!src) return;
    const docId = src.document_id || src.id;
    const chunkId = src.chunk_id;
    const title = src.title || src.file_name || 'Course Document';
    const fileName = src.file_name || (src.title?.endsWith('.pdf') ? src.title : `${src.title}.pdf`);

    setPreviewDoc({
      id: docId,
      document_id: docId,
      title,
      file_name: fileName,
      subject: src.subject,
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

  const getExactSources = (content: string, allSources: any[]): any[] => {
    if (!allSources || allSources.length === 0) return [];

    const ordinals = new Set<number>();
    const re = /(?:\[cite\]\(cite:\/\/|\[\[#?|\[#?|#)(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      ordinals.add(parseInt(m[1], 10));
    }

    let matched: any[] = [];
    if (ordinals.size > 0) {
      const byN = new Map<number, any>();
      allSources.forEach((s: any, idx: number) => {
        const n = typeof s === 'object' && s.n ? s.n : idx + 1;
        byN.set(n, s);
      });
      for (const n of ordinals) {
        if (byN.has(n)) {
          matched.push(byN.get(n));
        }
      }
    }

    // Fallback: if no ordinal was explicitly cited, show top 1 source
    if (matched.length === 0 && allSources.length > 0) {
      matched = [allSources[0]];
    }

    // Deduplicate by document_id and page
    const seen = new Set<string>();
    const deduplicated: any[] = [];
    for (const src of matched) {
      const key = typeof src === 'object' ? `${src.document_id || src.title}_${src.page}` : src;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(src);
      }
    }

    return deduplicated;
  };

  // Convert [[#n]], [[n]], [#n], and bare #n citation tags into clickable citation link chips
  const renderCitations = (content: string) => {
    if (!content) return '';
    let res = content
      // Clean any previously malformed #n(cite://n) from history
      .replace(/#?(\d+)\(cite:\/\/\1\)/g, '[cite](cite://$1)')
      // 1. [[#n]] or [[n]]
      .replace(/\[\[#?(\d+)\]\]/g, '[cite](cite://$1)')
      // 2. [#n] (not already cite://)
      .replace(/\[#?(\d+)\](?!\(cite:\/\/)/g, '[cite](cite://$1)')
      // 3. (#n) (in parentheses)
      .replace(/\(#?(\d+)\)(?!\(cite:\/\/)/g, '([cite](cite://$1))')
      // 4. bare #n preceded by space or start of line, followed by punctuation or space
      .replace(/(?:^|(?<=[\s]))#(\d+)(?=[.,;:\s?!)]|$)(?!\(cite:\/\/)/g, '[cite](cite://$1)');

    // Clean any stray whitespace before following punctuation so punctuation never wraps onto a new line
    res = res.replace(/(\]\(cite:\/\/\d+\))\s+([.,;:?!])/g, '$1$2');

    return res;
  };


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
            const exactSources = isBot ? getExactSources(msg.content, msg.sources || []) : [];

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
                                urlTransform={(url) =>
                                  url.startsWith('cite://') ? url : defaultUrlTransform(url)
                                }
                                components={{
                                  a: ({ href, children }) => {
                                    if (href && href.startsWith('cite://')) {
                                      const n = parseInt(href.replace('cite://', ''), 10);
                                      const src = msg.sources?.find((s: any) => s.n === n) || msg.sources?.[n - 1];
                                      const tooltip = src
                                        ? `${src.title || src.file_name || 'Course Document'}${src.page ? ` (Page ${src.page})` : ''}`
                                        : `Source #${n}`;

                                      return (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            handleOpenCitation(n, msg.sources);
                                          }}
                                          className="inline-flex items-center justify-center w-5 h-5 mx-1 rounded-md bg-blue-50/90 hover:bg-blue-100 text-blue-600 hover:text-blue-700 border border-blue-200/90 hover:border-blue-300 transition-all cursor-pointer align-baseline relative -top-[1px] select-none shadow-2xs group"
                                          title={tooltip}
                                        >
                                          <Link className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-700 transition-colors" />
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

                            {/* Directly show sources at end of message without separate indicator */}
                            {exactSources.length > 0 && !isStreamingThis && (
                              <div className="mt-3.5 pt-1 flex flex-wrap gap-2">
                                {exactSources.map((src: any, i: number) => {
                                  const title = typeof src === 'string' ? src : src.title || src.file_name || 'Document';
                                  const page = typeof src === 'object' ? src.page : undefined;

                                  return (
                                    <button
                                      key={i}
                                      onClick={() => handleOpenSourceItem(src)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100/90 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                                      title={`View "${title}" ${page ? `(Page ${page})` : ''}`}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                      <span className="truncate max-w-[220px]">{title}</span>
                                      {page && (
                                        <span className="px-1.5 py-0.2 bg-slate-200/90 text-slate-600 rounded text-[10px] font-semibold">
                                          p. {page}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
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
