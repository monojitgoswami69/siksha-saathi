import { NextRequest, NextResponse } from 'next/server';
import { query, initDbSchema } from '@/lib/server/db';
import { verifyPassword, createAccessToken } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    await initDbSchema();
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 });
    }

    const res = await query(
      'SELECT id, email, password_hash, display_name, name, roll, stream, sem, batch, avatar_url FROM student_users WHERE email = $1;',
      [email.trim().toLowerCase()]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }

    const student = res.rows[0];
    if (!student.password_hash) {
      return NextResponse.json(
        { detail: 'This account was created with Google. Please use Continue with Google.' },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(password, student.password_hash);
    if (!isValid) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }

    const token = await createAccessToken({
      uid: student.id,
      email: student.email,
      role: 'student',
      scope: 'student',
      displayName: student.display_name,
    });

    return NextResponse.json({
      uid: student.id,
      email: student.email,
      role: 'student',
      display_name: student.display_name,
      token,
      profile: {
        name: student.name,
        roll: student.roll,
        stream: student.stream,
        sem: student.sem,
        batch: student.batch,
        avatar_url: student.avatar_url,
      },
    });
  } catch (err: any) {
    console.error('Student login error:', err);
    return NextResponse.json({ detail: err.message || 'Authentication error' }, { status: 500 });
  }
}
