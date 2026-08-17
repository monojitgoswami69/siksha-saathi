/**
 * Authentication Service (JWT, Password Hashing & Google OAuth 2.0)
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { NextRequest } from 'next/server';
import { query } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'siksha-saathi-super-secret-jwt-key';
const secretKey = new TextEncoder().encode(JWT_SECRET);
const googleClient = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

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
  const salt = await bcrypt.genSalt(10);
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
 * Extract and verify current user from Request Authorization header
 */
export async function getAuthUser(req: NextRequest): Promise<TokenPayload | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  return verifyAccessToken(token);
}

/**
 * Enforce role-based access control
 */
export function requireRole(user: TokenPayload | null, allowedRoles: string[]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role) || user.role === 'superuser' || user.role === 'admin';
}
