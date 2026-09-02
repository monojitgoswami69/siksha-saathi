'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { api } from '@/lib/client/api';

export interface ChatFilter {
  subject?: string;
  document_id?: string;
  file_name?: string;
  module?: string;
}

interface ChatInputProps {
  onSendMessage: (text: string, filter?: ChatFilter) => void;
  isStreaming?: boolean;
  presetDocumentId?: string;
}

export function ChatInput({ onSendMessage, isStreaming, presetDocumentId }: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const originalInputRef = useRef('');
  const isListeningRef = useRef(false);

  const [subjects, setSubjects] = useState<string[]>([]);
  const [files, setFiles] = useState<
    Array<{ document_id: string; file_name: string; title: string; subject?: string; module?: string }>
  >([]);
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [materialFilter, setMaterialFilter] = useState<string>('');

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isStreaming]);

  // Load available subjects and document files from student scope
  useEffect(() => {
    api.filters
      .getFilters()
      .then((data) => {
        if (data?.subjects) setSubjects(data.subjects);
        if (data?.files) {
          setFiles(data.files);
          if (presetDocumentId) {
            const matched = data.files.find((f: any) => f.document_id === presetDocumentId);
            if (matched) {
              setMaterialFilter(presetDocumentId);
              if (matched.subject) {
                setSubjectFilter(matched.subject);
              }
            }
          }
        }
      })
      .catch((err) => console.warn('Failed to load chat filters:', err));
  }, [presetDocumentId]);

  // Speech recognition initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let recorded = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            recorded += event.results[i][0].transcript;
          }
          const prefix = originalInputRef.current ? originalInputRef.current + ' ' : '';
          setInputValue(prefix + recorded);
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') return;
          setIsListening(false);
        };

        recognition.onend = () => {
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch {
              setIsListening(false);
            }
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech-to-text is not supported in this browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      recognitionRef.current.stop();
    } else {
      originalInputRef.current = inputValue;
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Speech recognition error:', e);
      }
    }
  };

  // Materials available under the currently selected subject (or all if untouched)
  const availableMaterials = useMemo(() => {
    if (!subjectFilter) return files;
    return files.filter(
      (f) => !f.subject || f.subject.toLowerCase() === subjectFilter.toLowerCase()
    );
  }, [files, subjectFilter]);

  const selectedFile = useMemo(
    () => files.find((f) => f.document_id === materialFilter),
    [files, materialFilter]
  );

  const selectedMaterialLabel = useMemo(() => {
    if (!materialFilter) {
      return subjectFilter ? 'All Modules' : 'All Materials';
    }
    if (selectedFile) {
      return `${selectedFile.module ? `[${selectedFile.module}] ` : ''}${selectedFile.title || selectedFile.file_name}`;
    }
    return 'All Materials';
  }, [materialFilter, subjectFilter, selectedFile]);

  const handleSubmit = () => {
    if (isListening) {
      setIsListening(false);
      try {
        recognitionRef.current?.stop();
      } catch {}
    }
    if (inputValue.trim() && !isStreaming) {
      const filter: ChatFilter = {};

      if (subjectFilter) {
        filter.subject = subjectFilter;
      }

      if (materialFilter && selectedFile) {
        filter.document_id = selectedFile.document_id;
        filter.file_name = selectedFile.file_name;
        filter.module = selectedFile.module;
        if (!filter.subject && selectedFile.subject) {
          filter.subject = selectedFile.subject;
        }
      }

      onSendMessage(inputValue, filter);
      setInputValue('');
      originalInputRef.current = '';
    }
  };

  const hasActiveFilters = Boolean(subjectFilter || materialFilter);

  return (
    <div className="absolute bottom-0 w-full z-40 font-chat bg-gradient-to-t from-[#f1f5f9] via-[#f1f5f9] to-transparent p-4 pt-6">
      <div className="max-w-3xl mx-auto">
        {/* Minimal Single-Row Scoping: Subject / Material */}
        <div className="flex items-center justify-center gap-2 mb-2 px-4 overflow-x-auto scrollbar-hide text-xs">
          {/* Subject Direct Trigger */}
          <div className="relative inline-flex items-center gap-0.5 group cursor-pointer shrink-0 hover:text-slate-900 transition-colors">
            <span
              className={`font-medium text-xs select-none ${
                subjectFilter ? 'text-blue-600 font-semibold' : 'text-slate-600'
              }`}
            >
              {subjectFilter || 'All Subjects'}
            </span>
            <span className="material-symbols-outlined text-[15px] text-slate-400 group-hover:text-slate-700 transition-colors pointer-events-none">
              expand_more
            </span>
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setMaterialFilter('');
              }}
              disabled={isStreaming}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-xs"
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <span className="text-slate-300 select-none text-[11px]">/</span>

          {/* Material / Module Direct Trigger */}
          <div className="relative inline-flex items-center gap-0.5 group cursor-pointer max-w-[280px] sm:max-w-[420px] shrink-0 hover:text-slate-900 transition-colors">
            <span
              className={`font-medium text-xs truncate select-none ${
                materialFilter ? 'text-blue-600 font-semibold' : 'text-slate-600'
              }`}
            >
              {selectedMaterialLabel}
            </span>
            <span className="material-symbols-outlined text-[15px] text-slate-400 group-hover:text-slate-700 shrink-0 transition-colors pointer-events-none">
              expand_more
            </span>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              disabled={isStreaming}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-xs"
            >
              <option value="">
                {subjectFilter ? 'All Modules' : 'All Materials'}
              </option>
              {availableMaterials.map((f) => (
                <option key={f.document_id} value={f.document_id}>
                  {f.module ? `[${f.module}] ` : ''}
                  {f.title || f.file_name}
                </option>
              ))}
            </select>
          </div>

          {/* Direct Clear Cross Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSubjectFilter('');
                setMaterialFilter('');
              }}
              disabled={isStreaming}
              className="text-slate-400 hover:text-slate-700 p-0.5 ml-0.5 transition-colors cursor-pointer flex items-center shrink-0"
              title="Reset to All"
            >
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          )}
        </div>

        {/* Message Input Box */}
        <div className="clay-card p-2 rounded-[2rem] flex items-center gap-2 border border-white/80 shadow-2xl pl-6">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={
              isListening
                ? 'Listening...'
                : isStreaming
                ? 'Generating response...'
                : 'Message Siksha Saathi...'
            }
            disabled={isStreaming}
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-slate-800 placeholder:text-slate-400 py-3 px-2 disabled:opacity-50 font-chat text-sm md:text-base"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          />
          <div className="flex items-center gap-2 pr-1">
            <button
              type="button"
              onClick={toggleListening}
              title="Speech to Text"
              className={`p-3 transition-colors rounded-full flex items-center justify-center cursor-pointer ${
                isListening
                  ? 'bg-red-50 text-red-500 animate-pulse'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="material-symbols-outlined">{isListening ? 'mic' : 'mic_none'}</span>
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isStreaming || !inputValue.trim()}
              className={`p-3 rounded-full transition-all active:scale-90 shadow-md cursor-pointer flex items-center justify-center ${
                isStreaming || !inputValue.trim()
                  ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                  : 'bg-[#555f70] text-[#f6f7ff] hover:bg-[#495364]'
              }`}
            >
              <span className="material-symbols-outlined">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
