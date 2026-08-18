import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { logAudit } from '@/lib/server/audit';

const ALLOWED_ROLES = ['admin', 'hod', 'faculty'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const { uid } = await params;
    const body = await req.json();
    const { displayName, role, stream, department, organizationName } = body;

    if (role && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { detail: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}.` },
        { status: 400 }
      );
    }

    // Prevent demoting the last admin to a non-admin role
    if (role && role !== 'admin') {
      const target = await query('SELECT role FROM dashboard_users WHERE id = $1;', [uid]);
      if (target.rowCount === 0) {
        return NextResponse.json({ detail: 'User not found.' }, { status: 404 });
      }
      if (target.rows[0].role === 'admin') {
        const adminCount = await query(
          "SELECT COUNT(*)::int as count FROM dashboard_users WHERE role = 'admin';"
        );
        if (adminCount.rows[0].count <= 1) {
          return NextResponse.json(
            { detail: 'Cannot demote the last remaining admin.' },
            { status: 400 }
          );
        }
      }
    }

    const res = await query(
      `UPDATE dashboard_users
       SET display_name = COALESCE($1, display_name),
           role = COALESCE($2, role),
           stream = COALESCE($3, stream),
           department = COALESCE($4, department),
           organization_name = COALESCE($5, organization_name),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, role, display_name, stream, department, organization_name;`,
      [
        displayName || null,
        role || null,
        stream || null,
        department || null,
        organizationName || null,
        uid,
      ]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'User not found.' }, { status: 404 });
    }

    const updated = res.rows[0];
    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'faculty.update',
      targetType: 'dashboard_user',
      details: { uid, email: updated.email, role: updated.role },
    });

    return NextResponse.json({
      uid: updated.id,
      email: updated.email,
      role: updated.role,
      display_name: updated.display_name,
      stream: updated.stream,
      department: updated.department,
      organization_name: updated.organization_name,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const { uid } = await params;

    if (uid === user.uid) {
      return NextResponse.json({ detail: 'You cannot delete your own account.' }, { status: 400 });
    }

    const target = await query('SELECT id, email, role FROM dashboard_users WHERE id = $1;', [uid]);
    if (target.rowCount === 0) {
      return NextResponse.json({ detail: 'User not found.' }, { status: 404 });
    }

    if (target.rows[0].role === 'admin') {
      const adminCount = await query(
        "SELECT COUNT(*)::int as count FROM dashboard_users WHERE role = 'admin';"
      );
      if (adminCount.rows[0].count <= 1) {
        return NextResponse.json(
          { detail: 'Cannot delete the last remaining admin.' },
          { status: 400 }
        );
      }
    }

    await query('DELETE FROM dashboard_users WHERE id = $1;', [uid]);

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'faculty.delete',
      targetType: 'dashboard_user',
      details: { uid, email: target.rows[0].email, role: target.rows[0].role },
    });

    return NextResponse.json({ message: 'Faculty account deleted.', uid });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
