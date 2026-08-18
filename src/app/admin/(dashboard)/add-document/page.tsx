'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  FilePlus,
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  X,
  BookOpen,
  GraduationCap,
  Layers,
} from 'lucide-react';
import { formatBytes } from '@/lib/client/utils';

export default function AddDocumentPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { user } = useAdminAuth();
  const isScopedRole = user?.role && user.role !== 'admin'; // hod/faculty locked to their stream

  const [files, setFiles] = useState<File[]>([]);
  const [stream, setStream] = useState('cse');
  const [semester, setSemester] = useState('1');
  const [section, setSection] = useState('cse1');
  const [subject, setSubject] = useState('Data Structures');
  const [module, setModule] = useState('Module 1');

  const [curriculum, setCurriculum] = useState<Record<string, Record<string, string[]>>>({});
  const [filterStreams, setFilterStreams] = useState<string[]>([]);
  const [filterSections, setFilterSections] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  useEffect(() => {
    api.filters
      .getFilters()
      .then((data) => {
        if (data) {
          if (data.curriculum) {
            setCurriculum(data.curriculum);
            const ks = Object.keys(data.curriculum);
            if (ks.length && !filterStreams.length) setStream(ks[0]);
          }
          if (Array.isArray(data.streams) && data.streams.length) setFilterStreams(data.streams);
          if (Array.isArray(data.sections)) setFilterSections(data.sections);
        }
      })
      .catch(() => {});
  }, []);

  // Non-admins (hod/faculty) are hard-locked to their own stream (server-enforced too).
  useEffect(() => {
    if (isScopedRole && user?.stream) {
      setStream(user.stream);
    }
  }, [isScopedRole, user?.stream]);

  const streamsForSelection = filterStreams.length ? filterStreams : Object.keys(curriculum);
  const subjectsForSelection = curriculum[stream]?.[semester] || [
    'Data Structures',
    'Operating Systems',
    'Algorithms',
    'Database Management Systems',
    'Computer Networks',
    'Software Engineering',
  ];

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Processing ${i + 1}/${files.length}: ${file.name} (Extracting & OCR)...`);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name);
        formData.append('stream', stream);
        formData.append('semester', semester);
        formData.append('section', section);
        formData.append('subject', subject);
        formData.append('module', module);

        await api.documents.ingest(formData);
      } catch (err: any) {
        showError(`Failed to ingest ${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
    showSuccess(`Successfully ingested ${files.length} document(s) with Gemini Embeddings into pgvector!`);
    router.push('/admin/knowledge-base');
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Ingest Course Materials with OCR</h1>
        <p className="text-xs text-slate-400 mt-1">
          Upload PDF, DOCX, PPTX, or Image files. Text is extracted with Tesseract OCR fallback, uploaded to Dropbox, embedded via Gemini, and indexed into NeonDB pgvector.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
        {/* General availability helper */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-slate-500 max-w-md">
            Each scope dimension can be set to <span className="text-indigo-300 font-semibold">General</span> independently.
            e.g. Semester = 1, Stream/Section = General → visible to <span className="text-slate-300">all stream/section students in semester 1 only</span>.
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

        {/* Metadata Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Stream</label>
            <select
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              disabled={!!isScopedRole}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {!isScopedRole && <option value="General">General (all streams)</option>}
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
              placeholder="e.g. cse1 / cse2 / General"
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
              placeholder="e.g. Unit 1 / Module 2"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
          </div>
        </div>

        {/* Drag & Drop File Arena */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/60 rounded-3xl p-10 text-center transition-all cursor-pointer relative group"
        >
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.pptx,.md,.markdown,.txt,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="w-14 h-14 rounded-2xl bg-indigo-950 text-indigo-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
            <Upload className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            Drag and drop syllabus files here, or browse
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Supports PDF (with OCR for scanned pages), Word (DOCX), PPTX, and image formats up to 50MB.
          </p>
        </div>

        {/* Selected Files List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Ready for Ingestion ({files.length} files)
            </span>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="font-semibold text-white truncate">{f.name}</span>
                    <span className="text-slate-500">({formatBytes(f.size)})</span>
                  </div>
                  <button
                    onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress & Submit */}
        {uploading && (
          <div className="p-4 bg-indigo-950/40 border border-indigo-800 rounded-2xl flex items-center gap-3 text-xs text-indigo-300">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <span>{uploadProgress}</span>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
        >
          <Sparkles className="w-4 h-4" />
          <span>{uploading ? 'Processing with OCR & pgvector...' : 'Start Knowledge Base Ingestion'}</span>
        </button>
      </div>
    </div>
  );
}
