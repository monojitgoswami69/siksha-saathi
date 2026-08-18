import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, hashPassword } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { logAudit } from '@/lib/server/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const { uid } = await params;
    const body = await req.json();
    const newPassword = body?.password ? String(body.password) : '';

    if (newPassword.length < 6) {
      return NextResponse.json(
        { detail: 'New password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const target = await query('SELECT email FROM dashboard_users WHERE id = $1;', [uid]);
    if (target.rowCount === 0) {
      return NextResponse.json({ detail: 'User not found.' }, { status: 404 });
    }

    const passwordHash = await hashPassword(newPassword);
    await query(
      'UPDATE dashboard_users SET password_hash = $1, updated_at = NOW() WHERE id = $2;',
      [passwordHash, uid]
    );

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'faculty.password_reset',
      targetType: 'dashboard_user',
      details: { uid, email: target.rows[0].email },
    });

    return NextResponse.json({ message: 'Password reset successfully.', uid });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
