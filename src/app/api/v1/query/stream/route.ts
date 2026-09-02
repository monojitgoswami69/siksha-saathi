import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getQueryEmbedding, getEmbeddingColumn } from '@/lib/server/embeddingRouter';
import { streamSocraticChat } from '@/lib/server/llm';
import { logStudentQuery } from '@/lib/server/audit';
import { executeHybridRetrieval } from '@/lib/server/hybridRetrieval';

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
      module: reqModule,
      history = [],
      top_k = 10,
    } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ detail: 'Message string is required' }, { status: 400 });
    }

    // Role-based scope enforcement: students are pinned to their profile
    let studentStream = reqStream;
    let studentSem = reqSem;
    let studentSection = reqSection;

    if (user.role === 'student') {
      const studentRes = await query(
        `SELECT stream, sem, section FROM student_users WHERE id = $1 LIMIT 1;`,
        [user.uid]
      );
      if (studentRes.rows.length === 0) {
        return NextResponse.json({ detail: 'Student profile not found' }, { status: 404 });
      }
      const profile = studentRes.rows[0] as any;
      studentStream = studentStream || profile.stream;
      studentSem = studentSem || profile.sem;
      studentSection = studentSection || profile.section;
    }

    const queryEmbedding = await getQueryEmbedding(message);
    const embCol = getEmbeddingColumn();

    // Execute full Hybrid RAG Retrieval Pipeline (Top 25 Vector + Top 15 Keyword -> RRF -> Rerank -> Top 10)
    const retrievalResult = await executeHybridRetrieval({
      queryText: message,
      queryVector: queryEmbedding,
      scope: {
        stream: studentStream && studentStream !== 'All' ? studentStream : undefined,
        semester: studentSem && studentSem !== 'All' ? studentSem : undefined,
        section: studentSection && studentSection !== 'All' ? studentSection : undefined,
        subject: reqSubject && reqSubject !== 'All Subjects' ? reqSubject : undefined,
        module: reqModule || undefined,
        fileName: reqFileName || undefined,
        documentId: reqDocId || undefined,
      },
      vectorLimit: 25,
      keywordLimit: 15,
      topK: top_k || 10,
      embeddingCol: embCol,
    });

    const searchResults = retrievalResult.chunks;

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
      rerank_score: chunk.rerank_score != null ? parseFloat(chunk.rerank_score.toFixed(4)) : undefined,
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

    // Optimization 3: Reranker score gating to prevent hallucinations on out-of-scope questions
    const isOutOfScope = topChunk?.rerank_score != null && topChunk.rerank_score < -3.0;
    const finalContextBlock = isOutOfScope
      ? `[NOTICE TO ASSISTANT: The student's question appears outside the course curriculum. The top retrieved chunk had a very low relevance score (${topChunk.rerank_score}). Politely inform the student that this topic is not covered in their syllabus or enrolled course materials, and guide them back to their subjects, rather than guessing or fabricating an answer.]\n\n${contextBlock}`
      : contextBlock;

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

    // Check if this is the first message of the session (title is 'New Chat' or no messages yet)
    let isFirstMessage = !history || history.length === 0;
    if (session_id) {
      try {
        const sessRes = await query(
          'SELECT title, (SELECT COUNT(*)::int FROM chat_messages WHERE session_id = s.id) as msg_count FROM chat_sessions s WHERE s.id = $1;',
          [session_id]
        );
        if (sessRes.rowCount && sessRes.rowCount > 0) {
          const row = sessRes.rows[0];
          if (row.title === 'New Chat' || row.msg_count <= 1) {
            isFirstMessage = true;
          }
        }
      } catch (e: any) {
        console.error('Session check error:', e?.message);
      }
    }

    // Stream Socratic chat response
    const stream = await streamSocraticChat({
      userMessage: message,
      contextBlock: finalContextBlock,
      conversationHistory: history,
      isFirstMessage,
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
                  // Do not forward [DONE] yet; session_name and metadata follow after this stream
                  continue;
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

          // ---- Extract strictly the exact cited source(s) used in the answer ----
          const citedOrdinals = new Set<number>();
          const reDouble = /\[\[#?(\d+)\]\]/g;
          let m: RegExpExecArray | null;
          while ((m = reDouble.exec(accumulatedResponse)) !== null) {
            citedOrdinals.add(parseInt(m[1], 10));
          }
          const reSingle = /(?:^|[\s(])\[#?(\d+)\]/g;
          while ((m = reSingle.exec(accumulatedResponse)) !== null) {
            citedOrdinals.add(parseInt(m[1], 10));
          }
          const reHash = /(?:^|[\s(])#(\d+)(?=[.,;:\s)]|$)/g;
          while ((m = reHash.exec(accumulatedResponse)) !== null) {
            citedOrdinals.add(parseInt(m[1], 10));
          }

          const matchedSources: any[] = [];
          for (const n of citedOrdinals) {
            const s = sourcesByN.get(n);
            if (s && s.chunk_id) {
              matchedSources.push(s);
            }
          }

          // Fallback: if no explicit citations were emitted, strictly take only the top 1 retrieved chunk that answered it
          const finalExactSources =
            matchedSources.length > 0
              ? matchedSources
              : sources.length > 0
              ? [sources[0]]
              : [];

          // Deduplicate by document_id and page
          const seenKeys = new Set<string>();
          const deduplicatedSources: any[] = [];
          for (const s of finalExactSources) {
            const key = `${s.document_id || s.title}_${s.page}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              deduplicatedSources.push(s);
            }
          }

          // ---- Check for SESSION_NAME from model or fallback for first message ----
          let generatedSessionName: string | null = null;
          const sessionNameMatch = /(?:<!--\s*SESSION_NAME:\s*|\[SESSION_NAME:\s*|SESSION_NAME:\s*)(.+?)(?:-->|\]|$)/i.exec(accumulatedResponse);
          if (sessionNameMatch && sessionNameMatch[1]) {
            generatedSessionName = sessionNameMatch[1].trim().replace(/^["']|["']$/g, '');
          }

          if (!generatedSessionName && isFirstMessage) {
            const cleanMsg = message.trim().replace(/[?.,!]+$/, '').slice(0, 40).trim();
            if (cleanMsg) {
              generatedSessionName = cleanMsg.charAt(0).toUpperCase() + cleanMsg.slice(1);
            }
          }

          // Strip any session name comment tag so it never appears in the student chat history
          const cleanAssistantResponse = accumulatedResponse
            .replace(/(?:<!--\s*SESSION_NAME:\s*|\[SESSION_NAME:\s*|SESSION_NAME:\s*)(.+?)(?:-->|\]|$)/gi, '')
            .trim();

          if (session_id && generatedSessionName) {
            try {
              await query(
                'UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2;',
                [generatedSessionName, session_id]
              );
            } catch (e: any) {
              console.error('Failed to update session title in DB:', e.message);
            }

            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'session_name', title: generatedSessionName, session_id })}\n\n`
                )
              );
            } catch {}
          }

          // Emit exact sources so client displays only the real answer source(s)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ sources: deduplicatedSources, type: 'metadata' })}\n\n`)
          );

          if (session_id && (cleanAssistantResponse || accumulatedResponse.trim())) {
            try {
              await query(
                `INSERT INTO chat_messages (session_id, role, content, sources) VALUES ($1, 'assistant', $2, $3);`,
                [session_id, cleanAssistantResponse || accumulatedResponse.trim(), JSON.stringify(deduplicatedSources)]
              );
            } catch (e: any) {
              console.error('Failed to save assistant chat message:', e.message);
            }
          }

          // ---- Increment counters for cited materials ----
          if (queryLogId && deduplicatedSources.length > 0) {
            try {
              const values: string[] = [];
              const params: any[] = [];
              let p = 1;
              for (const s of deduplicatedSources) {
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
            } catch (e: any) {
              console.error('Citation counter error:', e.message);
            }
          }

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
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
