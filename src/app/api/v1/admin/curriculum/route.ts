import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { logAudit } from '@/lib/server/audit';
import { invalidateFilterCache } from '@/app/api/v1/filters/route';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permission required' }, { status: 403 });
    }

    const body = await req.json();
    const { stream, semester, subjects, sections } = body;
    if (!stream || !semester || !Array.isArray(subjects)) {
      return NextResponse.json({ detail: 'Stream, semester, and subjects array are required' }, { status: 400 });
    }
    const cleanStream = stream.toLowerCase();
    const cleanSem = semester.toString();
    const sectionsArr = Array.isArray(sections) ? sections : [];

    // Fetch existing subjects to diff (prune removed ones' materials).
    const prevRes = await query('SELECT subjects FROM curriculum WHERE stream = $1 AND semester = $2;', [cleanStream, cleanSem]);
    const prevSubjects: string[] = prevRes.rowCount ? prevRes.rows[0].subjects || [] : [];
    const newSubjectsLower = subjects.map((s: any) => (typeof s === 'string' ? s : s.name || s.title || '').toString());
    const removed = prevSubjects
      .map((s: any) => (typeof s === 'string' ? s : s.name || s.title || '').toString())
      .filter((s: string) => !newSubjectsLower.map((x: string) => x.toLowerCase()).includes(s.toLowerCase()));

    // Upsert curriculum (subjects + sections).
    await query(
      `INSERT INTO curriculum (stream, semester, subjects, sections, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (stream, semester)
       DO UPDATE SET subjects = EXCLUDED.subjects, sections = EXCLUDED.sections, updated_at = NOW(), updated_by = EXCLUDED.updated_by;`,
      [cleanStream, cleanSem, JSON.stringify(subjects), JSON.stringify(sectionsArr), user.uid]
    );

    // Prune: delete documents + chunks tied to removed subjects in this stream/sem.
    // Cascades to document_chunks (FK ON DELETE CASCADE) and query_citations.
    let prunedCount = 0;
    if (removed.length > 0) {
      const delRes = await query(
        `DELETE FROM documents
         WHERE stream = $1 AND semester = $2
           AND LOWER(subject) = ANY($3::text[])
         RETURNING id;`,
        [cleanStream, cleanSem, removed.map((s) => s.toLowerCase())]
      );
      prunedCount = delRes.rowCount || 0;
    }

    invalidateFilterCache();

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'curriculum.update',
      targetType: 'curriculum',
      details: { stream: cleanStream, semester: cleanSem, subjects_count: subjects.length, sections_count: sectionsArr.length, pruned_documents: prunedCount, removed_subjects: removed },
    });

    return NextResponse.json({
      message: `Curriculum updated for ${cleanStream} sem ${cleanSem}`,
      pruned_documents: prunedCount,
      removed_subjects: removed,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

/**
 * DELETE — remove a curriculum row entirely (stream+semester) and prune all
 * materials tied to that stream/semester so the system never crashes on
 * dangling references.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin'])) {
      return NextResponse.json({ detail: 'Admin permission required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream');
    const semester = searchParams.get('semester');
    if (!stream || !semester) {
      return NextResponse.json({ detail: 'stream and semester query params required' }, { status: 400 });
    }
    const cleanStream = stream.toLowerCase();
    const cleanSem = semester.toString();

    const delRes = await query(
      `DELETE FROM documents WHERE stream = $1 AND semester = $2 RETURNING id;`,
      [cleanStream, cleanSem]
    );
    const prunedCount = delRes.rowCount || 0;

    await query('DELETE FROM curriculum WHERE stream = $1 AND semester = $2;', [cleanStream, cleanSem]);

    invalidateFilterCache();

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'curriculum.delete',
      targetType: 'curriculum',
      details: { stream: cleanStream, semester: cleanSem, pruned_documents: prunedCount },
    });

    return NextResponse.json({ message: `Curriculum + ${prunedCount} documents removed for ${cleanStream} sem ${cleanSem}`, pruned_documents: prunedCount });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
