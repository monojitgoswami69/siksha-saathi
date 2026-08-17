import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { documentId } = await params;

    const docRes = await query('SELECT title, source FROM documents WHERE id = $1;', [documentId]);
    if (docRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    const chunksRes = await query(
      `SELECT chunk_index, raw_content, page_start, page_end
       FROM document_chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC;`,
      [documentId]
    );

    const fullContent = chunksRes.rows.map((c) => c.raw_content).join('\n\n');

    return NextResponse.json({
      document_id: documentId,
      title: docRes.rows[0].title,
      source: docRes.rows[0].source,
      total_chunks: chunksRes.rowCount,
      content: fullContent,
      chunks: chunksRes.rows,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
