/**
 * Native Document Processing & OCR Pipeline
 *
 * - PDF: accurate per-page text via pdfjs-dist; per-page text-density detection;
 *   image-only / scanned pages are rendered to PNG (@napi-rs/canvas) and OCR'd
 *   via Tesseract so image content becomes searchable, citable text.
 * - DOCX: mammoth.
 * - PPTX: officeparser (reliable text extraction — replaces the broken utf-8 fallback).
 * - Markdown / TXT / CSV: native utf-8 with paragraph-aware splitting.
 * - Images: Tesseract OCR.
 *
 * Every chunk carries rich metadata (page, fileName, paragraphId, chunkType,
 * charStart/charEnd) so the model can emit precise, clickable references.
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { OfficeParser } from 'officeparser';

// pdfjs-dist render path expects these as globals when running in Node.
function ensureCanvasGlobals() {
  if (!(globalThis as any).Path2D) (globalThis as any).Path2D = Path2D;
  if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix;
  if (!(globalThis as any).ImageData) (globalThis as any).ImageData = ImageData;
}
ensureCanvasGlobals();

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  /** true when this page's text came from OCR (image/scanned page). */
  isImage?: boolean;
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
  paragraphId?: string;
  chunkType: 'text' | 'image' | 'table';
  charStart?: number;
  charEnd?: number;
  fileName: string;
  title?: string;
  stream?: string;
  semester?: string;
  section?: string;
  subject?: string;
  module?: string;
}

const MIN_TEXT_CHARS_PER_PAGE = 20; // below this, a PDF page is treated as image/scanned

/**
 * Lazily create a Tesseract worker and recognize an image buffer.
 */
async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  try {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(buffer);
    await worker.terminate();
    return (ret.data.text || '').trim();
  } catch (err: any) {
    console.error('Tesseract OCR error:', err.message);
    return '';
  }
}

/**
 * Render a single PDF page to a PNG Buffer for OCR.
 * Returns null if rendering is unavailable (graceful degradation).
 */
async function renderPdfPageToPng(
  doc: any,
  pageNum: number,
  scale = 2
): Promise<Buffer | null> {
  try {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport } as any).promise;
    return canvas.toBuffer('image/png');
  } catch (err: any) {
    console.warn(`PDF page ${pageNum} render failed (OCR unavailable):`, err.message);
    return null;
  }
}

/**
 * Extract text from a PDF buffer with accurate per-page tracking and OCR
 * fallback for image-only / scanned pages.
 */
export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pages: ExtractedPage[] = [];
  let doc: any = null;
  try {
    doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    } as any).promise;

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      let text = '';
      try {
        const page = await doc.getPage(pageNum);
        const tc = await page.getTextContent();
        // Reconstruct text, inserting line breaks on Y-axis jumps (pdfjs ordering)
        let lastY: number | null = null;
        const parts: string[] = [];
        for (const item of tc.items as any[]) {
          const y = item.transform?.[5];
          if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
            parts.push('\n');
          }
          parts.push(item.str ?? '');
          lastY = y ?? lastY;
        }
        text = parts.join('').trim();
      } catch (e: any) {
        console.warn(`PDF page ${pageNum} text extraction error:`, e.message);
      }

      // Per-page OCR detection: low text density => image/scanned page.
      if (text.length < MIN_TEXT_CHARS_PER_PAGE) {
        const png = await renderPdfPageToPng(doc, pageNum);
        if (png) {
          const ocrText = await ocrImageBuffer(png);
          if (ocrText.length > text.length) {
            pages.push({ pageNumber: pageNum, text: ocrText, isImage: true });
            continue;
          }
        }
        pages.push({ pageNumber: pageNum, text, isImage: text.length === 0 });
      } else {
        pages.push({ pageNumber: pageNum, text });
      }
    }
  } catch (err: any) {
    console.warn('PDF parsing failed, falling back to whole-buffer OCR:', err.message);
    const ocrText = await ocrImageBuffer(buffer);
    if (ocrText) {
      pages.push({ pageNumber: 1, text: ocrText, isImage: true });
    }
  } finally {
    if (doc) {
      try { await doc.destroy(); } catch {}
    }
  }

  const fullText = pages.map((p) => p.text).join('\n\n');
  return { fullText, pages: pages.length ? pages : [{ pageNumber: 1, text: fullText }] };
}

/**
 * Extract text from DOCX. mammoth gives one text blob; we keep page=1 and let
 * the chunker split by paragraph.
 */
export async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || '').trim();
  return { fullText: text, pages: [{ pageNumber: 1, text }] };
}

/**
 * Extract text from PPTX via officeparser (reliable text extraction).
 */
