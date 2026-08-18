import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';
import {
  verifyGoogleIdToken,
  createAccessToken,
  STUDENT_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  getCookieOptions,
} from '@/lib/server/auth';
import { logAudit } from '@/lib/server/audit';

/**
 * Google OAuth login for BOTH students and dashboard users.
 * Body: { idToken?, accessToken?, scope?: 'student' | 'dashboard' }
 *
 * No auto-provisioning: the email MUST already exist in the relevant table
 * (admin-enrolled). On first Google login we link google_id + avatar.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, accessToken, scope } = body;

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
    const isDashboard = scope === 'dashboard';

    if (isDashboard) {
      // ---- Dashboard user (admin / hod / faculty) ----
      let res = await query(
        'SELECT * FROM dashboard_users WHERE email = $1 OR google_id = $2;',
        [cleanEmail, googleId]
      );
      if (res.rowCount === 0) {
        return NextResponse.json(
          { detail: 'Your email is not enrolled as a faculty/admin. Please contact your administrator.' },
          { status: 403 }
        );
      }
      const du = res.rows[0] as any;
      if (!du.google_id || !du.avatar_url) {
        await query(
          'UPDATE dashboard_users SET google_id = COALESCE(google_id, $1), avatar_url = COALESCE(avatar_url, $2) WHERE id = $3;',
          [googleId, picture, du.id]
        );
      }

      const token = await createAccessToken({
        uid: du.id,
        email: du.email,
        role: du.role,
        scope: 'dashboard',
        displayName: du.display_name,
      });

      await logAudit({
        userId: du.id,
        userEmail: du.email,
        role: du.role,
        action: 'auth.google.login',
        targetType: 'dashboard_user',
        details: { scope: 'dashboard' },
      });

      const response = NextResponse.json({
        uid: du.id,
        email: du.email,
        role: du.role,
        display_name: du.display_name,
        avatar_url: du.avatar_url || picture,
        scope: 'dashboard',
        access_token: token,
        token,
        token_type: 'bearer',
      });
      response.cookies.set(ADMIN_COOKIE_NAME, token, getCookieOptions());
      return response;
    }

    // ---- Student ----
    let studentRes = await query(
      'SELECT * FROM student_users WHERE email = $1 OR google_id = $2;',
      [cleanEmail, googleId]
    );
    if (studentRes.rowCount === 0) {
      return NextResponse.json(
        { detail: 'Your email is not enrolled. Please contact your administrator to get access.' },
        { status: 403 }
      );
    }
    const student = studentRes.rows[0];
    if (!student.google_id || !student.avatar_url) {
      await query(
        'UPDATE student_users SET google_id = COALESCE(google_id, $1), avatar_url = COALESCE(avatar_url, $2) WHERE id = $3;',
        [googleId, picture, student.id]
      );
    }

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
      name: student.display_name || student.name,
      displayName: student.display_name,
      avatar_url: student.avatar_url,
      stream: student.stream,
      sem: student.sem,
      section: student.section,
      roll: student.roll || student.roll_number || '',
      role: 'student',
      access_token: token,
      token,
      token_type: 'bearer',
    });
    response.cookies.set(STUDENT_COOKIE_NAME, token, getCookieOptions());
    return response;
  } catch (err: any) {
    console.error('Google login route error:', err);
    return NextResponse.json({ detail: err.message || 'Google login failed' }, { status: 500 });
  }
}
