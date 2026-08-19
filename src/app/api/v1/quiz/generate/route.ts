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
      file_name,
      module,
      stream: reqStream,
      semester: reqSem,
      section: reqSection,
    } = body;

    // Auto-lookup student profile for stream/semester/section scoping
    let studentStream = reqStream;
    let studentSem = reqSem;
    let studentSection = reqSection;
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

    // Collect chunks — scoped by the student's enrollment. document_id is
    // AND-ed with scope (never bypasses it), same as the chat/search routes.
    let sql = `SELECT raw_content, title, file_name, subject FROM document_chunks WHERE 1=1`;
    const params: any[] = [];
    let pIdx = 1;

    // Mandatory stream/semester/section segregation (always applied)
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

    // Subject filter (per-dimension General wildcard)
    if (subject && subject !== 'All Subjects') {
      sql += ` AND (LOWER(subject) = LOWER($${pIdx}) OR subject = 'General' OR subject IS NULL)`;
      params.push(subject);
      pIdx++;
    }

    // File filter (exact, case-insensitive)
    if (file_name) {
      sql += ` AND LOWER(file_name) = LOWER($${pIdx})`;
      params.push(file_name);
      pIdx++;
    }

    // `module` is a unit-name TEXT column, NOT a document_id. Filter as text.
    if (module && module !== 'All') {
      sql += ` AND (LOWER(module) = LOWER($${pIdx}) OR module = 'General' OR module IS NULL)`;
      params.push(module);
      pIdx++;
    }

    // Specific document (still scope-checked — no bypass)
    if (document_id) {
      sql += ` AND document_id = $${pIdx}`;
      params.push(document_id);
      pIdx++;
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

    const quizQuestions = await generateQuizStructured({
      subject,
      contextText,
      numQuestions: Math.min(Math.max(num_questions, 3), 20),
    });

    const questionsList = Array.isArray(quizQuestions)
      ? quizQuestions
      : (quizQuestions as any)?.questions || [];

    const quizResponse = {
      quiz_id: `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      subject: subject || 'General',
      num_questions: questionsList.length,
      questions: questionsList,
    };

    return NextResponse.json(quizResponse);
  } catch (err: any) {
    console.error('Quiz generation error:', err);
    return NextResponse.json({ detail: err.message || 'Failed to generate quiz' }, { status: 500 });
  }
}
