import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

// List sessions for logged-in student
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const res = await query(
      `SELECT s.id as session_id, s.title, s.is_pinned, s.created_at, s.updated_at,
              COUNT(m.id)::int as message_count
       FROM chat_sessions s
       LEFT JOIN chat_messages m ON s.id = m.session_id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.is_pinned DESC, s.updated_at DESC
       LIMIT 50;`,
      [user.uid]
    );

    return NextResponse.json({
      sessions: res.rows.map((s) => ({
        session_id: s.session_id,
        id: s.session_id,
        title: s.title,
        is_pinned: s.is_pinned,
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
        message_count: s.message_count,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

// Create new session
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = body.title || 'New Chat';
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const res = await query(
      `INSERT INTO chat_sessions (id, user_id, title)
       VALUES ($1, $2, $3)
       RETURNING id, title, is_pinned, created_at, updated_at;`,
      [sessionId, user.uid, title]
    );

    const row = res.rows[0];
    return NextResponse.json({
      session_id: row.id,
      id: row.id,
      title: row.title,
      is_pinned: row.is_pinned,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      message_count: 0,
      messages: [],
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
