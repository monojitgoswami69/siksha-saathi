'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { DocumentInfo } from '@/types';
import {
  BookOpen,
  FileText,
  Search,
  Trash2,
  Eye,
  Plus,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { formatBytes, formatDate } from '@/lib/client/utils';
import { FilePreview } from '@/components/student/FilePreview';

export default function KnowledgeBasePage() {
  const { showSuccess, showError } = useToast();
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DocumentInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadDocuments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.documents.list();
      const docs = res.documents || [];
      setDocuments(docs);

      // If any document is still processing, poll again in 3 seconds
      const hasProcessing = docs.some((d: any) => d.status === 'processing');
      if (hasProcessing) {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => loadDocuments(true), 3000);
      }
    } catch {
      if (!silent) showError('Failed to load knowledge base documents');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document from NeonDB and Cloud Storage?')) return;
    setDeletingId(docId);
    try {
      await api.documents.delete(docId);
      showSuccess('Document deleted successfully');
      setDocuments((prev) => prev.filter((d) => (d.document_id || d.id) !== docId));
    } catch (err: any) {
      showError(err.message || 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = async (doc: DocumentInfo) => {
    setPreviewDoc(doc);
    setPreviewUrl(null);
    try {
      const res = await api.documents.getPreviewUrl(doc.document_id || doc.id);
      setPreviewUrl(res.preview_url || null);
    } catch {
      setPreviewUrl(null);
    }
  };

  const filtered = documents.filter((doc) =>
    (doc.title || doc.file_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.stream || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.section || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.file_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Course Knowledge Base</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Manage course materials, inspect pgvector semantic chunks, and monitor live indexing progress.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/add-document"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Document</span>
          </Link>
          <button
            onClick={() => loadDocuments(false)}
            className="p-2.5 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-600 hover:text-neutral-900 transition-colors shadow-sm"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by title, subject, or stream..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none shadow-sm transition-all"
        />
      </div>

      {/* Documents Table */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 shadow-sm">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-neutral-500">Loading documents...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-neutral-900">No Documents in Knowledge Base</h4>
            <p className="text-xs text-neutral-500 mt-1">Upload syllabus documents or add text to start RAG indexing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 uppercase font-semibold">
                  <th className="py-3 px-4">Document Title</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Stream / Sem</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Status & Chunks</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((doc: any) => {
                  const docId = doc.document_id || doc.id;
                  const isDeleting = deletingId === docId;
                  const status = doc.status || 'ready';
                  const progress = doc.processing_progress || 0;

                  return (
                    <tr key={docId} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-neutral-900 flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="truncate max-w-xs">{doc.title || doc.file_name}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded font-semibold text-[11px]">
                          {doc.subject || 'General'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-700 font-medium">
                        <span className="uppercase">{doc.stream || 'CSE'}</span>{' '}
                        <span className="text-neutral-500">/ Sem {doc.semester || '1'}</span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 uppercase font-semibold">
                        {doc.section || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {status === 'processing' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Indexing ({progress}%)</span>
                          </span>
                        ) : status === 'failed' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                            title={doc.error_message || 'Indexing failed'}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="font-mono text-emerald-600 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{doc.total_chunks || doc.chunks_count || 0} chunks</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500">
                        {formatBytes(doc.file_size || doc.file_size_bytes || 0)}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500">{formatDate(doc.created_at)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreview(doc)}
                            className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-lg transition-colors"
                            title="Preview Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(docId)}
                            disabled={isDeleting}
                            className="p-1.5 hover:bg-rose-50 text-neutral-400 hover:text-rose-600 rounded-lg transition-colors disabled:opacity-30"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FilePreview
        document={previewDoc}
        previewUrl={previewUrl}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewUrl(null);
        }}
      />
    </div>
  );
}
