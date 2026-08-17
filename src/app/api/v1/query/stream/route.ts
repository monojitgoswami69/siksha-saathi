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
      document_id: reqDocId,
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
      query('SELECT stream, sem FROM student_users WHERE id = $1;', [user.uid]).catch(() => ({
        rowCount: 0,
        rows: [],
      })),
    ]);

    // Resolve student stream & semester
    let studentStream = reqStream;
    let studentSem = reqSem;
    if (studentRes.rowCount && studentRes.rowCount > 0) {
      const profile = studentRes.rows[0] as any;
      studentStream = studentStream || profile.stream;
      studentSem = studentSem || profile.sem;
    }

    const vectorStr = formatVector(queryEmbedding);
    const cleanSearchText = message.replace(/[^\w\s]/gi, ' ').trim() || message;

    // Hybrid Search: Vector Cosine + Full-Text Search via Reciprocal Rank Fusion (RRF)
    let whereFilter = 'WHERE c.embedding IS NOT NULL';
    const params: any[] = [vectorStr, cleanSearchText];
    let pIdx = 3;

    if (reqDocId) {
      whereFilter += ` AND c.document_id = $${pIdx}`;
      params.push(reqDocId);
      pIdx++;
    } else {
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
      if (reqSubject && reqSubject !== 'All Subjects') {
        whereFilter += ` AND (LOWER(c.subject) = LOWER($${pIdx}) OR c.subject = 'General' OR c.subject IS NULL)`;
        params.push(reqSubject);
        pIdx++;
      }
    }

    const hybridSql = `
      WITH vector_search AS (
        SELECT 
          c.id,
          ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1) AS v_rank,
          (1 - (c.embedding <=> $1)) AS v_sim
        FROM document_chunks c
        ${whereFilter}
        LIMIT 25
      ),
      text_search AS (
        SELECT 
          c.id,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', c.raw_content), plainto_tsquery('english', $2)) DESC) AS t_rank,
          ts_rank_cd(to_tsvector('english', c.raw_content), plainto_tsquery('english', $2)) AS t_score
        FROM document_chunks c
        ${whereFilter} AND to_tsvector('english', c.raw_content) @@ plainto_tsquery('english', $2)
        LIMIT 25
      )
      SELECT 
        c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content,
        c.page_start, c.page_end, c.source, c.title, c.stream, c.semester, c.subject, c.module,
        COALESCE(v.v_sim, 0) AS similarity,
        COALESCE(t.t_score, 0) AS text_score,
        (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + t.t_rank), 0.0)) AS rrf_score
      FROM document_chunks c
      LEFT JOIN vector_search v ON c.id = v.id
      LEFT JOIN text_search t ON c.id = t.id
      WHERE v.id IS NOT NULL OR t.id IS NOT NULL
      ORDER BY rrf_score DESC, similarity DESC
      LIMIT $${pIdx};
    `;
    params.push(topK);

    let searchResults: any[] = [];
    try {
      const res = await query(hybridSql, params);
      searchResults = res.rows.filter((r) => r.similarity > SIMILARITY_THRESHOLD || r.text_score > 0.05);
    } catch (e: any) {
      console.warn('Hybrid search fallback to basic vector search:', e.message);
      try {
        const fallbackSql = `
          SELECT id, document_id, chunk_index, total_chunks, raw_content,
                 page_start, page_end, source, title, stream, semester, subject, module,
                 1 - (embedding <=> $1) AS similarity
          FROM document_chunks
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1 LIMIT 5;
        `;
        const res = await query(fallbackSql, [vectorStr]);
        searchResults = res.rows.filter((r) => r.similarity > SIMILARITY_THRESHOLD);
      } catch (err: any) {
        console.error('Vector fallback search error:', err.message);
        searchResults = [];
      }
    }

    // Format sources with document_id and page numbers
    const sources = searchResults.map((chunk) => ({
      title: chunk.title || chunk.source,
      source: chunk.source,
      document_id: chunk.document_id,
      subject: chunk.subject || 'General',
      module: chunk.module || undefined,
      page: chunk.page_start || undefined,
      chunk_index: chunk.chunk_index,
      similarity: parseFloat((chunk.similarity || 0).toFixed(3)),
    }));

    // Format Reference Material with structured citation anchors
    const contextParts: string[] = [];
    searchResults.forEach((chunk, i) => {
      contextParts.push(
        `--- Document ${i + 1}: "${chunk.title || chunk.source}" (docId: "${chunk.document_id}", Page: ${chunk.page_start || 1}, Subject: "${chunk.subject || 'General'}") ---\n${chunk.raw_content}`
      );
    });
    const contextBlock = contextParts.join('\n\n');

    // Save user chat message asynchronously
    if (session_id) {
      query(
        `INSERT INTO chat_messages (session_id, role, content)
         VALUES ($1, 'user', $2);`,
        [session_id, message]
      )
        .then(() => query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1;', [session_id]))
        .catch((e) => console.error('Failed to save user chat message:', e.message));
    }

    const topChunk = searchResults[0];
    logStudentQuery({
      userId: user.uid,
      queryText: message,
      subject: topChunk?.subject || reqSubject || 'General',
      stream: topChunk?.stream || studentStream || 'General',
      semester: topChunk?.semester || studentSem || 'General',
      topChunkId: topChunk?.id,
    }).catch(() => {});

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

    const customStream = new ReadableStream({
      async start(controller) {
        // Send initial metadata frame containing hybrid sources
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

          // Persist assistant message in background
          if (session_id && accumulatedResponse.trim()) {
            query(
              `INSERT INTO chat_messages (session_id, role, content, sources)
               VALUES ($1, 'assistant', $2, $3);`,
              [session_id, accumulatedResponse.trim(), JSON.stringify(sources)]
            ).catch((e) => console.error('Failed to save assistant chat message:', e.message));
          }

          controller.close();
        } catch (streamErr: any) {
          console.error('SSE Stream error:', streamErr);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: streamErr.message || 'Streaming failed' })}\n\n`)
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
    return NextResponse.json({ detail: err.message || 'Stream initialization error' }, { status: 500 });
  }
}
