'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import {
  Upload,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';
import { formatBytes } from '@/lib/client/utils';

export default function AddDocumentPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { user } = useAdminAuth();
  const isScopedRole = user?.role && user.role !== 'admin'; // hod/faculty restricted to their streams

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

  const streamsForSelection = filterStreams.length ? filterStreams : Object.keys(curriculum);

  // Non-admins (hod/faculty) may only upload into streams they're assigned to
  // (hod_streams ∪ faculty_assignment streams). Server enforces this too.
  const allowedStreams = (user?.allowed_streams && user.allowed_streams.length > 0)
    ? user.allowed_streams
    : streamsForSelection;
  const streamsForRole = isScopedRole ? allowedStreams : streamsForSelection;

  useEffect(() => {
    if (isScopedRole && allowedStreams.length > 0) {
      setStream((prev) => (allowedStreams.map((s) => s.toLowerCase()).includes(prev.toLowerCase()) ? prev : allowedStreams[0]));
    }
  }, [isScopedRole, allowedStreams.length]);

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
    <div className="space-y-6 max-w-4xl mx-auto font-mono">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Ingest Course Materials with OCR</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Upload PDF, DOCX, PPTX, or Image files. Text is extracted with Tesseract OCR fallback, uploaded to Dropbox, embedded via Gemini, and indexed into NeonDB pgvector.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-8 space-y-6 shadow-sm">
        {/* General availability helper */}
        <div className="flex items-center justify-between gap-3 flex-wrap bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
          <p className="text-[11px] text-neutral-600 max-w-md">
            Each scope dimension can be set to <span className="text-indigo-600 font-semibold">General</span> independently.
            e.g. Semester = 1, Stream/Section = General → visible to <span className="text-neutral-900 font-medium">all stream/section students in semester 1 only</span>.
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
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-[11px] font-semibold transition-colors"
          >
            Set all to General
          </button>
        </div>

        {/* Metadata Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Stream</label>
            <select
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              disabled={!!isScopedRole && allowedStreams.length <= 1}
              className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 uppercase font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {!isScopedRole && <option value="General">General (all streams)</option>}
              {streamsForRole.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Section</label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              list="section-options"
              placeholder="e.g. cse1 / cse2 / General"
              className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
            <datalist id="section-options">
              <option value="General" />
              {filterSections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1.5">Module / Unit</label>
            <input
              type="text"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              placeholder="e.g. Unit 1 / Module 2"
              className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Drag & Drop File Arena */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-neutral-300 hover:border-indigo-500 bg-neutral-50/70 rounded-2xl p-10 text-center transition-all cursor-pointer relative group"
        >
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.pptx,.md,.markdown,.txt,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-sm">
            <Upload className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-neutral-900 mb-1">
            Drag and drop syllabus files here, or browse
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Supports PDF (with OCR for scanned pages), Word (DOCX), PPTX, and image formats up to 50MB.
          </p>
        </div>

        {/* Selected Files List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Ready for Ingestion ({files.length} files)
            </span>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    <span className="font-semibold text-neutral-900 truncate">{f.name}</span>
                    <span className="text-neutral-500">({formatBytes(f.size)})</span>
                  </div>
                  <button
                    onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                    className="p-1 text-neutral-400 hover:text-rose-600 transition-colors"
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
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3 text-xs text-indigo-700">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span>{uploadProgress}</span>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all disabled:opacity-40 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>{uploading ? 'Processing with OCR & pgvector...' : 'Start Knowledge Base Ingestion'}</span>
        </button>
      </div>
    </div>
  );
}
