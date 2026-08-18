/**
 * Tesseract OCR singleton.
 *
 * Optimization: a single worker is created once and reused across all pages
 * and all jobs (instead of spawn+terminate per page). The worker is also
 * shared across jobs to amortize the language-data load cost.
 */
import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    const lang = process.env.TESSERACT_LANGS || 'eng';
    workerPromise = createWorker(lang);
  }
  return workerPromise;
}

export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  try {
    const worker = await getOcrWorker();
    const ret = await worker.recognize(buffer);
    return (ret.data.text || '').trim();
  } catch (err: any) {
    console.error('Tesseract OCR error:', err.message);
    return '';
  }
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {}
    workerPromise = null;
  }
}
