'use client';

import React from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';
import { DocumentInfo } from '@/types';

interface FilePreviewProps {
  document: DocumentInfo | null;
  previewUrl: string | null;
  onClose: () => void;
  onDownload?: () => void;
}

export function FilePreview({ document, previewUrl, onClose, onDownload }: FilePreviewProps) {
  if (!document) return null;

  const isPdf = document.source?.toLowerCase().endsWith('.pdf') || document.mime_type?.includes('pdf');
  const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(document.source) || document.mime_type?.includes('image');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-sm truncate">{document.title || document.source}</h3>
              <p className="text-xs text-slate-500">
                {document.subject || 'General'} • {document.total_chunks || document.chunks_count || 0} chunks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Open External</span>
              </a>
            )}
            {onDownload && (
              <button
                onClick={onDownload}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-slate-100 p-2 overflow-hidden flex items-center justify-center">
          {previewUrl ? (
            isPdf ? (
              <iframe
                src={`${previewUrl}#toolbar=0`}
                className="w-full h-full rounded-xl border border-slate-200 bg-white"
                title="PDF Preview"
              />
            ) : isImage ? (
              <img
                src={previewUrl}
                alt="Document Preview"
                className="max-h-full max-w-full object-contain rounded-xl shadow"
              />
            ) : (
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                className="w-full h-full rounded-xl border border-slate-200 bg-white"
                title="Document Viewer"
              />
            )
          ) : (
            <div className="text-center p-8">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm font-medium text-slate-600">Loading document preview from Dropbox...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
