/**
 * Cross-Encoder Reranker Client.
 *
 * Sends candidate passages and query to the local embedding/reranker
 * service (FastAPI on port 8100) running cross-encoder/ms-marco-MiniLM-L-6-v2.
 */

export interface RerankResultItem {
  index: number;
  score: number;
}

export interface RerankResponse {
  results: RerankResultItem[];
  model: string;
  time_ms: number;
  count: number;
  fallback?: boolean;
}

const DEFAULT_EMBEDDING_URL = 'http://127.0.0.1:8100';
const DEFAULT_TIMEOUT_MS = 5000;

export function getRerankerUrl(): string {
  return process.env.LOCAL_EMBEDDING_URL || DEFAULT_EMBEDDING_URL;
}

export function isRerankerEnabled(): boolean {
  return process.env.RERANKER_ENABLED !== 'false';
}

/**
 * Rerank documents against a search query using the Cross-Encoder microservice.
 *
 * If the service is disabled or unreachable, falls back to the original order
 * without throwing, setting fallback: true.
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topK?: number
): Promise<RerankResponse> {
  if (!documents || documents.length === 0) {
    return {
      results: [],
      model: 'none',
      time_ms: 0,
      count: 0,
    };
  }

  if (!isRerankerEnabled()) {
    return {
      results: documents.map((_, idx) => ({ index: idx, score: 0 })),
      model: 'disabled',
      time_ms: 0,
      count: documents.length,
      fallback: true,
    };
  }

  const timeoutMs = parseInt(process.env.RERANKER_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10);
  const rerankEndpoint = `${getRerankerUrl()}/rerank`;

  const t0 = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(rerankEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documents,
        top_k: topK,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Reranker HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const duration = performance.now() - t0;

    return {
      results: data.results || [],
      model: data.model || 'cross-encoder',
      time_ms: data.time_ms || Math.round(duration),
      count: data.count || (data.results ? data.results.length : 0),
      fallback: false,
    };
  } catch (err: any) {
    const duration = performance.now() - t0;
    console.warn(`[Reranker] Microservice fallback (${err.message}). Using RRF order.`);

    // Fallback: preserve original order
    const fallbackResults = documents
      .map((_, idx) => ({ index: idx, score: 0 }))
      .slice(0, topK || documents.length);

    return {
      results: fallbackResults,
      model: 'fallback',
      time_ms: Math.round(duration),
      count: fallbackResults.length,
      fallback: true,
    };
  }
}
