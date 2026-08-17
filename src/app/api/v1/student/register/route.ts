import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';
import { hashPassword, createAccessToken, STUDENT_COOKIE_NAME, getCookieOptions } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, displayName, stream, sem, roll, batch } = body;

    if (!email || !password) {
      return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await query('SELECT id FROM student_users WHERE email = $1;', [cleanEmail]);

    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ detail: 'Email is already registered' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const finalDisplayName = displayName || name || cleanEmail.split('@')[0];

    const defaultStream = process.env.DEFAULT_STUDENT_STREAM || 'cse';
    const defaultSem = process.env.DEFAULT_STUDENT_SEM || '1';
    const defaultBatch = process.env.DEFAULT_STUDENT_BATCH || '2024-2028';

    const insertRes = await query(
      `INSERT INTO student_users (email, password_hash, display_name, name, stream, sem, roll, batch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, display_name, role, stream, sem, roll;`,
      [
        cleanEmail,
        hashedPassword,
        finalDisplayName,
        name || finalDisplayName,
        stream || defaultStream,
        sem || defaultSem,
        roll || '',
        batch || defaultBatch,
      ]
    );

    const student = insertRes.rows[0];

    const token = await createAccessToken({
      uid: student.id,
      email: student.email,
      role: 'student',
      scope: 'student',
      displayName: student.display_name,
    });

    const response = NextResponse.json({
      uid: student.id,
      email: student.email,
      role: 'student',
      display_name: student.display_name,
      token,
      profile: {
        stream: student.stream,
        sem: student.sem,
        roll: student.roll,
      },
    });

    response.cookies.set(STUDENT_COOKIE_NAME, token, getCookieOptions());
    return response;
  } catch (err: any) {
    console.error('Student registration error:', err);
    return NextResponse.json({ detail: err.message || 'Registration error' }, { status: 500 });
  }
}
