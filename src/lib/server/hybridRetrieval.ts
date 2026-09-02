/**
 * Hybrid RAG Retrieval Engine with Reciprocal Rank Fusion & Cross-Encoder Reranking.
 *
 * Pipeline:
 *  1. Vector search (Top 25) via pgvector cosine distance
 *  2. Keyword / BM25 search (Top 15) via PostgreSQL tsvector ts_rank_cd
 *  3. Reciprocal Rank Fusion (RRF) & deduplication (produces ~25-35 candidates)
 *  4. Cross-Encoder reranking via local microservice (cross-encoder/ms-marco-MiniLM-L-6-v2)
 *  5. Top 10 highest-ranked chunks selected for LLM context
 */
import { query as dbQuery } from './db';
import { rerankDocuments } from './rerankerClient';

export interface RetrievalScope {
  stream?: string;
  semester?: string;
  section?: string;
  subject?: string;
  module?: string;
  fileName?: string;
  documentId?: string;
}

export interface RetrievalChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  total_chunks: number;
  raw_content: string;
  text?: string;
  page_start?: number | null;
  page_end?: number | null;
  paragraph_id?: string | null;
  chunk_type?: string | null;
  char_start?: number | null;
  char_end?: number | null;
  file_name?: string;
  title?: string;
  stream?: string;
  semester?: string;
  section?: string;
  subject?: string;
  module?: string;
  similarity: number;
  text_score: number;
  rrf_score: number;
  rerank_score?: number;
  v_rank?: number | null;
  t_rank?: number | null;
}

export interface RetrievalMetrics {
  vector_candidates_count: number;
  keyword_candidates_count: number;
  fused_candidates_count: number;
  final_selected_count: number;
  rerank_duration_ms: number;
  reranker_model: string;
  reranker_fallback: boolean;
  top_rerank_score?: number;
}

export interface HybridRetrievalResult {
  chunks: RetrievalChunk[];
  metrics: RetrievalMetrics;
}

// Configurable constants with environment fallbacks
const VECTOR_LIMIT = parseInt(process.env.HYBRID_VECTOR_LIMIT || '25', 10);
const KEYWORD_LIMIT = parseInt(process.env.HYBRID_KEYWORD_LIMIT || '15', 10);
const RRF_K = parseFloat(process.env.RRF_K || '60');
const TOP_K = parseInt(process.env.RETRIEVAL_TOP_K || '10', 10);

/**
 * Computes Reciprocal Rank Fusion score for a candidate.
 */
export function computeRRFScore(
  vRank?: number | null,
  tRank?: number | null,
  k: number = RRF_K
): number {
  const vScore = vRank != null && vRank > 0 ? 1.0 / (k + vRank) : 0.0;
  const tScore = tRank != null && tRank > 0 ? 1.0 / (k + tRank) : 0.0;
  return vScore + tScore;
}

/**
 * Fuse and deduplicate vector results and keyword results using RRF.
 */
