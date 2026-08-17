'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { DocumentInfo } from '@/types';
import {
  BookOpen,
  FileText,
  Search,
  Trash2,
  Download,
  Eye,
  Layers,
  Plus,
  RefreshCw,
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

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await api.documents.list();
      setDocuments(res.documents || []);
    } catch {
      showError('Failed to load knowledge base documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document from NeonDB and Dropbox?')) return;
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
      setPreviewUrl(res.preview_url || doc.dropbox_shared_link || null);
    } catch {
      setPreviewUrl(doc.dropbox_shared_link || null);
    }
  };

  const filtered = documents.filter((doc) =>
    (doc.title || doc.source || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.stream || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Course Knowledge Base</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage course materials, review pgvector chunks, and inspect Dropbox-hosted files.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/add-document"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Document</span>
          </Link>
          <button
            onClick={loadDocuments}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by title, subject, or stream..."
          className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
        />
      </div>

      {/* Documents Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-slate-400">Loading documents...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white">No Documents in Knowledge Base</h4>
            <p className="text-xs text-slate-400 mt-1">Upload syllabus documents or add text to start RAG indexing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="py-3 px-4">Document Title</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Stream / Sem</th>
                  <th className="py-3 px-4">Chunks Indexed</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((doc) => {
                  const docId = doc.document_id || doc.id;
                  const isDeleting = deletingId === docId;
                  return (
                    <tr key={docId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        <span className="truncate max-w-xs">{doc.title || doc.source}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded font-semibold">
                          {doc.subject || 'General'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-medium">
                        <span className="uppercase">{doc.stream || 'CSE'}</span> / Sem {doc.semester || '1'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-400">
                        {doc.total_chunks || doc.chunks_count || 0} chunks
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {formatBytes(doc.file_size || doc.file_size_bytes || 0)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">{formatDate(doc.created_at)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreview(doc)}
                            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(docId)}
                            disabled={isDeleting}
                            className="p-1.5 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg transition-colors disabled:opacity-30"
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
