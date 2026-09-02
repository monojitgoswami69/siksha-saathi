import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;

    const res = await query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id;',
      [sessionId, user.uid]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Session deleted successfully',
      session_id: sessionId,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await req.json();
    const { title, is_pinned } = body;

    const res = await query(
      `UPDATE chat_sessions
       SET title = COALESCE($1, title),
           is_pinned = COALESCE($2, is_pinned),
           pinned_at = CASE
             WHEN $2 = true AND (is_pinned IS FALSE OR pinned_at IS NULL) THEN NOW()
             WHEN $2 = false THEN NULL
             ELSE pinned_at
           END,
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, is_pinned, pinned_at, updated_at;`,
      [title !== undefined ? title : null, is_pinned !== undefined ? is_pinned : null, sessionId, user.uid]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(res.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