export function fuseCandidates(
  vectorResults: Array<Partial<RetrievalChunk> & { id: string; v_sim?: number; v_rank?: number }>,
  keywordResults: Array<Partial<RetrievalChunk> & { id: string; t_score?: number; t_rank?: number }>,
  k: number = RRF_K
): RetrievalChunk[] {
  const candidateMap = new Map<string, RetrievalChunk>();

  // 1. Process vector results
  vectorResults.forEach((row, idx) => {
    const vRank = row.v_rank || idx + 1;
    const chunk: RetrievalChunk = {
      id: row.id,
      document_id: row.document_id || '',
      chunk_index: row.chunk_index ?? 0,
      total_chunks: row.total_chunks ?? 0,
      raw_content: row.raw_content || row.text || '',
      text: row.text || row.raw_content || '',
      page_start: row.page_start,
      page_end: row.page_end,
      paragraph_id: row.paragraph_id,
      chunk_type: row.chunk_type,
      char_start: row.char_start,
      char_end: row.char_end,
      file_name: row.file_name,
      title: row.title,
      stream: row.stream,
      semester: row.semester,
      section: row.section,
      subject: row.subject,
      module: row.module,
      similarity: row.v_sim ?? row.similarity ?? 0,
      text_score: 0,
      v_rank: vRank,
      t_rank: null,
      rrf_score: 0,
    };
    candidateMap.set(row.id, chunk);
  });

  // 2. Process keyword results (deduplicate and merge)
  keywordResults.forEach((row, idx) => {
    const tRank = row.t_rank || idx + 1;
    const tScore = row.t_score ?? row.text_score ?? 0;

    if (candidateMap.has(row.id)) {
      const existing = candidateMap.get(row.id)!;
      existing.text_score = tScore;
      existing.t_rank = tRank;
    } else {
      const chunk: RetrievalChunk = {
        id: row.id,
        document_id: row.document_id || '',
        chunk_index: row.chunk_index ?? 0,
        total_chunks: row.total_chunks ?? 0,
        raw_content: row.raw_content || row.text || '',
        text: row.text || row.raw_content || '',
        page_start: row.page_start,
        page_end: row.page_end,
        paragraph_id: row.paragraph_id,
        chunk_type: row.chunk_type,
        char_start: row.char_start,
        char_end: row.char_end,
        file_name: row.file_name,
        title: row.title,
        stream: row.stream,
        semester: row.semester,
        section: row.section,
        subject: row.subject,
        module: row.module,
        similarity: row.similarity ?? 0,
        text_score: tScore,
        v_rank: null,
        t_rank: tRank,
        rrf_score: 0,
      };
      candidateMap.set(row.id, chunk);
    }
  });

  // 3. Compute final RRF score for all candidates
  const candidates = Array.from(candidateMap.values());
  candidates.forEach((c) => {
    c.rrf_score = computeRRFScore(c.v_rank, c.t_rank, k);
  });

  // Sort descending by RRF score, tie-break by vector similarity
  candidates.sort((a, b) => {
    if (b.rrf_score !== a.rrf_score) return b.rrf_score - a.rrf_score;
    return b.similarity - a.similarity;
  });

  return candidates;
}

/**
 * Builds the SQL WHERE clause for academic scoping.
 */
function buildScopeClause(scope: RetrievalScope, paramOffset: number = 0) {
  let where = 'WHERE 1=1';
  const params: any[] = [];
  let pIdx = paramOffset + 1;

  if (scope.stream) {
    where += ` AND (LOWER(c.stream) = LOWER($${pIdx}) OR c.stream = 'General' OR c.stream IS NULL)`;
    params.push(scope.stream);
    pIdx++;
  }
  if (scope.semester !== undefined && scope.semester !== null && scope.semester !== '') {
    const rawSem = String(scope.semester).trim();
    const semNum = rawSem.replace(/^(?:sem|semester)\s*/i, '');
    where += ` AND (c.semester = $${pIdx} OR c.semester = $${pIdx + 1} OR c.semester = 'General' OR c.semester IS NULL)`;
    params.push(rawSem, semNum);
    pIdx += 2;
  }
  if (scope.section) {
    where += ` AND (LOWER(c.section) = LOWER($${pIdx}) OR c.section = 'General' OR c.section IS NULL)`;
    params.push(scope.section);
    pIdx++;
  }
  if (scope.subject && scope.subject !== 'All Subjects') {
    where += ` AND (LOWER(c.subject) = LOWER($${pIdx}) OR c.subject = 'General' OR c.subject IS NULL)`;
    params.push(scope.subject);
    pIdx++;
  }
  if (scope.fileName) {
    where += ` AND LOWER(c.file_name) = LOWER($${pIdx})`;
    params.push(scope.fileName);
    pIdx++;
  }
  if (scope.module) {
    where += ` AND (LOWER(c.module) = LOWER($${pIdx}) OR LOWER(c.file_name) ILIKE $${pIdx + 1})`;
    params.push(scope.module, `%${scope.module}%`);
    pIdx += 2;
  }
  if (scope.documentId) {
    where += ` AND c.document_id = $${pIdx}`;
    params.push(scope.documentId);
    pIdx++;
  }

  return { where, params };
}

