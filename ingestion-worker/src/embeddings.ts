/**
 * Gemini Embeddings — optimized for ingestion throughput.
 *
 * Optimization #1: use `batchEmbedContents` (<=100 texts per API call) instead
 * of N parallel single `embedContent` calls.
 *
 * Env is read lazily (at call time) so it works regardless of ESM import
 * hoisting — the worker loads .env.local via process.loadEnvFile in index.ts,
 * which runs after imports are hoisted.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const BATCH_SIZE = 100;

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || '';
}

function getModelName(): string {
  return process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
}

function getDim(): number {
  return parseInt(process.env.GEMINI_EMBEDDING_DIM || '768', 10);
}

function getGenAI(): any {
  return new GoogleGenerativeAI(getApiKey());
}

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
  const dim = getDim();
  const apiKey = getApiKey();

  if (!apiKey || apiKey.startsWith('dummy')) {
    return texts.map((t) => new Array(dim).fill(0).map((_, i) => Math.sin(i + t.length)));
  }

  const model = getGenAI().getGenerativeModel({ model: getModelName() });
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    let batchValues: number[][] | null = null;

    try {
      const res = await (model as any).batchEmbedContents({
        requests: slice.map((t) => ({
          content: { parts: [{ text: t }] },
          outputDimensionality: dim,
          taskType: 'RETRIEVAL_DOCUMENT',
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
            taskType: 'RETRIEVAL_DOCUMENT',
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

export async function getEmbedding(text: string): Promise<number[]> {
  const dim = getDim();
  const apiKey = getApiKey();
  if (!apiKey || apiKey.startsWith('dummy')) {
    return new Array(dim).fill(0).map((_, i) => Math.sin(i + text.length));
  }
  const model = getGenAI().getGenerativeModel({ model: getModelName() });
  try {
    const r = await (model as any).embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: dim,
      taskType: 'RETRIEVAL_DOCUMENT',
    });
    return padOrTrim(r.embedding?.values || [], dim);
  } catch (e: any) {
    console.error('Gemini embedding error:', e.message);
    throw e;
  }
}
