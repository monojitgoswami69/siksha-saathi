import { NextRequest, NextResponse } from 'next/server';
import { STUDENT_COOKIE_NAME, ADMIN_COOKIE_NAME, getCookieOptions } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope');

  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
  const clearOpts = { ...getCookieOptions(0), maxAge: 0 };

  if (scope === 'admin') {
    res.cookies.set(ADMIN_COOKIE_NAME, '', clearOpts);
  } else if (scope === 'student') {
    res.cookies.set(STUDENT_COOKIE_NAME, '', clearOpts);
  } else {
    // Clear both
    res.cookies.set(ADMIN_COOKIE_NAME, '', clearOpts);
    res.cookies.set(STUDENT_COOKIE_NAME, '', clearOpts);
  }

  return res;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
