import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, hashPassword } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope, dashboardScopeClause } from '@/lib/server/analyticsScope';
import { logAudit } from '@/lib/server/audit';

/**
 * Single student creation (admin). All academic fields required (no defaults).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, name, roll, stream, sem, section, password } = body;
    const required = { email, name, roll, stream, sem, section };
    const missing = Object.entries(required).filter(([, v]) => !String(v ?? '').trim()).map(([k]) => k);
    if (missing.length) {
      return NextResponse.json({ detail: `Missing required field(s): ${missing.join(', ')}` }, { status: 400 });
    }
    // Default password (env-configurable, default 'student123').
    const resolvedPassword =
      (password && String(password).trim()) ||
      process.env.DEFAULT_STUDENT_PASSWORD ||
      'student123';
    if (resolvedPassword.length < 6) {
      return NextResponse.json({ detail: 'A password (min 6 chars) is required.' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await query('SELECT id FROM student_users WHERE email = $1;', [cleanEmail]);
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ detail: 'Email already enrolled' }, { status: 409 });
    }

    const passwordHash = await hashPassword(resolvedPassword);
    await query(
      `INSERT INTO student_users (email, password_hash, display_name, name, roll, stream, sem, section)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [cleanEmail, passwordHash, String(name).trim(), String(name).trim(), String(roll).trim(), String(stream).toLowerCase(), String(sem).trim(), String(section).toLowerCase()]
    );

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'student.create',
      targetType: 'student',
      details: { email: cleanEmail, stream, sem, section },
    });

    return NextResponse.json({ message: 'Student created', email: cleanEmail }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    // Student directory is admin + HOD only. Faculty do not get student PII.
    if (!requireRole(user, ['admin', 'hod'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let stream = searchParams.get('stream');
    const semester = searchParams.get('semester') || searchParams.get('sem');
    const section = searchParams.get('section');

    // Non-admin (HOD) is scoped to their assigned streams (hod_streams +
    // faculty_assignments). No cross-stream leakage.
    let dsc = { sql: '', params: [] as any[], nextIdx: 1 };
    if (user.role !== 'admin') {
      const scope = await resolveScope(user);
      dsc = dashboardScopeClause(
        { stream: 's.stream', semester: 's.sem', section: 's.section' },
        scope,
        1
      );
    }

    let sql = 'SELECT id as uid, email, display_name, name, roll, stream, sem, section, created_at FROM student_users s WHERE 1=1';
    const params: any[] = [...dsc.params];
    let pIdx = dsc.nextIdx;

    if (stream && stream !== 'All') {
      sql += ` AND LOWER(s.stream) = LOWER($${pIdx})`;
      params.push(stream);
      pIdx++;
    }
    if (semester && semester !== 'All') {
      sql += ` AND s.sem = $${pIdx}`;
      params.push(semester);
      pIdx++;
    }
    if (section && section !== 'All') {
      sql += ` AND LOWER(s.section) = LOWER($${pIdx})`;
      params.push(section);
      pIdx++;
    }

    sql += dsc.sql;
    sql += ' ORDER BY s.created_at DESC;';
    const res = await query(sql, params);

    return NextResponse.json({
      students: res.rows.map((s) => ({
        uid: s.uid,
        email: s.email,
        name: s.name || s.display_name,
        display_name: s.display_name,
        roll: s.roll || 'N/A',
        stream: s.stream || '',
        sem: s.sem || '',
        section: s.section || '',
        created_at: s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString(),
      })),
      total: res.rowCount,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
