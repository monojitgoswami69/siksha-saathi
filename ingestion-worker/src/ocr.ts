/**
 * Tesseract OCR singleton.
 *
 * Optimization: a single worker is created once and reused across all pages
 * and all jobs (instead of spawn+terminate per page). The worker is also
 * shared across jobs to amortize the language-data load cost.
 *
 * Multilingual by default: OCRs English + Hindi out of the box (configurable
 * via TESSERACT_LANGS, e.g. 'eng+hin+ben+tam+tel'). If the requested language
 * pack is unavailable, it gracefully falls back to English-only so ingestion
 * never hard-fails on a missing traineddata file.
 */
import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    const langs = process.env.TESSERACT_LANGS || 'eng+hin';
    workerPromise = createWorker(langs).catch(async (err: any) => {
      console.warn(
        `Tesseract worker for "${langs}" failed (${err?.message}); falling back to English-only.`
      );
      return createWorker('eng');
    });
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
