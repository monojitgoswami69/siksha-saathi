/**
 * Native Document Processing & OCR Pipeline
 * Supports PDF (with page tracking & OCR fallback), DOCX, PPTX, Images, and raw text.
 */

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractionResult {
  fullText: string;
  pages: ExtractedPage[];
}

export interface DocumentChunk {
  chunkIndex: number;
  totalChunks: number;
  rawContent: string;
  pageStart: number;
  pageEnd: number;
  source: string;
  title?: string;
  stream?: string;
  semester?: string;
  subject?: string;
  module?: string;
}

/**
 * Extract text from PDF buffer with page tracking & OCR fallback
 */
export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pages: ExtractedPage[] = [];

  try {
    const data = await pdf(buffer, {
      pagerender: function (pageData: any) {
        return pageData.getTextContent().then(function (textContent: any) {
          let lastY: any,
            text = '';
          for (let item of textContent.items) {
            if (lastY == item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          return text;
        });
      },
    });

    if (data.text && data.text.trim().length > 50) {
      // Split roughly by page or approximate if single block
      const rawPages: string[] = data.text.split(/\f|\n\s*\n\s*Page \d+/i);
      rawPages.forEach((pageText: string, idx: number) => {
        if (pageText.trim()) {
          pages.push({
            pageNumber: idx + 1,
            text: pageText.trim(),
          });
        }
      });

      return {
        fullText: data.text.trim(),
        pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: data.text.trim() }],
      };
    }
  } catch (err) {
    console.warn('Direct PDF text extraction failed, trying OCR fallback:', err);
  }

  // OCR Fallback using Tesseract.js
  return runOcrOnBuffer(buffer);
}

/**
 * Extract text from DOCX buffer
 */
export async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  return {
    fullText: text,
    pages: [{ pageNumber: 1, text }],
  };
}

/**
 * Extract text from Image / Scanned file buffer using Tesseract OCR
 */
export async function runOcrOnBuffer(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(buffer);
    await worker.terminate();

    const text = ret.data.text.trim();
    return {
      fullText: text,
      pages: [{ pageNumber: 1, text: text || 'No text extracted' }],
    };
  } catch (err: any) {
    console.error('Tesseract OCR error:', err.message);
    return {
      fullText: '',
      pages: [],
    };
  }
}

/**
 * Unified extractor based on mime-type or file extension
 */
export async function extractDocumentContent(
  filename: string,
  buffer: Buffer,
  mimeType?: string
): Promise<ExtractionResult> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mime = (mimeType || '').toLowerCase();

  if (mime.includes('pdf') || ext === 'pdf') {
    return extractPdf(buffer);
  }

  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    return extractDocx(buffer);
  }

  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return runOcrOnBuffer(buffer);
  }

  // Plain text / PPTX / other text formats
  const text = buffer.toString('utf-8');
  return {
    fullText: text,
    pages: [{ pageNumber: 1, text }],
  };
}

/**
 * Splits extracted pages into semantic chunks with metadata preservation
 */
export function chunkExtractedDocument({
  extraction,
  source,
  title,
  stream,
  semester,
  subject,
  module,
  chunkSize = 500,
  chunkOverlap = 50,
}: {
  extraction: ExtractionResult;
  source: string;
  title?: string;
  stream?: string;
  semester?: string;
  subject?: string;
  module?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}): DocumentChunk[] {
  const rawChunks: Array<{ text: string; pageStart: number; pageEnd: number }> = [];

  for (const page of extraction.pages) {
    const text = page.text.trim();
    if (!text) continue;

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.slice(start, end).trim();

      if (chunkText.length > 20) {
        rawChunks.push({
          text: chunkText,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
        });
      }

      start += chunkSize - chunkOverlap;
    }
  }

  // If page-by-page was empty but fullText exists
  if (rawChunks.length === 0 && extraction.fullText.trim()) {
    const text = extraction.fullText.trim();
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.slice(start, end).trim();

      if (chunkText.length > 20) {
        rawChunks.push({
          text: chunkText,
          pageStart: 1,
          pageEnd: 1,
        });
      }

      start += chunkSize - chunkOverlap;
    }
  }

  const total = rawChunks.length;
  return rawChunks.map((c, idx) => ({
    chunkIndex: idx,
    totalChunks: total,
    rawContent: c.text,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    source,
    title: title || source,
    stream: stream || 'General',
    semester: semester || 'General',
    subject: subject || 'General',
    module: module || 'General',
  }));
}
