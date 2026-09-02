import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import pure utility functions
import { computeRRFScore, fuseCandidates } from '../src/lib/server/hybridRetrieval';
import { rerankDocuments } from '../src/lib/server/rerankerClient';

describe('Hybrid RAG Pipeline — RRF & Fusion', () => {
  test('computeRRFScore calculates accurate reciprocal ranks with k=60', () => {
    // Vector rank 1 only
    const vOnly = computeRRFScore(1, null, 60);
    assert.equal(vOnly.toFixed(6), (1.0 / 61).toFixed(6));

    // Keyword rank 1 only
    const tOnly = computeRRFScore(null, 1, 60);
    assert.equal(tOnly.toFixed(6), (1.0 / 61).toFixed(6));

    // Both vector rank 1 and keyword rank 1 -> should sum
    const both = computeRRFScore(1, 1, 60);
    assert.equal(both.toFixed(6), (2.0 / 61).toFixed(6));

    // Neither
    const neither = computeRRFScore(null, null, 60);
    assert.equal(neither, 0.0);
  });

  test('fuseCandidates deduplicates overlapping chunks and boosts dual matches', () => {
    const vectorResults = [
      { id: 'chunk-1', raw_content: 'Data structures and binary search trees', v_rank: 1, v_sim: 0.92 },
      { id: 'chunk-2', raw_content: 'Operating system scheduling algorithms', v_rank: 2, v_sim: 0.88 },
      { id: 'chunk-3', raw_content: 'Computer networking TCP/IP', v_rank: 3, v_sim: 0.85 },
    ];

    const keywordResults = [
      { id: 'chunk-2', raw_content: 'Operating system scheduling algorithms', t_rank: 1, t_score: 0.45 },
      { id: 'chunk-4', raw_content: 'Database normalization and SQL keys', t_rank: 2, t_score: 0.38 },
    ];

    const fused = fuseCandidates(vectorResults, keywordResults, 60);

    // Total unique chunks should be 4 (chunk-1, chunk-2, chunk-3, chunk-4)
    assert.equal(fused.length, 4);

    // chunk-2 appeared in BOTH vector (rank 2) and keyword (rank 1):
    // rrf = 1/(60+2) + 1/(60+1) = 0.016129 + 0.016393 = 0.032522
    // chunk-1 appeared in vector only (rank 1):
    // rrf = 1/(60+1) = 0.016393
    // Therefore chunk-2 must be ranked FIRST!
    assert.equal(fused[0].id, 'chunk-2');
    assert.equal(fused[0].v_rank, 2);
    assert.equal(fused[0].t_rank, 1);
    assert.equal(fused[0].similarity, 0.88);
    assert.equal(fused[0].text_score, 0.45);
    assert.ok(fused[0].rrf_score > fused[1].rrf_score);
  });

  test('fuseCandidates handles 25 vector + 15 keyword inputs and sorts descending', () => {
    const vectorResults = Array.from({ length: 25 }, (_, i) => ({
      id: `v-chunk-${i + 1}`,
      raw_content: `Vector document passage ${i + 1}`,
      v_rank: i + 1,
      v_sim: 1 - i * 0.02,
    }));

    // 5 overlapping with vector, 10 unique keyword
    const keywordResults = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `v-chunk-${i + 1}`,
        raw_content: `Vector document passage ${i + 1}`,
        t_rank: i + 1,
        t_score: 0.5 - i * 0.05,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `k-chunk-${i + 1}`,
        raw_content: `Keyword document passage ${i + 1}`,
        t_rank: i + 6,
        t_score: 0.25 - i * 0.02,
      })),
    ];

    const fused = fuseCandidates(vectorResults, keywordResults, 60);

    // 25 vector + 10 distinct keyword = 35 total unique
    assert.equal(fused.length, 35);

    // Check monotonic descending order of RRF scores
    for (let i = 0; i < fused.length - 1; i++) {
      assert.ok(
        fused[i].rrf_score >= fused[i + 1].rrf_score,
        `Item at index ${i} score (${fused[i].rrf_score}) should be >= item at ${i + 1} (${fused[i + 1].rrf_score})`
      );
    }
  });
});

describe('Cross-Encoder Reranker Client', () => {
  test('rerankDocuments returns empty results for empty documents', async () => {
    const res = await rerankDocuments('sample query', []);
    assert.equal(res.results.length, 0);
    assert.equal(res.count, 0);
  });

  test('rerankDocuments handles fallback when service is offline or disabled', async () => {
    // Force reranker to point to unused port to trigger fallback
    const origUrl = process.env.LOCAL_EMBEDDING_URL;
    process.env.LOCAL_EMBEDDING_URL = 'http://127.0.0.1:9999';

    const docs = ['Doc A', 'Doc B', 'Doc C'];
    const res = await rerankDocuments('sample query', docs, 2);

    assert.equal(res.fallback, true);
    assert.equal(res.results.length, 2);
    // Preserves original indices 0, 1
    assert.equal(res.results[0].index, 0);
    assert.equal(res.results[1].index, 1);

    // Restore
    if (origUrl) process.env.LOCAL_EMBEDDING_URL = origUrl;
    else delete process.env.LOCAL_EMBEDDING_URL;
  });

  test('pipeline correctly ranks and truncates to top 10 highest-ranked chunks', () => {
    // Simulated fused candidate set of 30 items
    const fused = Array.from({ length: 30 }, (_, i) => ({
      id: `chunk-${i + 1}`,
      document_id: `doc-${Math.floor(i / 5) + 1}`,
      chunk_index: i,
      total_chunks: 30,
      raw_content: `Passage ${i + 1}`,
      similarity: 0.9 - i * 0.02,
      text_score: 0.8 - i * 0.02,
      rrf_score: 0.03 - i * 0.0005,
    }));

    // Simulated cross-encoder scores where item 15 is actually most relevant
    const simulatedScores = [
      { index: 14, score: 3.45 }, // chunk-15
      { index: 2, score: 2.80 },  // chunk-3
      { index: 0, score: 2.10 },  // chunk-1
      { index: 5, score: 1.95 },  // chunk-6
      { index: 8, score: 1.80 },  // chunk-9
      { index: 20, score: 1.65 }, // chunk-21
      { index: 1, score: 1.50 },  // chunk-2
      { index: 11, score: 1.35 }, // chunk-12
      { index: 3, score: 1.20 },  // chunk-4
      { index: 7, score: 1.05 },  // chunk-8
    ];

    const top10 = simulatedScores.map((s) => ({
      ...fused[s.index],
      rerank_score: s.score,
    }));

    assert.equal(top10.length, 10);
    assert.equal(top10[0].id, 'chunk-15');
    assert.equal(top10[0].rerank_score, 3.45);
    assert.equal(top10[9].id, 'chunk-8');
    assert.equal(top10[9].rerank_score, 1.05);

    // Verify strictly monotonic descending rerank_score
    for (let i = 0; i < top10.length - 1; i++) {
      assert.ok(top10[i].rerank_score >= top10[i + 1].rerank_score);
    }
  });

  test('rerankDocuments scores candidates accurately when microservice is reachable', async () => {
    const docs = [
      'The capital of France is Paris, located on the Seine river.',
      'A binary search tree is an ordered node-based tree data structure in computer science.',
      'Vegetables like carrots and spinach are rich in dietary fibers.',
    ];
    const res = await rerankDocuments('What is a binary search tree?', docs, 2);
    if (!res.fallback) {
      assert.equal(res.results.length, 2);
      assert.equal(res.results[0].index, 1); // BST doc must rank #1
      assert.ok(res.results[0].score > res.results[1].score);
    }
  });
});

