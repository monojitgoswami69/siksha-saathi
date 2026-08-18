/**
 * Authentication Service (JWT, Password Hashing, Google OAuth 2.0 & Secure Cookies)
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { NextRequest } from 'next/server';
import { query } from './db';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!');
}
const secretKey = new TextEncoder().encode(JWT_SECRET || 'siksha-saathi-dev-secret-key-change-in-production');
const googleClient = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

export const STUDENT_COOKIE_NAME = 'siksha_student_session';
export const ADMIN_COOKIE_NAME = 'siksha_admin_session';

/**
 * Returns standard secure cookie options
 */
export function getCookieOptions(maxAgeSeconds = 7 * 24 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export interface TokenPayload {
  uid: string;
  email: string;
  role: string;
  scope: 'student' | 'dashboard';
  displayName?: string;
  [key: string]: any;
}

/**
 * Hash plain text password using bcryptjs
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(plainText, salt);
}

/**
 * Verify password against hashed string
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

/**
 * Create a signed JWT access token
 */
export async function createAccessToken(payload: TokenPayload, expiresIn = '7d'): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

/**
 * Decode and verify JWT token
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as TokenPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Verify Google ID token from GCP Google Sign-In
 */
export async function verifyGoogleIdToken(idToken: string): Promise<{
  googleId: string;
  email: string;
  name: string;
  picture?: string;
} | null> {
  try {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId || undefined,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return null;

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
    };
  } catch (err) {
    console.error('Google ID token verification failed:', err);
    return null;
  }
}

/**
 * Extract and verify current user from Request Cookies (preferred) or Authorization Header (fallback)
 */
export async function getAuthUser(req: NextRequest): Promise<TokenPayload | null> {
  const path = req.nextUrl?.pathname || '';
  const isAdminRoute = path.includes('/admin') || path.includes('/dashboard');

  // 1. Check cookies first based on context
  if (isAdminRoute) {
    const adminToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (adminToken) {
      const user = await verifyAccessToken(adminToken);
      if (user) return user;
    }
  }

  const studentToken = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (studentToken) {
    const user = await verifyAccessToken(studentToken);
    if (user) return user;
  }

  // Also check admin token if not on admin route
  const adminToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (adminToken) {
    const user = await verifyAccessToken(adminToken);
    if (user) return user;
  }

  // 2. Fallback to Authorization Bearer header
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return verifyAccessToken(token);
  }

  return null;
}

/**
 * Enforce role-based access control
 */
export function requireRole(user: TokenPayload | null, allowedRoles: string[]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role) || user.role === 'admin';
}

// NOTE: dashboard scope resolution (multi-stream HOD + faculty assignments)
// lives in `analyticsScope.ts` — `resolveScope` / `dashboardScopeClause` /
// `getAllowedStreams`. The legacy single-stream helpers were removed in favor
// of the multi-assignment model.

