import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;

    // Verify session belongs to user
    const sessionRes = await query('SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2;', [
      sessionId,
      user.uid,
    ]);

    if (sessionRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Session not found' }, { status: 404 });
    }

    const res = await query(
      `SELECT id, role, content, sources, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC;`,
      [sessionId]
    );

    return NextResponse.json({
      session_id: sessionId,
      messages: res.rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
        created_at: m.created_at.toISOString(),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
