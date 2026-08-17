import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';
import { verifyPassword, createAccessToken, ADMIN_COOKIE_NAME, getCookieOptions } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 });
    }

    const res = await query(
      'SELECT id, email, password_hash, role, display_name, organization_name, stream, department FROM dashboard_users WHERE email = $1;',
      [email.trim().toLowerCase()]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }

    const user = res.rows[0];
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }

    const token = await createAccessToken({
      uid: user.id,
      email: user.email,
      role: user.role,
      scope: 'dashboard',
      displayName: user.display_name,
      stream: user.stream,
      orgId: user.organization_name,
    });

    const response = NextResponse.json({
      uid: user.id,
      email: user.email,
      role: user.role,
      display_name: user.display_name || user.email.split('@')[0],
      organization_name: user.organization_name,
      stream: user.stream,
      token,
    });

    response.cookies.set(ADMIN_COOKIE_NAME, token, getCookieOptions());
    return response;
  } catch (err: any) {
    console.error('Admin login error:', err);
    return NextResponse.json({ detail: err.message || 'Login error' }, { status: 500 });
  }
}
