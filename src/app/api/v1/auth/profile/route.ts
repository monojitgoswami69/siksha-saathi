import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, displayName, stream, sem, roll, batch } = body;

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
