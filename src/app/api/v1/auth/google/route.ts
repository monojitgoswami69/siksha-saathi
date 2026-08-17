import { NextRequest, NextResponse } from 'next/server';
import { query, initDbSchema } from '@/lib/server/db';
import { verifyGoogleIdToken, createAccessToken } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    await initDbSchema();
    const body = await req.json();
    const { idToken, accessToken } = body;

    if (!idToken && !accessToken) {
      return NextResponse.json(
        { detail: 'Google authentication credential (idToken or accessToken) is required' },
        { status: 400 }
      );
    }

    let googleId = '';
    let email = '';
    let name = '';
    let picture: string | null = null;

    if (accessToken) {
      // 1. Verify via Google OAuth2 UserInfo API
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userinfoRes.ok) {
        return NextResponse.json({ detail: 'Invalid Google access token' }, { status: 401 });
      }

      const userInfo = await userinfoRes.json();
      if (!userInfo.email) {
        return NextResponse.json({ detail: 'Google account missing email address' }, { status: 400 });
      }

      googleId = userInfo.sub;
      email = userInfo.email;
      name = userInfo.name || email.split('@')[0];
      picture = userInfo.picture || null;
    } else if (idToken) {
      // 2. Verify via Google ID Token (GSI JWT)
      const verified = await verifyGoogleIdToken(idToken);
      if (!verified) {
        return NextResponse.json({ detail: 'Invalid Google authentication token' }, { status: 401 });
      }

      googleId = verified.googleId;
      email = verified.email;
      name = verified.name;
      picture = verified.picture || null;
    }

    const cleanEmail = email.toLowerCase();

    // Check if student exists
    let studentRes = await query(
      'SELECT * FROM student_users WHERE email = $1 OR google_id = $2;',
      [cleanEmail, googleId]
    );

    let student;
    if (studentRes.rowCount === 0) {
      // Create new student user
      const insertRes = await query(
        `INSERT INTO student_users (email, google_id, display_name, name, avatar_url, stream, sem, batch)
         VALUES ($1, $2, $3, $4, $5, 'cse', '1', '2024-2028')
         RETURNING *;`,
        [cleanEmail, googleId, name, name, picture]
      );
      student = insertRes.rows[0];
    } else {
      student = studentRes.rows[0];
      // Update google_id and avatar if missing
      if (!student.google_id || !student.avatar_url) {
        await query(
          'UPDATE student_users SET google_id = COALESCE(google_id, $1), avatar_url = COALESCE(avatar_url, $2) WHERE id = $3;',
          [googleId, picture, student.id]
        );
      }
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
      name: student.display_name || student.name,
      displayName: student.display_name,
      avatar_url: student.avatar_url,
      stream: student.stream,
      sem: student.sem,
      roll: student.roll_number,
      role: 'student',
      access_token: token,
      token_type: 'bearer',
    });
  } catch (err: any) {
    console.error('Google login route error:', err);
    return NextResponse.json({ detail: err.message || 'Google login failed' }, { status: 500 });
  }
}
