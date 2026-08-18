'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { Sparkles } from 'lucide-react';

export default function AddTextPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [stream, setStream] = useState('cse');
  const [semester, setSemester] = useState('1');
  const [section, setSection] = useState('cse1');
  const [subject, setSubject] = useState('Data Structures');
  const [module, setModule] = useState('Module 1');
  const [submitting, setSubmitting] = useState(false);

  const [curriculum, setCurriculum] = useState<Record<string, Record<string, string[]>>>({});
  const [filterStreams, setFilterStreams] = useState<string[]>([]);
  const [filterSections, setFilterSections] = useState<string[]>([]);

  useEffect(() => {
    api.filters
      .getFilters()
      .then((data) => {
        if (!data) return;
        if (data.curriculum) {
          setCurriculum(data.curriculum);
          const ks = Object.keys(data.curriculum);
          if (ks.length && !filterStreams.length) setStream(ks[0]);
        }
        if (Array.isArray(data.streams) && data.streams.length) setFilterStreams(data.streams);
        if (Array.isArray(data.sections)) setFilterSections(data.sections);
      })
      .catch(() => {});
  }, []);

  const streamsForSelection = filterStreams.length ? filterStreams : Object.keys(curriculum);
  const subjectsForSelection = curriculum[stream]?.[semester] || [
    'Data Structures',
    'Operating Systems',
    'Algorithms',
    'Database Management Systems',
    'Computer Networks',
    'Software Engineering',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    try {
      await api.documents.ingest({
        title: title.trim() || 'Raw Text Material',
        file_name: `${(title.trim() || 'notes').toLowerCase().replace(/\s+/g, '_')}.txt`,
        content: content.trim(),
        stream,
        semester,
        section,
        subject,
        module,
        mime_type: 'text/plain',
      });

      showSuccess('Raw text successfully chunked, embedded, and added to pgvector knowledge base!');
      router.push('/admin/knowledge-base');
    } catch (err: any) {
      showError(err.message || 'Failed to ingest text');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Direct Raw Text Ingestion</h1>
        <p className="text-xs text-slate-400 mt-1">
          Paste textbook notes, syllabus definitions, or lecture summaries directly into the RAG knowledge base.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-slate-500 max-w-md">
            Each scope dimension can be set to <span className="text-indigo-300 font-semibold">General</span> independently
            (e.g. Semester = 1, Stream/Section = General → visible to all stream/section students in semester 1 only).
          </p>
          <button
            type="button"
            onClick={() => {
              setStream('General');
              setSemester('General');
              setSection('General');
              setSubject('General');
              setModule('General');
            }}
            className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 rounded-lg text-[11px] font-bold transition-colors"
          >
            Set all to General
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Stream</label>
            <select
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none"
            >
              <option value="General">General (all streams)</option>
              {streamsForSelection.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none"
            >
              {['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
              <option value="General">General (all semesters)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Section</label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              list="section-options"
              placeholder="e.g. cse1 / General"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
            <datalist id="section-options">
              <option value="General" />
              {filterSections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none"
            >
              <option value="General">General (all subjects)</option>
              {subjectsForSelection.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Module / Unit</label>
            <input
              type="text"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              placeholder="e.g. Unit 1 / General"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Document / Chapter Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Module 3 - Virtual Memory & Page Faults"
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">
            Course Text Content ({content.length} chars)
          </label>
          <textarea
            rows={12}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste syllabus text, definitions, code samples, or reference content..."
            className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-mono text-slate-200 focus:ring-2 focus:ring-indigo-500/30 outline-none leading-relaxed"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
        >
          <Sparkles className="w-4 h-4" />
          <span>{submitting ? 'Chunking & Embedding...' : 'Ingest Raw Text into pgvector'}</span>
        </button>
      </form>
    </div>
  );
}
