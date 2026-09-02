import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

const filterCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateFilterCache() {
  filterCache.clear();
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    // Cache key: differentiate student (scoped) vs admin (unscoped)
    const cacheKey = user ? `${user.uid}:${user.role}:${user.scope}` : 'anon';

    const now = Date.now();
    const cached = filterCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return NextResponse.json(cached.data, { headers: { 'X-Cache': 'HIT' } });
    }

    // 1. Fetch base curriculum rows
    const [streamRes, semRes, subjRes, sectionRes, curricRes, curricSectionRes] = await Promise.all([
      query("SELECT DISTINCT stream FROM documents WHERE stream IS NOT NULL AND stream != '';"),
      query("SELECT DISTINCT semester FROM documents WHERE semester IS NOT NULL AND semester != '';"),
      query("SELECT DISTINCT subject FROM documents WHERE subject IS NOT NULL AND subject != '';"),
      query(
        "SELECT DISTINCT section FROM documents WHERE section IS NOT NULL AND section != '' UNION SELECT DISTINCT section FROM student_users WHERE section IS NOT NULL AND section != '';"
      ),
      query('SELECT stream, semester, subjects, sections FROM curriculum ORDER BY stream ASC, semester ASC;'),
      query(`
        SELECT DISTINCT CASE 
          WHEN jsonb_typeof(x) = 'string' THEN x #>> '{}' 
          ELSE COALESCE(x->>'name', x->>'section') 
        END as section 
        FROM curriculum, jsonb_array_elements(sections) x 
        WHERE sections IS NOT NULL AND sections != '[]'::jsonb AND sections != 'null'::jsonb;
      `).catch(() => ({ rows: [] })),
    ]);

    // Build curriculum map strictly from DB (both subjects and sections per stream/semester)
    const curriculumMap: Record<string, Record<string, string[]>> = {};
    const streamSections: Record<string, string[]> = {};
    const curriculumSections: Record<string, Record<string, string[]>> = {};

    curricRes.rows.forEach((row) => {
      const s = row.stream.toLowerCase();
      const sem = row.semester;
      const subs = Array.isArray(row.subjects)
        ? row.subjects.flatMap((sub: any) => {
            if (typeof sub === 'string') return [sub];
            if (sub && typeof sub === 'object') {
              if (sub.name || sub.title) return [sub.name || sub.title];
              return Object.values(sub).flat().filter((x) => typeof x === 'string');
            }
            return [];
          })
        : [];

      const secs = Array.isArray(row.sections)
        ? row.sections.map((sec: any) => {
            if (typeof sec === 'string') return sec;
            if (sec && typeof sec === 'object') return sec.name || sec.section || '';
            return '';
          }).filter(Boolean)
        : [];

      if (!curriculumMap[s]) curriculumMap[s] = {};
      curriculumMap[s][sem] = subs;

      if (!curriculumSections[s]) curriculumSections[s] = {};
      curriculumSections[s][sem] = secs;

      if (!streamSections[s]) streamSections[s] = [];
      secs.forEach((sec: string) => {
        if (!streamSections[s].includes(sec)) streamSections[s].push(sec);
      });
    });

    // Fallback to departments_curriculum.json if DB is empty
    if (Object.keys(curriculumMap).length === 0) {
      try {
        const { getDefaultCurriculumEntries } = await import('@/lib/server/defaultCurriculum');
        const defaultEntries = getDefaultCurriculumEntries();
        for (const e of defaultEntries) {
          const s = e.stream.toLowerCase();
          if (!curriculumMap[s]) curriculumMap[s] = {};
          curriculumMap[s][e.semester] = e.subjects;

          if (!curriculumSections[s]) curriculumSections[s] = {};
          curriculumSections[s][e.semester] = e.sections;

          if (!streamSections[s]) streamSections[s] = [];
          e.sections.forEach((sec) => {
            if (!streamSections[s].includes(sec)) streamSections[s].push(sec);
          });
        }
      } catch (err) {
        console.warn('Could not load default curriculum fallback:', err);
      }
    }

    let responseData: any;

    // STUDENT SCOPING: A student can ONLY see subjects and configuration for their enrolled stream and semester!
    if (user && (user.scope === 'student' || user.role === 'student')) {
      let studentStream = 'cse';
      let studentSem = '1';
      let studentSection = '';

      try {
        const profileRes = await query(
          'SELECT stream, sem, section FROM student_users WHERE id = $1;',
          [user.uid]
        );
        if (profileRes.rowCount && profileRes.rowCount > 0) {
          const p = profileRes.rows[0] as any;
          studentStream = p.stream || 'cse';
          studentSem = String(p.sem || '1');
          studentSection = p.section || '';
        }
      } catch {}

      const sStream = studentStream.toLowerCase();
      const sSem = studentSem;
      const cleanSem = sSem.replace(/^(?:sem|semester)\s*/i, '');

      // Scoped files: ONLY documents for this student's stream, semester, and section
      let filesSql = `SELECT id, file_name, title, subject, module, stream, semester, section FROM documents WHERE status = 'ready'`;
      const filesParams: any[] = [sStream, sSem, cleanSem];
      filesSql += ` AND (LOWER(stream) = LOWER($1) OR stream = 'General' OR stream IS NULL)`;
      filesSql += ` AND (semester = $2 OR semester = $3 OR semester = 'General' OR semester IS NULL)`;
      if (studentSection) {
        filesSql += ` AND (LOWER(section) = LOWER($4) OR section = 'General' OR section IS NULL)`;
        filesParams.push(studentSection);
      }
      filesSql += ` ORDER BY created_at DESC LIMIT 200;`;
      const filesRes = await query(filesSql, filesParams);
      const files = filesRes.rows.map((f) => ({
        document_id: f.id,
        file_name: f.file_name,
        title: f.title,
        subject: f.subject,
        module: f.module,
        stream: f.stream,
        semester: f.semester,
        section: f.section,
      }));

      // Scoped subjects: ONLY from student's curriculum + their available documents
      const streamCurric = curriculumMap[sStream] || {};
      const curricSubjects: string[] =
        streamCurric[sSem] || streamCurric[cleanSem] || streamCurric[`sem ${cleanSem}`] || [];

      const docSubjects = Array.from(new Set(files.map((f) => f.subject).filter(Boolean)));
      const scopedSubjects = Array.from(new Set([...curricSubjects, ...docSubjects])).sort();

      const allowedSecs =
        curriculumSections[sStream]?.[cleanSem] ||
        curriculumSections[sStream]?.[sSem] ||
        streamSections[sStream] ||
        (studentSection ? [studentSection] : []);

      responseData = {
        streams: [sStream.toUpperCase()],
        semesters: [cleanSem],
        sections: allowedSecs.map((s: string) => s.toUpperCase()),
        streamSections: { [sStream]: allowedSecs },
        curriculumSections: { [sStream]: { [cleanSem]: allowedSecs } },
        subjects: scopedSubjects.length > 0 ? scopedSubjects : curricSubjects,
        files,
        curriculum: {
          [sStream]: {
            [cleanSem]: scopedSubjects.length > 0 ? scopedSubjects : curricSubjects,
          },
        },
      };
    } else {
      // Unscoped (Admin / Faculty / Public)
      const streams = Array.from(
        new Set([
          ...Object.keys(curriculumMap),
          ...streamRes.rows.map((r) => r.stream.toLowerCase()),
        ])
      ).sort();

      const semesters = Array.from(
        new Set([
          ...Object.values(curriculumMap).flatMap((m) => Object.keys(m)),
          ...semRes.rows.map((r) => r.semester),
        ])
      ).sort((a, b) => parseInt(a) - parseInt(b));

      const allSubjects = Array.from(
        new Set([
          ...subjRes.rows.map((r) => r.subject),
          ...Object.values(curriculumMap).flatMap((m) => Object.values(m).flat()),
        ])
      ).sort();

      const sections = Array.from(
        new Set([
          ...sectionRes.rows.map((r) => r.section).filter(Boolean),
          ...curricSectionRes.rows.map((r) => r.section).filter(Boolean),
        ])
      ).sort();

      let filesSql = `SELECT id, file_name, title, subject, module, stream, semester, section FROM documents WHERE status = 'ready' ORDER BY created_at DESC LIMIT 200;`;
      const filesRes = await query(filesSql, []);
      const files = filesRes.rows.map((f) => ({
        document_id: f.id,
        file_name: f.file_name,
        title: f.title,
        subject: f.subject,
        module: f.module,
        stream: f.stream,
        semester: f.semester,
        section: f.section,
      }));

      responseData = {
        streams,
        semesters,
        sections,
        streamSections,
        curriculumSections,
        subjects: allSubjects,
        files,
        curriculum: curriculumMap,
      };
    }

    filterCache.set(cacheKey, { data: responseData, expiry: now + CACHE_TTL_MS });

    return NextResponse.json(responseData, { headers: { 'X-Cache': 'MISS' } });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
