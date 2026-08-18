import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, hashPassword } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { logAudit } from '@/lib/server/audit';

const ALLOWED_ROLES = ['admin', 'hod', 'faculty'];

async function syncAssignments(
  userId: string,
  role: string,
  hodStreams: string[] | undefined,
  assignments: Array<{ stream: string; semester: string; section: string; subject: string }> | undefined
) {
  // HOD stream grants (only meaningful for hod role, but stored regardless so
  // an admin can pre-grant HOD streams to a user who later becomes HOD).
  if (Array.isArray(hodStreams)) {
    await query('DELETE FROM hod_streams WHERE user_id = $1;', [userId]);
    for (const s of hodStreams) {
      if (s && s.trim()) {
        await query(
          'INSERT INTO hod_streams (user_id, stream) VALUES ($1, $2) ON CONFLICT (user_id, stream) DO NOTHING;',
          [userId, s.trim().toLowerCase()]
        );
      }
    }
  }

  // Faculty teaching assignments (meaningful for faculty & hod roles).
  if (Array.isArray(assignments)) {
    await query('DELETE FROM faculty_assignments WHERE user_id = $1;', [userId]);
    for (const a of assignments) {
      if (a && a.stream && a.semester && a.section && a.subject) {
        await query(
          `INSERT INTO faculty_assignments (user_id, stream, semester, section, subject)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, stream, semester, section, subject) DO NOTHING;`,
          [userId, a.stream.toLowerCase(), a.semester, a.section.toLowerCase(), a.subject]
        );
      }
    }
  }
}

async function fetchAssignments(userId: string) {
  const [hodRes, faRes] = await Promise.all([
    query('SELECT stream FROM hod_streams WHERE user_id = $1 ORDER BY stream;', [userId]),
    query(
      'SELECT stream, semester, section, subject FROM faculty_assignments WHERE user_id = $1 ORDER BY stream, semester, section, subject;',
      [userId]
    ),
  ]);
  return {
    hod_streams: hodRes.rows.map((r: any) => r.stream),
    faculty_assignments: faRes.rows,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const res = await query(
      `SELECT id, email, role, display_name, stream, department, organization_name, created_at
       FROM dashboard_users ORDER BY created_at DESC;`
    );

    const users = await Promise.all(
      res.rows.map(async (u: any) => ({
        uid: u.id,
        email: u.email,
        role: u.role,
        display_name: u.display_name,
        stream: u.stream || '',
        department: u.department || '',
        organization_name: u.organization_name || '',
        created_at: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
        ...(await fetchAssignments(u.id)),
      }))
    );

    return NextResponse.json({ users, total: users.length });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, password, displayName, role, department, organizationName, hodStreams, facultyAssignments } = body;

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password || String(password).length < 6) {
      return NextResponse.json(
        { detail: 'Email and a password (min 6 chars) are required.' },
        { status: 400 }
      );
    }
    if (!displayName || !String(displayName).trim()) {
      return NextResponse.json({ detail: 'Display name is required.' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { detail: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}.` },
        { status: 400 }
      );
    }

    const existing = await query('SELECT id FROM dashboard_users WHERE email = $1;', [cleanEmail]);
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ detail: 'Email is already in use.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(String(password));
    const insertRes = await query(
      `INSERT INTO dashboard_users (email, password_hash, role, display_name, department, organization_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, display_name, department, organization_name;`,
      [cleanEmail, passwordHash, role, String(displayName).trim(), department || null, organizationName || null]
    );
    const created = insertRes.rows[0];

    await syncAssignments(created.id, role, hodStreams, facultyAssignments);

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'faculty.create',
      targetType: 'dashboard_user',
      details: { uid: created.id, email: created.email, role: created.role },
    });

    return NextResponse.json(
      { uid: created.id, email: created.email, role: created.role, display_name: created.display_name, ...(await fetchAssignments(created.id)) },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
