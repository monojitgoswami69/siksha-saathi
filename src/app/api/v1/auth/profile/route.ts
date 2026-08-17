import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, verifyPassword, hashPassword } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { logAudit } from '@/lib/server/audit';

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, displayName, stream, sem, roll, batch, currentPassword, newPassword } = body;

    // 1. Handle Password Update if requested
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ detail: 'Current password is required to set a new password' }, { status: 400 });
      }

      const table = user.scope === 'student' ? 'student_users' : 'dashboard_users';
      const userRes = await query(`SELECT password_hash FROM ${table} WHERE id = $1;`, [user.uid]);

      if (userRes.rowCount === 0) {
        return NextResponse.json({ detail: 'User not found' }, { status: 404 });
      }

      const currentHash = userRes.rows[0].password_hash;
      if (currentHash) {
        const isValid = await verifyPassword(currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ detail: 'Incorrect current password' }, { status: 400 });
        }
      }

      const newHash = await hashPassword(newPassword);
      await query(`UPDATE ${table} SET password_hash = $1, updated_at = NOW() WHERE id = $2;`, [newHash, user.uid]);

      await logAudit({
        userId: user.uid,
        userEmail: user.email,
        role: user.role,
        action: 'user.password_change',
        targetType: 'user',
        details: { scope: user.scope },
      });
    }

    // 2. Handle Profile Metadata Update
    if (user.scope === 'student') {
      await query(
        `UPDATE student_users
         SET display_name = COALESCE($1, display_name),
             name = COALESCE($2, name),
             stream = COALESCE($3, stream),
             sem = COALESCE($4, sem),
             roll = COALESCE($5, roll),
             batch = COALESCE($6, batch),
             updated_at = NOW()
         WHERE id = $7;`,
        [displayName || name || null, name || null, stream || null, sem || null, roll || null, batch || null, user.uid]
      );
    } else {
      await query(
        `UPDATE dashboard_users
         SET display_name = COALESCE($1, display_name),
             stream = COALESCE($2, stream),
             updated_at = NOW()
         WHERE id = $3;`,
        [displayName || name || null, stream || null, user.uid]
      );
    }

    return NextResponse.json({ message: 'Profile updated successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