/**
 * Execute full Hybrid Retrieval Pipeline:
 *  - Top 25 Vector search
 *  - Top 15 Keyword search
 *  - Deduplicate & RRF fusion
 *  - Cross-Encoder Rerank
 *  - Top 10 selection
 */
export async function executeHybridRetrieval(options: {
  queryText: string;
  queryVector: number[];
  scope?: RetrievalScope;
  vectorLimit?: number;
  keywordLimit?: number;
  topK?: number;
  embeddingCol?: string;
}): Promise<HybridRetrievalResult> {
  const {
    queryText,
    queryVector,
    scope = {},
    vectorLimit = VECTOR_LIMIT,
    keywordLimit = KEYWORD_LIMIT,
    topK = TOP_K,
    embeddingCol = 'embedding_local',
  } = options;

  const cleanQuery = queryText.trim().replace(/\s+/g, ' ');
  const vectorStr = `[${queryVector.join(',')}]`;

  // 1. Execute Combined Hybrid SQL in PostgreSQL with dedicated CTE limits
  //    (vector: 25, keyword: 15)
  const { where: scopeClause, params: scopeParams } = buildScopeClause(scope, 2);
  const hybridParams = [vectorStr, cleanQuery, ...scopeParams];

  const hybridSql = `
    WITH vector_search AS (
      SELECT
        c.id,
        ROW_NUMBER() OVER (ORDER BY c.${embeddingCol} <=> $1) AS v_rank,
        (1 - (c.${embeddingCol} <=> $1)) AS v_sim
      FROM document_chunks c
      ${scopeClause}
      ORDER BY c.${embeddingCol} <=> $1
      LIMIT ${vectorLimit}
    ),
    text_search AS (
      SELECT
        c.id,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(COALESCE(c.search_vector, to_tsvector('simple', c.raw_content)), plainto_tsquery('simple', $2)) DESC) AS t_rank,
        ts_rank_cd(COALESCE(c.search_vector, to_tsvector('simple', c.raw_content)), plainto_tsquery('simple', $2)) AS t_score
      FROM document_chunks c
      ${scopeClause} AND COALESCE(c.search_vector, to_tsvector('simple', c.raw_content)) @@ plainto_tsquery('simple', $2)
      ORDER BY ts_rank_cd(COALESCE(c.search_vector, to_tsvector('simple', c.raw_content)), plainto_tsquery('simple', $2)) DESC
      LIMIT ${keywordLimit}
    )
    SELECT
      c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content,
      c.page_start, c.page_end, c.paragraph_id, c.chunk_type, c.char_start, c.char_end,
      c.file_name, c.title, c.stream, c.semester, c.section, c.subject, c.module,
      v.v_rank,
      COALESCE(v.v_sim, 0) AS similarity,
      t.t_rank,
      COALESCE(t.t_score, 0) AS text_score
    FROM document_chunks c
    LEFT JOIN vector_search v ON c.id = v.id
    LEFT JOIN text_search t ON c.id = t.id
    WHERE v.id IS NOT NULL OR t.id IS NOT NULL;
  `;

  let rows: any[] = [];
  let vectorCount = 0;
  let keywordCount = 0;

  try {
    const res = await dbQuery(hybridSql, hybridParams);
    rows = res.rows || [];
  } catch (err: any) {
    console.warn('[HybridRetrieval] Hybrid query failed, falling back to pure vector:', err.message);
    // Fallback: vector only
    try {
      const { where: fbScope, params: fbParams } = buildScopeClause(scope, 1);
      const fbSql = `
        SELECT
          c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content,
          c.page_start, c.page_end, c.paragraph_id, c.chunk_type, c.char_start, c.char_end,
          c.file_name, c.title, c.stream, c.semester, c.section, c.subject, c.module,
          ROW_NUMBER() OVER (ORDER BY c.${embeddingCol} <=> $1) AS v_rank,
          (1 - (c.${embeddingCol} <=> $1)) AS similarity,
          0 AS text_score
        FROM document_chunks c
        ${fbScope}
        ORDER BY c.${embeddingCol} <=> $1
        LIMIT ${vectorLimit};
      `;
      const fbRes = await dbQuery(fbSql, [vectorStr, ...fbParams]);
      rows = fbRes.rows || [];
    } catch (fbErr: any) {
      console.error('[HybridRetrieval] Fallback search error:', fbErr.message);
      rows = [];
    }
  }

  // 2. Separate into vector and keyword sets to compute exact counts and fuse
  const vectorRows: any[] = [];
  const keywordRows: any[] = [];

  rows.forEach((r) => {
    if (r.v_rank != null) {
      vectorRows.push({ ...r, v_sim: r.similarity });
      vectorCount++;
    }
    if (r.t_rank != null) {
      keywordRows.push({ ...r, t_score: r.text_score });
      keywordCount++;
    }
  });

  // 3. Deduplicate and compute RRF scores
  const fusedCandidates = fuseCandidates(vectorRows, keywordRows, RRF_K);

  if (fusedCandidates.length === 0) {
    return {
      chunks: [],
      metrics: {
        vector_candidates_count: 0,
        keyword_candidates_count: 0,
        fused_candidates_count: 0,
        final_selected_count: 0,
        rerank_duration_ms: 0,
        reranker_model: 'none',
        reranker_fallback: false,
      },
    };
  }

  // 4. Pass fused candidates through Cross-Encoder Reranker
  const candidatePassages = fusedCandidates.map((c) => c.raw_content || c.text || '');
  const rerankResponse = await rerankDocuments(cleanQuery, candidatePassages, topK);

  // 5. Select top K chunks based on reranking
  let finalChunks: RetrievalChunk[] = [];

  if (!rerankResponse.fallback && rerankResponse.results.length > 0) {
    // Map reranked indices back to fused candidate chunks
    finalChunks = rerankResponse.results.map((item) => {
      const chunk = fusedCandidates[item.index];
      return {
        ...chunk,
        rerank_score: item.score,
      };
    });
  } else {
    // Fallback: take top K directly from RRF ranking
    finalChunks = fusedCandidates.slice(0, topK);
  }

  const metrics: RetrievalMetrics = {
    vector_candidates_count: vectorCount,
    keyword_candidates_count: keywordCount,
    fused_candidates_count: fusedCandidates.length,
    final_selected_count: finalChunks.length,
    rerank_duration_ms: rerankResponse.time_ms,
    reranker_model: rerankResponse.model,
    reranker_fallback: !!rerankResponse.fallback,
    top_rerank_score: finalChunks[0]?.rerank_score,
  };

  // 6. Structured logging
  console.log(
    `[HybridRetrieval] Query: "${cleanQuery.slice(0, 40)}${cleanQuery.length > 40 ? '...' : ''}" | ` +
    `Vector: ${vectorCount}/${vectorLimit} | Keyword: ${keywordCount}/${keywordLimit} | ` +
    `Fused: ${fusedCandidates.length} | Selected: ${finalChunks.length}/${topK} | ` +
    `Reranker: ${rerankResponse.model} (${rerankResponse.time_ms}ms, fallback=${metrics.reranker_fallback}) | ` +
    `Top Score: ${finalChunks[0]?.rerank_score?.toFixed(4) ?? 'N/A'}`
  );

  return {
    chunks: finalChunks,
    metrics,
  };
}
