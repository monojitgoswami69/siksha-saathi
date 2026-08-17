/**
 * Google Gemini Embeddings Service
 * Generates embeddings using model and dimensions specified in environment variables.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

// In-memory LRU cache for query embeddings
const cache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 2000;

function getCacheKey(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Generate embedding for a single text string
 */
export async function getEmbedding(text: string, useCache = true): Promise<number[]> {
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const embeddingDim = parseInt(process.env.GEMINI_EMBEDDING_DIM || '768', 10);

  const key = `${embeddingModel}:${getCacheKey(text)}`;
  if (useCache && cache.has(key)) {
    return cache.get(key)!;
  }

  if (!apiKey || apiKey.startsWith('dummy')) {
    const mock = new Array(embeddingDim).fill(0).map((_, i) => Math.sin(i + text.length));
    return mock;
  }

  try {
    const model = genAI.getGenerativeModel({ model: embeddingModel });

    let result: any;
    try {
      result = await model.embedContent({
        content: { parts: [{ text }] },
        outputDimensionality: embeddingDim,
      } as any);
    } catch {
      result = await model.embedContent(text);
    }

    let values = result.embedding?.values;
    if (values && values.length > 0) {
      if (values.length !== embeddingDim) {
        if (values.length > embeddingDim) {
          values = values.slice(0, embeddingDim);
        } else {
          values = [...values, ...new Array(embeddingDim - values.length).fill(0)];
        }
      }

      if (useCache) {
        if (cache.size >= MAX_CACHE_SIZE) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(key, values);
      }

      return values;
    }
    throw new Error(`Embedding model ${embeddingModel} returned empty values`);
  } catch (err: any) {
    console.error(`Gemini embedding error with ${embeddingModel}:`, err);
    throw err;
  }
}

/**
 * Generate embeddings for a batch of texts
 */
export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embeddingDim = parseInt(process.env.GEMINI_EMBEDDING_DIM || '768', 10);

  if (!apiKey || apiKey.startsWith('dummy')) {
    return texts.map((t) =>
      new Array(embeddingDim).fill(0).map((_, i) => Math.sin(i + t.length))
    );
  }

  const BATCH_SIZE = 10;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((t) => getEmbedding(t, false));
    const results = await Promise.all(batchPromises);
    allEmbeddings.push(...results);
  }

  return allEmbeddings;
}

/**
 * Format a JavaScript number array into a PostgreSQL pgvector string format: '[0.1,0.2,...]'
 */
export function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
