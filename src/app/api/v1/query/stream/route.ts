import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getEmbedding, formatVector } from '@/lib/server/embeddings';
import { streamSocraticChat } from '@/lib/server/llm';
import { logStudentQuery } from '@/lib/server/audit';

const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.3');

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
      subject: reqSubject,
      document_id: reqDocId,
      history = [],
    } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ detail: 'Message cannot be empty' }, { status: 400 });
    }

    const topK = parseInt(process.env.RETRIEVAL_TOP_K || '5', 10);

    // Run query embedding and student profile lookup in PARALLEL
    const [queryEmbedding, studentRes] = await Promise.all([
      getEmbedding(message),
      query('SELECT stream, sem FROM student_users WHERE id = $1;', [user.uid]).catch(() => ({
        rowCount: 0,
        rows: [],
      })),
    ]);

    // Always resolve the student's stream/semester — request body overrides profile
    let studentStream = reqStream;
    let studentSem = reqSem;
    if (studentRes.rowCount && studentRes.rowCount > 0) {
      const profile = studentRes.rows[0] as any;
      studentStream = studentStream || profile.stream;
      studentSem = studentSem || profile.sem;
    }

    const vectorStr = formatVector(queryEmbedding);

    // Build vector query with pgvector cosine distance + mandatory metadata filters
    let vectorSql = `
      SELECT id, document_id, chunk_index, total_chunks, raw_content,
             page_start, page_end, source, title, stream, semester, subject, module,
             1 - (embedding <=> $1) AS similarity
      FROM document_chunks
      WHERE embedding IS NOT NULL
    `;
    const params: any[] = [vectorStr];
    let pIdx = 2;

    if (reqDocId) {
      // Scoped to a specific document
      vectorSql += ` AND document_id = $${pIdx}`;
      params.push(reqDocId);
      pIdx++;
    } else {
      // Mandatory stream/semester filters for data segregation
      if (studentStream && studentStream !== 'All') {
        vectorSql += ` AND (stream = $${pIdx} OR stream = 'General' OR stream IS NULL)`;
        params.push(studentStream);
        pIdx++;
      }
      if (studentSem && studentSem !== 'All') {
        vectorSql += ` AND (semester = $${pIdx} OR semester = 'General' OR semester IS NULL)`;
        params.push(studentSem);
        pIdx++;
      }
      if (reqSubject && reqSubject !== 'All Subjects') {
        vectorSql += ` AND (LOWER(subject) = LOWER($${pIdx}) OR subject = 'General' OR subject IS NULL)`;
        params.push(reqSubject);
        pIdx++;
      }
    }

    vectorSql += ` ORDER BY embedding <=> $1 LIMIT $${pIdx};`;
    params.push(topK);

    let searchResults: any[] = [];
    try {
      const res = await query(vectorSql, params);
      searchResults = res.rows.filter((r) => r.similarity > SIMILARITY_THRESHOLD);
    } catch (e: any) {
      console.error('Vector search error:', e.message);
      // Safe fallback: empty context (LLM will refuse to answer)
      searchResults = [];
    }

    // Format source metadata for each retrieved chunk
    const sources = searchResults.map((chunk, i) => ({
      title: chunk.title || chunk.source,
      source: chunk.source,
      subject: chunk.subject || 'General',
      module: chunk.module || undefined,
      page: chunk.page_start || undefined,
      chunk_index: chunk.chunk_index,
      similarity: parseFloat((chunk.similarity || 0).toFixed(3)),
    }));

    // Format Reference Material for LLM context
    const contextParts: string[] = [];
    searchResults.forEach((chunk, i) => {
      contextParts.push(
        `--- Document ${i + 1}: ${chunk.title || chunk.source} (Page ${chunk.page_start || '?'}, Subject: ${chunk.subject || 'General'}) ---\n${chunk.raw_content}`
      );
    });
    const contextBlock = contextParts.join('\n\n');

    // Save user message and track analytics asynchronously without blocking stream start
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
    });

    // Stream Socratic response immediately
    const stream = await streamSocraticChat({
      userMessage: message,
      contextBlock,
      conversationHistory: history,
    });

    // TransformStream collects response tokens, emits source metadata, and saves to DB upon completion
    let fullResponseText = '';
    const encoder = new TextEncoder();
    const transformStream = new TransformStream({
      start(controller) {
        // Emit source metadata as the first SSE event so frontend can display sources immediately
        if (sources.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`)
          );
        }
      },
      transform(chunk, controller) {
        controller.enqueue(chunk);
        try {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) fullResponseText += data.text;
              } catch {}
            }
          }
        } catch {}
      },
      async flush() {
        if (session_id && fullResponseText.trim()) {
          try {
            await query(
              `INSERT INTO chat_messages (session_id, role, content, sources)
               VALUES ($1, 'assistant', $2, $3);`,
              [
                session_id,
                fullResponseText.trim(),
                JSON.stringify(sources),
              ]
            );
          } catch (e: any) {
            console.error('Failed to save assistant message:', e.message);
          }
        }
      },
    });

    return new Response(stream.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('Streaming query error:', err);
    return NextResponse.json({ detail: err.message || 'RAG stream error' }, { status: 500 });
  }
}
