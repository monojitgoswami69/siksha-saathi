/**
 * Embedding Router — Local embedding service client
 *
 * All embeddings go through the local FastAPI service at localhost:8100.
 * The service loads intfloat/multilingual-e5-small ONCE at startup.
 *
 * Query path:
 *   Next.js → POST http://127.0.0.1:8100/embed → 384-dim vector → search `embedding_local` column
 */

import { getLocalEmbedding } from './localEmbeddings';

/**
 * Get query embedding from the local embedding service.
 */
export async function getQueryEmbedding(text: string): Promise<number[]> {
  return getLocalEmbedding(text);
}

/**
 * Embedding dimensionality (E5-small = 384).
 */
export function getEmbeddingDim(): number {
  return 384;
}

/**
 * Vector column name for pgvector queries.
 */
export function getEmbeddingColumn(): string {
  return 'embedding_local';
}

/**
 * Format vector for pgvector.
 */
export function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
