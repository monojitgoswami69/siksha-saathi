import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, hashPassword } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { parse } from 'csv-parse/sync';
import { logAudit } from '@/lib/server/audit';

/**
 * Admin Student Enrollment (CSV/TSV).
 *
 * No academic defaults: every required field MUST be present in each row.
 * Required columns: email, name, roll, stream, sem, section.
 * Password: optional per-row `password` column, otherwise the batch-level
 *           `initial_password` (admin-chosen, required) is applied to all rows.
 * Rows missing any required field are rejected with a validation error.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permissions required' }, { status: 403 });
    }

    const body = await req.json();
    const { csv_data, initial_password } = body;

    if (!csv_data || !csv_data.trim()) {
      return NextResponse.json({ detail: 'CSV data is required' }, { status: 400 });
    }

    if (!initial_password || String(initial_password).trim().length < 6) {
      return NextResponse.json(
        { detail: 'An initial password (min 6 chars) is required for the enrolled students.' },
        { status: 400 }
      );
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

    const requiredFields = ['email', 'name', 'roll', 'stream', 'sem', 'section'] as const;
    const batchPasswordHash = await hashPassword(String(initial_password).trim());

    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowRef = row.email || `row ${i + 2}`;

      const fields: Record<string, string> = {};
      for (const f of requiredFields) {
        fields[f] = String(row[f] ?? row[capitalize(f)] ?? '').trim();
        if (!fields[f]) {
          // Allow stream/sem/section fallback to alternate header spellings
          fields[f] = String(row[f.toLowerCase()] ?? '').trim();
        }
      }

      // Validate every required field is present
      const missing = requiredFields.filter((f) => !fields[f]);
      if (missing.length > 0) {
        errors.push(`${rowRef}: missing required field(s): ${missing.join(', ')}`);
        skipped++;
        continue;
      }

      const email = fields.email.toLowerCase();
      const name = fields.name;
      const roll = fields.roll;
      const studentStream = fields.stream.toLowerCase();
      const studentSem = fields.sem;
      const studentSection = fields.section.toLowerCase();

      // Per-row password override, else batch initial password
      const rowPassword = String(row.password ?? row.Password ?? '').trim();
      let passwordHash = batchPasswordHash;
      if (rowPassword) {
        if (rowPassword.length < 6) {
          errors.push(`${email}: password must be at least 6 characters`);
          skipped++;
          continue;
        }
        passwordHash = await hashPassword(rowPassword);
      }

      try {
        const existing = await query('SELECT id FROM student_users WHERE email = $1;', [email]);
        if (existing.rowCount && existing.rowCount > 0) {
          errors.push(`${email}: already enrolled (skipped)`);
          skipped++;
          continue;
        }

        await query(
          `INSERT INTO student_users (email, password_hash, display_name, name, roll, stream, sem, section)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [email, passwordHash, name, name, roll, studentStream, studentSem, studentSection]
        );

        enrolled++;
      } catch (err: any) {
        errors.push(`${email}: ${err.message}`);
        skipped++;
      }
    }

    if (enrolled > 0) {
      await logAudit({
        userId: user.uid,
        userEmail: user.email,
        role: user.role,
        action: 'student.enroll',
        targetType: 'student',
        details: { enrolled, skipped, errors: errors.slice(0, 20) },
      });
    }

    return NextResponse.json({
      enrolled,
      skipped,
      errors,
      message: `Enrolled ${enrolled} student(s)${skipped ? `, ${skipped} skipped/rejected` : ''}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
