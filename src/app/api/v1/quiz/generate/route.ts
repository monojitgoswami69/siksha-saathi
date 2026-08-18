import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { generateQuizStructured } from '@/lib/server/llm';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      subject = 'General',
      num_questions = 5,
      document_id,
      module,
      stream: reqStream,
      semester: reqSem,
    } = body;

    // Auto-lookup student profile for stream/semester/section scoping
    let studentStream = reqStream;
    let studentSem = reqSem;
    let studentSection = body.section;
    try {
      const profileRes = await query(
        'SELECT stream, sem, section FROM student_users WHERE id = $1;',
        [user.uid]
      );
      if (profileRes.rowCount && profileRes.rowCount > 0) {
        const profile = profileRes.rows[0] as any;
        studentStream = studentStream || profile.stream;
        studentSem = studentSem || profile.sem;
        studentSection = studentSection || profile.section;
      }
    } catch {}

    // Collect chunks from database — scoped by student's enrollment
    let sql = `SELECT raw_content, title, file_name, subject FROM document_chunks WHERE 1=1`;
    const params: any[] = [];
    let pIdx = 1;

    const targetDocId = module || document_id;
    if (targetDocId) {
      sql += ` AND document_id = $${pIdx}`;
      params.push(targetDocId);
      pIdx++;
    } else {
      // Subject filter
      if (subject && subject !== 'All Subjects') {
        sql += ` AND (LOWER(subject) = LOWER($${pIdx}) OR subject = 'General' OR subject IS NULL)`;
        params.push(subject);
        pIdx++;
      }

      // Mandatory stream/semester/section segregation
      if (studentStream && studentStream !== 'All') {
        sql += ` AND (stream = $${pIdx} OR stream = 'General' OR stream IS NULL)`;
        params.push(studentStream);
        pIdx++;
      }
      if (studentSem && studentSem !== 'All') {
        sql += ` AND (semester = $${pIdx} OR semester = 'General' OR semester IS NULL)`;
        params.push(studentSem);
        pIdx++;
      }
      if (studentSection && studentSection !== 'All') {
        sql += ` AND (section = $${pIdx} OR section = 'General' OR section IS NULL)`;
        params.push(studentSection);
        pIdx++;
      }
    }

    sql += ` ORDER BY chunk_index ASC LIMIT 25;`;
    const res = await query(sql, params);

    let contextText = '';
    if (res.rowCount && res.rowCount > 0) {
      contextText = res.rows
        .map((r, i) => `--- Section ${i + 1} (${r.title || r.file_name}) ---\n${r.raw_content}`)
        .join('\n\n');
    } else {
      contextText = `Course syllabus and overview for ${subject}. Key concepts, architectures, definitions, and operational principles.`;
    }

    const quiz = await generateQuizStructured({
      subject,
      contextText,
      numQuestions: Math.min(Math.max(num_questions, 3), 20),
    });

    return NextResponse.json(quiz);
  } catch (err: any) {
    console.error('Quiz generation error:', err);
    return NextResponse.json({ detail: err.message || 'Failed to generate quiz' }, { status: 500 });
  }
}
