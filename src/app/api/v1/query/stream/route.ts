import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getEmbedding, formatVector } from '@/lib/server/embeddings';
import { streamSocraticChat } from '@/lib/server/llm';
import { logStudentQuery } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      message,
      session_id,
      stream: reqStream,
      semester: reqSem,
      section: reqSection,
      document_id: reqDocId,
      file_name: reqFileName,
      subject: reqSubject,
      history = [],
      top_k = 5,
    } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ detail: 'Message string is required' }, { status: 400 });
    }

    const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.25');
    const topK = Math.min(Math.max(1, top_k), 10);

    // Parallel embedding generation & student profile lookup
    const [queryEmbedding, studentRes] = await Promise.all([
      getEmbedding(message),
      query('SELECT stream, sem, section FROM student_users WHERE id = $1;', [user.uid]).catch(
        () => ({ rowCount: 0, rows: [] })
      ),
    ]);

    // Resolve student scope (request override takes precedence, else DB profile)
    let studentStream = reqStream;
    let studentSem = reqSem;
    let studentSection = reqSection;
    if (studentRes.rowCount && studentRes.rowCount > 0) {
      const profile = studentRes.rows[0] as any;
      studentStream = studentStream || profile.stream;
      studentSem = studentSem || profile.sem;
      studentSection = studentSection || profile.section;
    }

    const vectorStr = formatVector(queryEmbedding);
    const cleanSearchText = message.replace(/[^\w\s]/gi, ' ').trim() || message;

    // ---- Build scope filter (applied to BOTH vector + text search + fallback) ----
    // document_id is AND-ed with scope (never bypasses it) to prevent scope escape.
    let whereFilter = 'WHERE c.embedding IS NOT NULL';
    const params: any[] = [];
    let pIdx = 1;

    if (studentStream && studentStream !== 'All') {
      whereFilter += ` AND (c.stream = $${pIdx} OR c.stream = 'General' OR c.stream IS NULL)`;
      params.push(studentStream);
      pIdx++;
    }
    if (studentSem && studentSem !== 'All') {
      whereFilter += ` AND (c.semester = $${pIdx} OR c.semester = 'General' OR c.semester IS NULL)`;
      params.push(studentSem);
      pIdx++;
    }
    if (studentSection && studentSection !== 'All') {
      whereFilter += ` AND (c.section = $${pIdx} OR c.section = 'General' OR c.section IS NULL)`;
      params.push(studentSection);
      pIdx++;
    }
    if (reqSubject && reqSubject !== 'All Subjects') {
      whereFilter += ` AND (LOWER(c.subject) = LOWER($${pIdx}) OR c.subject = 'General' OR c.subject IS NULL)`;
      params.push(reqSubject);
      pIdx++;
    }
    if (reqFileName) {
      whereFilter += ` AND LOWER(c.file_name) = LOWER($${pIdx})`;
      params.push(reqFileName);
      pIdx++;
    }
    if (reqDocId) {
      whereFilter += ` AND c.document_id = $${pIdx}`;
      params.push(reqDocId);
      pIdx++;
    }

    // The hybrid SQL reuses $1 (vector) and $2 (text) as the first two params;
    // scope params must follow them. We shift scope params to start at index 3.
    const hybridParams: any[] = [vectorStr, cleanSearchText, ...params];
    let hybridPIdx = 3;
    let scopeClauseForHybrid = whereFilter;
    // Re-number scope params from 3 onward
    scopeClauseForHybrid = whereFilter.replace(/\$(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      // scope params were numbered starting at 1 in `params`; now they start at 3
      return `$${num + 2}`;
    });

    const hybridSql = `
      WITH vector_search AS (
        SELECT
          c.id,
          ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1) AS v_rank,
          (1 - (c.embedding <=> $1)) AS v_sim
        FROM document_chunks c
        ${scopeClauseForHybrid}
        LIMIT 25
      ),
      text_search AS (
        SELECT
          c.id,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', c.raw_content), plainto_tsquery('simple', $2)) DESC) AS t_rank,
          ts_rank_cd(to_tsvector('simple', c.raw_content), plainto_tsquery('simple', $2)) AS t_score
        FROM document_chunks c
        ${scopeClauseForHybrid} AND to_tsvector('simple', c.raw_content) @@ plainto_tsquery('simple', $2)
        LIMIT 25
      )
      SELECT
        c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content,
        c.page_start, c.page_end, c.paragraph_id, c.chunk_type, c.char_start, c.char_end,
        c.file_name, c.title, c.stream, c.semester, c.section, c.subject, c.module,
        COALESCE(v.v_sim, 0) AS similarity,
        COALESCE(t.t_score, 0) AS text_score,
        (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + t.t_rank), 0.0)) AS rrf_score
      FROM document_chunks c
      LEFT JOIN vector_search v ON c.id = v.id
      LEFT JOIN text_search t ON c.id = t.id
      WHERE v.id IS NOT NULL OR t.id IS NOT NULL
      ORDER BY rrf_score DESC, similarity DESC
      LIMIT $${hybridPIdx}::int;
    `;
    hybridParams.push(topK);

    let searchResults: any[] = [];
    try {
      const res = await query(hybridSql, hybridParams);
      searchResults = res.rows.filter(
        (r) => r.similarity > SIMILARITY_THRESHOLD || r.text_score >= 0.05
      );
    } catch (e: any) {
      console.warn('Hybrid search fallback to scoped vector search:', e.message);
      try {
        // Retain scope (no escape): re-number params for fallback (vector first, then scope)
        const fallbackScope = whereFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + 1}`);
        const fallbackParams: any[] = [vectorStr, ...params, topK];
        const fallbackSql = `
          SELECT id, document_id, chunk_index, total_chunks, raw_content,
                 page_start, page_end, paragraph_id, chunk_type, char_start, char_end,
                 file_name, title, stream, semester, section, subject, module,
                 1 - (embedding <=> $1) AS similarity
          FROM document_chunks c
          ${fallbackScope}
          ORDER BY embedding <=> $1 LIMIT $${params.length + 2}::int;
        `;
        const res = await query(fallbackSql, fallbackParams);
        searchResults = res.rows.filter((r) => r.similarity > SIMILARITY_THRESHOLD);
      } catch (err: any) {
        console.error('Vector fallback search error:', err.message);
        searchResults = [];
      }
    }

    // Sources payload: ordinal n maps to context block order below
    const sources = searchResults.map((chunk, i) => ({
      n: i + 1,
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      title: chunk.title || chunk.file_name,
      file_name: chunk.file_name,
      page: chunk.page_start || undefined,
      paragraph_id: chunk.paragraph_id || undefined,
      subject: chunk.subject || 'General',
      stream: chunk.stream || 'General',
      semester: chunk.semester || 'General',
      section: chunk.section || 'General',
      chunk_type: chunk.chunk_type || 'text',
      similarity: parseFloat((chunk.similarity || 0).toFixed(3)),
    }));

    // Numbered context blocks so the LLM can cite [[#n]] ordinals
    const contextParts: string[] = [];
    searchResults.forEach((chunk, i) => {
      const loc = [
        `file: "${chunk.file_name}"`,
        `page: ${chunk.page_start || 1}`,
        chunk.paragraph_id ? `paragraph: ${chunk.paragraph_id}` : null,
        `docId: "${chunk.document_id}"`,
        `subject: "${chunk.subject || 'General'}"`,
      ]
        .filter(Boolean)
        .join(', ');
      contextParts.push(
        `--- [#${i + 1}] (${loc}) ---\n${chunk.raw_content}`
      );
    });
    const contextBlock = contextParts.join('\n\n');

    // Save user chat message asynchronously
    if (session_id) {
      query(
        `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2);`,
        [session_id, message]
      )
        .then(() =>
          query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1;', [session_id])
        )
        .catch((e) => console.error('Failed to save user chat message:', e.message));
    }

    const topChunk = searchResults[0];
    // Log the query (one row) and capture its id so we can link every cited chunk below.
    const queryLogId = await logStudentQuery({
      userId: user.uid,
      queryText: message,
      subject: topChunk?.subject || reqSubject || 'General',
      stream: topChunk?.stream || studentStream || 'General',
      semester: topChunk?.semester || studentSem || 'General',
      section: topChunk?.section || studentSection || 'General',
      topChunkId: topChunk?.id,
    }).catch(() => null);

    // Stream Socratic chat response
    const stream = await streamSocraticChat({
      userMessage: message,
      contextBlock,
      conversationHistory: history,
    });

    const reader = stream.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let accumulatedResponse = '';
    // Capture the sources map for post-stream citation counting (ordinal n -> source).
    const sourcesByN = new Map<number, any>();
    sources.forEach((s: any) => sourcesByN.set(s.n, s));

    const customStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ sources, type: 'metadata' })}\n\n`)
        );

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const textChunk = decoder.decode(value);
            const lines = textChunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') {
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                } else {
                  try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.text) {
                      accumulatedResponse += parsed.text;
                    }
                  } catch {}
                  controller.enqueue(encoder.encode(`${line}\n`));
                }
              }
            }
          }

          if (session_id && accumulatedResponse.trim()) {
            query(
              `INSERT INTO chat_messages (session_id, role, content, sources) VALUES ($1, 'assistant', $2, $3);`,
              [session_id, accumulatedResponse.trim(), JSON.stringify(sources)]
            ).catch((e) => console.error('Failed to save assistant chat message:', e.message));
          }

          // ---- Increment counters for EVERY cited material ----
          // The LLM cites by ordinal [[#n]]; we deterministically map ordinals
          // back to real chunk metadata (chunk_id, document_id, subject, scope)
          // from the sources payload — never trusting the LLM with raw UUIDs.
          if (queryLogId) {
            try {
              const citedOrdinals = new Set<number>();
              const re = /\[\[#(\d+)\]\]/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(accumulatedResponse)) !== null) {
                citedOrdinals.add(parseInt(m[1], 10));
              }

              const citedSources: any[] = [];
              for (const n of citedOrdinals) {
                const s = sourcesByN.get(n);
                if (s && s.chunk_id) {
                  citedSources.push(s);
                }
              }

              // Fallback: if the LLM emitted no explicit tags, count the top
              // retrieved chunk so the query is still attributed to a material.
              if (citedSources.length === 0 && topChunk) {
                citedSources.push(sources[0]);
              }

              if (citedSources.length > 0) {
                const values: string[] = [];
                const params: any[] = [];
                let p = 1;
                for (const s of citedSources) {
                  values.push(
                    `($${p},$${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},$${p + 6})`
                  );
                  params.push(
                    queryLogId,
                    s.chunk_id,
                    s.document_id,
                    s.subject || 'General',
                    s.stream || 'General',
                    s.semester || 'General',
                    s.section || 'General'
                  );
                  p += 7;
                }
                await query(
                  `INSERT INTO query_citations
                     (query_log_id, chunk_id, document_id, subject, stream, semester, section)
                   VALUES ${values.join(',')};`,
                  params
                );
              }
            } catch (e: any) {
              console.error('Citation counter error:', e.message);
            }
          }

          controller.close();
        } catch (streamErr: any) {
          console.error('SSE Stream error:', streamErr);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: streamErr.message || 'Streaming failed' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    console.error('Query Stream Endpoint Error:', err);
    return NextResponse.json(
      { detail: err.message || 'Stream initialization error' },
      { status: 500 }
    );
  }
}
