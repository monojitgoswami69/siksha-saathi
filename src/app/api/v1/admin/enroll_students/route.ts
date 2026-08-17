import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, hashPassword } from '@/lib/server/auth';
import { query, initDbSchema } from '@/lib/server/db';
import { parse } from 'csv-parse/sync';
import { logAudit } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  try {
    await initDbSchema();
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'superuser'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const body = await req.json();
    const { csv_data, stream, semester } = body;

    if (!csv_data || !csv_data.trim()) {
      return NextResponse.json({ detail: 'CSV data is required' }, { status: 400 });
    }

    let records: any[] = [];
    try {
      records = parse(csv_data, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: csv_data.includes('\t') ? '\t' : ',',
      });
    } catch (e: any) {
      return NextResponse.json({ detail: `Invalid CSV format: ${e.message}` }, { status: 400 });
    }

    const defaultPasswordHash = await hashPassword('student123');
    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of records) {
      const email = (row.email || row.Email || '').trim().toLowerCase();
      const name = (row.name || row.Name || '').trim();
      const roll = (row.roll || row.Roll || row.roll_no || row.RollNo || '').trim();
      const studentStream = (row.stream || row.Stream || stream || 'cse').trim().toLowerCase();
      const studentSem = (row.sem || row.Sem || row.semester || row.Semester || semester || '1').trim();
      const batch = (row.batch || row.Batch || '2024-2028').trim();

      if (!email) {
        skipped++;
        continue;
      }

      try {
        const existing = await query('SELECT id FROM student_users WHERE email = $1;', [email]);
        if (existing.rowCount && existing.rowCount > 0) {
          skipped++;
          continue;
        }

        await query(
          `INSERT INTO student_users (email, password_hash, display_name, name, roll, stream, sem, batch)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [email, defaultPasswordHash, name || email.split('@')[0], name, roll, studentStream, studentSem, batch]
        );

        enrolled++;
      } catch (err: any) {
        errors.push(`${email}: ${err.message}`);
      }
    }

    if (enrolled > 0) {
      await logAudit({
        userId: user.uid,
        userEmail: user.email,
        role: user.role,
        action: 'student.enroll',
        targetType: 'student',
        details: { enrolled, skipped, stream: stream || 'cse' },
      });
    }

    return NextResponse.json({
      enrolled,
      skipped,
      errors,
      message: `Enrolled ${enrolled} students, skipped ${skipped}`,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
