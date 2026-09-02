import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

let cachedFilters: any = null;
let cachedFiltersFor: string | null = null; // cache key by user scope
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateFilterCache() {
  cachedFilters = null;
  cachedFiltersFor = null;
  cacheExpiry = 0;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    // Cache key: differentiate student (scoped) vs admin (unscoped)
    const cacheKey = user ? `${user.uid}:${user.role}` : 'anon';

    const now = Date.now();
    if (cachedFilters && cachedFiltersFor === cacheKey && now < cacheExpiry) {
      return NextResponse.json(cachedFilters, { headers: { 'X-Cache': 'HIT' } });
    }

    // Parallel: fetch all filter data at once
    const [streamRes, semRes, subjRes, sectionRes, curricRes, curricSectionRes] = await Promise.all([
      query("SELECT DISTINCT stream FROM documents WHERE stream IS NOT NULL AND stream != '';"),
      query("SELECT DISTINCT semester FROM documents WHERE semester IS NOT NULL AND semester != '';"),
      query("SELECT DISTINCT subject FROM documents WHERE subject IS NOT NULL AND subject != '';"),
      query(
        "SELECT DISTINCT section FROM documents WHERE section IS NOT NULL AND section != '' UNION SELECT DISTINCT section FROM student_users WHERE section IS NOT NULL AND section != '';"
      ),
      query('SELECT stream, semester, subjects, sections FROM curriculum ORDER BY stream ASC, semester ASC;'),
      // Also extract sections from curriculum.sections JSONB array (handles both string and object elements)
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
          if (!curriculumMap[e.stream]) curriculumMap[e.stream] = {};
          curriculumMap[e.stream][e.semester] = e.subjects;

          if (!curriculumSections[e.stream]) curriculumSections[e.stream] = {};
          curriculumSections[e.stream][e.semester] = e.sections;

          if (!streamSections[e.stream]) streamSections[e.stream] = [];
          e.sections.forEach((sec) => {
            if (!streamSections[e.stream].includes(sec)) streamSections[e.stream].push(sec);
          });
        }
      } catch (err) {
        console.warn('Could not load default curriculum fallback:', err);
      }
    }

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

    // Files: scope to student's stream/semester/section if student
    let files: any[] = [];
    let studentStream: string | undefined;
    let studentSem: string | undefined;
    let studentSection: string | undefined;

    if (user && user.scope === 'student') {
      try {
        const profileRes = await query(
          'SELECT stream, sem, section FROM student_users WHERE id = $1;',
          [user.uid]
        );
        if (profileRes.rowCount && profileRes.rowCount > 0) {
          const p = profileRes.rows[0] as any;
          studentStream = p.stream;
          studentSem = p.sem;
          studentSection = p.section;
        }
      } catch {}
    }

    let filesSql = `SELECT id, file_name, title, subject, stream, semester, section FROM documents WHERE status = 'ready'`;
    const filesParams: any[] = [];
    let fIdx = 1;
    if (studentStream) {
      filesSql += ` AND (stream = $${fIdx} OR stream = 'General' OR stream IS NULL)`;
      filesParams.push(studentStream);
      fIdx++;
    }
    if (studentSem) {
      filesSql += ` AND (semester = $${fIdx} OR semester = 'General' OR semester IS NULL)`;
      filesParams.push(studentSem);
      fIdx++;
    }
    if (studentSection) {
      filesSql += ` AND (section = $${fIdx} OR section = 'General' OR section IS NULL)`;
      filesParams.push(studentSection);
      fIdx++;
    }
    filesSql += ` ORDER BY created_at DESC LIMIT 200;`;
    const filesRes = await query(filesSql, filesParams);
    files = filesRes.rows.map((f) => ({
      document_id: f.id,
      file_name: f.file_name,
      title: f.title,
      subject: f.subject,
      stream: f.stream,
      semester: f.semester,
      section: f.section,
    }));

    const responseData = {
      streams,
      semesters,
      sections,
      streamSections,
      curriculumSections,
      subjects: allSubjects,
      files,
      curriculum: curriculumMap,
    };

    cachedFilters = responseData;
    cachedFiltersFor = cacheKey;
    cacheExpiry = now + CACHE_TTL_MS;

    return NextResponse.json(responseData, { headers: { 'X-Cache': 'MISS' } });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
