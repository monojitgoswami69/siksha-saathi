/**
 * Gemini Embeddings — optimized for ingestion throughput.
 *
 * Optimization #1: use `batchEmbedContents` (<=100 texts per API call) instead
 * of N parallel single `embedContent` calls. For a 200-chunk doc this is ~2
 * API calls instead of ~200, cutting latency by an order of magnitude.
 *
 * Falls back to per-text `embedContent` if the batch endpoint is unavailable
 * for the configured model.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

const BATCH_SIZE = 100; // Gemini batchEmbedContents accepts up to 100 requests

function padOrTrim(values: number[], dim: number): number[] {
  if (values.length === dim) return values;
  if (values.length > dim) return values.slice(0, dim);
  return [...values, ...new Array(dim - values.length).fill(0)];
}

export function formatVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const dim = parseInt(process.env.GEMINI_EMBEDDING_DIM || '768', 10);
  const modelName = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

  if (!apiKey || apiKey.startsWith('dummy')) {
    return texts.map((t) => new Array(dim).fill(0).map((_, i) => Math.sin(i + t.length)));
  }

  const model = genAI.getGenerativeModel({ model: modelName });
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    let batchValues: number[][] | null = null;

    try {
      const res = await (model as any).batchEmbedContents({
        requests: slice.map((t) => ({
          content: { parts: [{ text: t }] },
          outputDimensionality: dim,
        })),
      });
      if (res?.embeddings?.length) {
        batchValues = res.embeddings.map((e: any) => padOrTrim(e.values || [], dim));
      }
    } catch (err: any) {
      console.warn(
        `batchEmbedContents failed for ${slice.length} texts (${err.message}); falling back to single embedContent.`
      );
    }

    if (!batchValues) {
      batchValues = [];
      for (const t of slice) {
        try {
          const r = await (model as any).embedContent({
            content: { parts: [{ text: t }] },
            outputDimensionality: dim,
          });
          batchValues.push(padOrTrim(r.embedding?.values || [], dim));
        } catch (e: any) {
          console.error('embedContent error:', e.message);
          batchValues.push(new Array(dim).fill(0));
        }
      }
    }

    all.push(...batchValues);
  }

  return all;
}

/** Single-text embedding (used by the worker only if it ever needs one-off). */
export async function getEmbedding(text: string): Promise<number[]> {
  const dim = parseInt(process.env.GEMINI_EMBEDDING_DIM || '768', 10);
  const modelName = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  if (!apiKey || apiKey.startsWith('dummy')) {
    return new Array(dim).fill(0).map((_, i) => Math.sin(i + text.length));
  }
  const model = genAI.getGenerativeModel({ model: modelName });
  try {
    const r = await (model as any).embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: dim,
    });
    return padOrTrim(r.embedding?.values || [], dim);
  } catch (e: any) {
    console.error('Gemini embedding error:', e.message);
    throw e;
  }
}
