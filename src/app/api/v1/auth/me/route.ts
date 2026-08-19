import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, STUDENT_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    if (user.scope === 'dashboard') {
      const dbRes = await query(
        'SELECT id, email, role, display_name, stream, organization_name, department FROM dashboard_users WHERE id = $1;',
        [user.uid]
      );
      if (dbRes.rowCount === 0) {
        // Stale cookie: user was deleted or reseeded in DB. Clear cookie and return unauthenticated.
        const res = NextResponse.json({ authenticated: false, user: null }, { status: 200 });
        res.cookies.delete(ADMIN_COOKIE_NAME);
        return res;
      }
      const row = dbRes.rows[0];
      // Resolve allowed streams (hod_streams ∪ faculty_assignment streams)
      const { getAllowedStreams } = await import('@/lib/server/analyticsScope');
      const allowedStreams = await getAllowedStreams(user);
      return NextResponse.json({
        uid: row.id,
        email: row.email,
        role: row.role,
        display_name: row.display_name,
        stream: row.stream,
        allowed_streams: allowedStreams,
        organization_name: row.organization_name,
        department: row.department,
        scope: 'dashboard',
        authenticated: true,
      });
    } else {
      const dbRes = await query(
        'SELECT id, email, display_name, name, roll, stream, sem, section, avatar_url FROM student_users WHERE id = $1;',
        [user.uid]
      );
      if (dbRes.rowCount === 0) {
        // Stale cookie: student was deleted or reseeded in DB. Clear cookie and return unauthenticated.
        const res = NextResponse.json({ authenticated: false, user: null }, { status: 200 });
        res.cookies.delete(STUDENT_COOKIE_NAME);
        return res;
      }
      const row = dbRes.rows[0];
      return NextResponse.json({
        uid: row.id,
        email: row.email,
        role: 'student',
        display_name: row.display_name,
        name: row.name,
        roll: row.roll,
        stream: row.stream,
        sem: row.sem,
        section: row.section,
        avatar_url: row.avatar_url,
        scope: 'student',
        authenticated: true,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ authenticated: false, error: err.message }, { status: 200 });
  }
}