export async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const ast = await OfficeParser.parseOffice(buffer, { fileType: 'pptx' } as any);
    const text = (typeof ast.toText === 'function' ? ast.toText() : '') || '';
    return { fullText: text, pages: [{ pageNumber: 1, text: text.trim() }] };
  } catch (err: any) {
    console.error('PPTX extraction error:', err.message);
    return { fullText: '', pages: [] };
  }
}

/**
 * Extract text from an image / scanned file via Tesseract OCR.
 */
export async function runOcrOnBuffer(buffer: Buffer): Promise<ExtractionResult> {
  const text = await ocrImageBuffer(buffer);
  return {
    fullText: text,
    pages: [{ pageNumber: 1, text, isImage: true }],
  };
}

/**
 * Extract Markdown: strip YAML front-matter, keep text (headings become paragraph
 * boundaries naturally via the chunker).
 */
export function extractMarkdown(buffer: Buffer): ExtractionResult {
  let text = buffer.toString('utf-8');
  // Strip YAML front-matter
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  text = text.trim();
  return { fullText: text, pages: [{ pageNumber: 1, text }] };
}

/**
 * Plain text / CSV / etc.
 */
export function extractPlainText(buffer: Buffer): ExtractionResult {
  const text = buffer.toString('utf-8').trim();
  return { fullText: text, pages: [{ pageNumber: 1, text }] };
}

/**
 * Unified extractor based on mime-type or file extension.
 */
export async function extractDocumentContent(
  filename: string,
  buffer: Buffer,
  mimeType?: string
): Promise<ExtractionResult> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mime = (mimeType || '').toLowerCase();

  if (mime.includes('pdf') || ext === 'pdf') return extractPdf(buffer);

  if (mime.includes('presentation') || ext === 'pptx') return extractPptx(buffer);

  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    return extractDocx(buffer);
  }

  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(ext)) {
    return runOcrOnBuffer(buffer);
  }

  if (ext === 'md' || ext === 'markdown' || mime.includes('markdown')) return extractMarkdown(buffer);

  // CSV, TXT, and any other text-based format
  return extractPlainText(buffer);
}

/**
 * Split a page's text into paragraphs, tracking character offsets within the page.
 */
function splitParagraphs(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  const re = /\n[ \t]*\n/g;
  let start = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while (start < text.length) {
    re.lastIndex = start;
    match = re.exec(text);
    const end = match ? match.index : text.length;
    const para = text.slice(start, end).trim();
    if (para) {
      out.push({ text: para, start });
      idx++;
    }
    if (!match) break;
    start = match.index + match[0].length;
  }
  return out;
}

/**
 * Split extracted pages into paragraph-aware chunks with rich metadata.
 */
export function chunkExtractedDocument({
  extraction,
  fileName,
  title,
  stream,
  semester,
  section,
  subject,
  module,
  chunkSize = 500,
  chunkOverlap = 50,
}: {
  extraction: ExtractionResult;
  fileName: string;
  title?: string;
  stream?: string;
  semester?: string;
  section?: string;
  subject?: string;
  module?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}): DocumentChunk[] {
  const rawChunks: Array<{
    text: string;
    pageStart: number;
    pageEnd: number;
    paragraphId?: string;
    chunkType: 'text' | 'image' | 'table';
    charStart?: number;
    charEnd?: number;
  }> = [];

  for (const page of extraction.pages) {
    const pageText = page.text.trim();
    if (!pageText) continue;

    if (page.isImage) {
      // OCR'd image page => one image chunk (citable, retrievable)
      rawChunks.push({
        text: pageText,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        paragraphId: `${page.pageNumber}:img`,
        chunkType: 'image',
      });
      continue;
    }

    const paragraphs = splitParagraphs(pageText);
    let paraIdx = 0;
    for (const para of paragraphs) {
      paraIdx++;
      const paragraphId = `${page.pageNumber}:${paraIdx}`;
      let start = 0;
      while (start < para.text.length) {
        const end = Math.min(start + chunkSize, para.text.length);
        const chunkText = para.text.slice(start, end).trim();
        if (chunkText.length > 20) {
          rawChunks.push({
            text: chunkText,
            pageStart: page.pageNumber,
            pageEnd: page.pageNumber,
            paragraphId,
            chunkType: 'text',
            charStart: para.start + start,
            charEnd: para.start + end,
          });
        }
        start += chunkSize - chunkOverlap;
        if (start >= para.text.length) break;
      }
    }
  }

  // Fallback: if paragraph splitting yielded nothing but fullText exists
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
          paragraphId: '1:1',
          chunkType: 'text',
          charStart: start,
          charEnd: end,
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
    paragraphId: c.paragraphId,
    chunkType: c.chunkType,
    charStart: c.charStart,
    charEnd: c.charEnd,
    fileName,
    title: title || fileName,
    stream: stream || 'General',
    semester: semester || 'General',
    section: section || 'General',
    subject: subject || 'General',
    module: module || 'General',
  }));
}
