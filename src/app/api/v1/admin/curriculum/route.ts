import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query, initDbSchema } from '@/lib/server/db';
import { logAudit } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  try {
    await initDbSchema();
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'superuser'])) {
      return NextResponse.json({ detail: 'Admin permission required' }, { status: 403 });
    }

    const body = await req.json();
    const { stream, semester, subjects } = body;

    if (!stream || !semester || !Array.isArray(subjects)) {
      return NextResponse.json({ detail: 'Stream, semester, and subjects array are required' }, { status: 400 });
    }

    await query(
      `INSERT INTO curriculum (stream, semester, subjects, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (stream, semester)
       DO UPDATE SET subjects = EXCLUDED.subjects, updated_at = NOW(), updated_by = EXCLUDED.updated_by;`,
      [stream.toLowerCase(), semester.toString(), JSON.stringify(subjects), user.uid]
    );

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'curriculum.update',
      targetType: 'curriculum',
      details: { stream, semester, subjects_count: subjects.length },
    });

    return NextResponse.json({
      message: `Curriculum updated for ${stream} sem ${semester}`,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
