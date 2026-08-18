/**
 * Document extraction & paragraph-aware chunking (worker side).
 * Same semantics as the web app's pipeline, but uses the singleton Tesseract
 * worker and caps OCR rendering for very large scanned PDFs.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';
import mammoth from 'mammoth';
import { OfficeParser } from 'officeparser';
import { ocrImageBuffer } from './ocr.js';

// pdfjs render path expects these as globals in Node.
function ensureCanvasGlobals() {
  if (!(globalThis as any).Path2D) (globalThis as any).Path2D = Path2D;
  if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix;
  if (!(globalThis as any).ImageData) (globalThis as any).ImageData = ImageData;
}
ensureCanvasGlobals();

const MIN_TEXT_CHARS_PER_PAGE = parseInt(process.env.OCR_MIN_TEXT_CHARS || '20', 10);
const OCR_MAX_PAGES = parseInt(process.env.OCR_MAX_PAGES || '50', 10);

export interface ExtractedPage {
  pageNumber: number;
  text: string;
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

async function renderPdfPageToPng(doc: any, pageNum: number, scale = 2): Promise<Buffer | null> {
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

export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pages: ExtractedPage[] = [];
  let doc: any = null;
  try {
    doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    } as any).promise;

    let ocrRendered = 0;
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      let text = '';
      try {
        const page = await doc.getPage(pageNum);
        const tc = await page.getTextContent();
        let lastY: number | null = null;
        const parts: string[] = [];
        for (const item of tc.items as any[]) {
          const y = item.transform?.[5];
          if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) parts.push('\n');
          parts.push(item.str ?? '');
          lastY = y ?? lastY;
        }
        text = parts.join('').trim();
      } catch (e: any) {
        console.warn(`PDF page ${pageNum} text extraction error:`, e.message);
      }

      if (text.length < MIN_TEXT_CHARS_PER_PAGE && ocrRendered < OCR_MAX_PAGES) {
        const png = await renderPdfPageToPng(doc, pageNum);
        if (png) {
          const ocrText = await ocrImageBuffer(png);
          ocrRendered++;
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
    if (ocrText) pages.push({ pageNumber: 1, text: ocrText, isImage: true });
  } finally {
    if (doc) {
      try { await doc.destroy(); } catch {}
    }
  }
  const fullText = pages.map((p) => p.text).join('\n\n');
  return { fullText, pages: pages.length ? pages : [{ pageNumber: 1, text: fullText }] };
}

export async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || '').trim();
  return { fullText: text, pages: [{ pageNumber: 1, text }] };
}

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

export async function runOcrOnBuffer(buffer: Buffer): Promise<ExtractionResult> {
  const text = await ocrImageBuffer(buffer);
  return { fullText: text, pages: [{ pageNumber: 1, text, isImage: true }] };
}

export function extractMarkdown(buffer: Buffer): ExtractionResult {
  let text = buffer.toString('utf-8').replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
  return { fullText: text, pages: [{ pageNumber: 1, text }] };
}

export function extractPlainText(buffer: Buffer): ExtractionResult {
  const text = buffer.toString('utf-8').trim();
  return { fullText: text, pages: [{ pageNumber: 1, text }] };
}

export async function extractDocumentContent(
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): Promise<ExtractionResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf') || ext === 'pdf') return extractPdf(buffer);
  if (mime.includes('presentation') || ext === 'pptx') return extractPptx(buffer);
  if (mime.includes('wordprocessingml') || mime.includes('msword') || ext === 'docx' || ext === 'doc')
    return extractDocx(buffer);
  if (mime.includes('image') || ['png','jpg','jpeg','webp','gif','bmp','tiff'].includes(ext))
    return runOcrOnBuffer(buffer);
  if (ext === 'md' || ext === 'markdown' || mime.includes('markdown')) return extractMarkdown(buffer);
  return extractPlainText(buffer);
}

function splitParagraphs(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  const re = /\n[ \t]*\n/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while (start < text.length) {
    re.lastIndex = start;
    match = re.exec(text);
    const end = match ? match.index : text.length;
    const para = text.slice(start, end).trim();
    if (para) out.push({ text: para, start });
    if (!match) break;
    start = match.index + match[0].length;
  }
  return out;
}

export function chunkExtractedDocument({
  extraction,
  fileName,
  title,
  stream,
  semester,
  section,
  subject,
  module,
  chunkSize = parseInt(process.env.CHUNK_SIZE || '500', 10),
  chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || '50', 10),
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

  if (rawChunks.length === 0 && extraction.fullText.trim()) {
    const text = extraction.fullText.trim();
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 20) {
        rawChunks.push({ text: chunkText, pageStart: 1, pageEnd: 1, paragraphId: '1:1', chunkType: 'text', charStart: start, charEnd: end });
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
