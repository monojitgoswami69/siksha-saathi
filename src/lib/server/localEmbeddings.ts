/**
 * Local Embedding Client — HTTP client for the local embedding service.
 *
 * Calls POST http://127.0.0.1:8100/embed for query embeddings.
 * Does NOT load SentenceTransformer. The model lives in the embedding service process.
 *
 * Preprocessing:
 * - E5 prefix ("query: " / "passage: ") is applied by the embedding service, NOT here.
 * - L2 normalization is applied by the embedding service.
 * - This client just sends raw text and receives the embedding.
 */

const EMBEDDING_SERVICE_URL =
  process.env.LOCAL_EMBEDDING_URL || 'http://127.0.0.1:8100';
const TIMEOUT_MS = parseInt(process.env.LOCAL_EMBEDDING_TIMEOUT_MS || '5000', 10);

/**
 * Get a single query embedding from the local embedding service.
 *
 * @param text - Raw query text (no prefix needed — service handles E5 conventions)
 * @returns 384-dimensional L2-normalized embedding
 * @throws Error with clear message if service is unavailable (NO silent fallback)
 */
export async function getLocalEmbedding(text: string): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, is_query: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => 'Unknown error');
      throw new Error(
        `Local embedding service returned ${res.status}: ${detail}. ` +
          `Is the embedding service running on ${EMBEDDING_SERVICE_URL}?`
      );
    }

    const data = await res.json();
    return data.embedding;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Local embedding service timed out after ${TIMEOUT_MS}ms. ` +
          `Is the embedding service running on ${EMBEDDING_SERVICE_URL}?`
      );
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to local embedding service at ${EMBEDDING_SERVICE_URL}. ` +
          `Start it with: cd embedding-service && source .venv/bin/activate && ` +
          `uvicorn app.main:app --host 127.0.0.1 --port 8100`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get batch embeddings from the local embedding service.
 */
export async function getLocalBatchEmbeddings(
  texts: string[],
  isQuery: boolean = false
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const controller = new AbortController();
  // Larger timeout for batches
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS * 3);

  try {
    const res = await fetch(`${EMBEDDING_SERVICE_URL}/embed/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, is_query: isQuery }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => 'Unknown error');
      throw new Error(`Local embedding batch failed (${res.status}): ${detail}`);
    }

    const data = await res.json();
    return data.embeddings;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Local embedding batch timed out after ${TIMEOUT_MS * 3}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the local embedding service is ready.
 */
export async function isLocalEmbeddingReady(): Promise<boolean> {
  try {
    const res = await fetch(`${EMBEDDING_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ready';
  } catch {
    return false;
  }
}
