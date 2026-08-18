import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'siksha-saathi-dev-secret-key-change-in-production';
const secretKey = new TextEncoder().encode(JWT_SECRET);

const STUDENT_COOKIE_NAME = 'siksha_student_session';
const ADMIN_COOKIE_NAME = 'siksha_admin_session';

async function verifyToken(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Admin Portal Protection
  if (pathname.startsWith('/admin')) {
    const isAdminLogin = pathname === '/admin/login';
    const adminToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const adminUser = await verifyToken(adminToken);

    if (isAdminLogin) {
      // If already logged in as admin/faculty, redirect to dashboard
      if (adminUser) {
        return NextResponse.redirect(new URL('/admin/dashboard', req.url));
      }
      return NextResponse.next();
    }

    // Protected admin pages: require valid admin session
    if (!adminUser) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // 2. Student Portal Protection
  const isStudentProtectedRoute =
    pathname.startsWith('/chat') ||
    pathname.startsWith('/resources') ||
    pathname.startsWith('/exam');

  const studentToken = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  const studentUser = await verifyToken(studentToken);

  if (pathname === '/login' || pathname === '/') {
    // If student is logged in, redirect root or login to /chat
    if (studentUser) {
      return NextResponse.redirect(new URL('/chat', req.url));
    }
    return NextResponse.next();
  }

  if (isStudentProtectedRoute) {
    if (!studentUser) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/admin/:path*',
    '/chat/:path*',
    '/resources/:path*',
    '/exam/:path*',
  ],
};
