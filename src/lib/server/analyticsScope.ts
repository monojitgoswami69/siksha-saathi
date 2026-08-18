/**
 * Role-based analytics scoping — multi-assignment model.
 *
 * A dashboard user's data access is the UNION of:
 *  - their HOD stream grants (full access to every semester/section/subject
 *    in those streams), from `hod_streams`; AND
 *  - their faculty teaching assignments (specific stream/semester/section/
 *    subject combos) from `faculty_assignments`.
 *
 *  - admin   : no filter (everything)
 *  - hod     : hod_streams (multi) + faculty_assignments (they may also teach)
 *  - faculty : faculty_assignments only
 *
 * The JWT carries no stream — scope is resolved from the assignment tables at
 * request time, so it cannot be tampered with. `document_id` filters are still
 * AND-ed with scope in every retrieval route (no bypass).
 */
import { TokenPayload } from './auth';
import { query } from './db';

export interface FacultyAssignment {
  stream: string;
  semester: string;
  section: string;
  subject: string;
}

export interface ResolvedScope {
  mode: 'all' | 'assigned';
  uid: string;
  hodStreams: string[];
  assignments: FacultyAssignment[];
}

export async function resolveScope(user: TokenPayload): Promise<ResolvedScope> {
  if (user.role === 'admin') {
    return { mode: 'all', uid: user.uid, hodStreams: [], assignments: [] };
  }
  const [hodRes, faRes] = await Promise.all([
    query<{ stream: string }>('SELECT stream FROM hod_streams WHERE user_id = $1;', [user.uid]),
    query<{ stream: string; semester: string; section: string; subject: string }>(
      'SELECT stream, semester, section, subject FROM faculty_assignments WHERE user_id = $1;',
      [user.uid]
    ),
  ]);
  const hodStreams = (hodRes.rows || []).map((r) => r.stream).filter(Boolean);
  const assignments = (faRes.rows || []) as FacultyAssignment[];
  // If a user has no assignments at all, fall back to their legacy single
  // stream column (defensive — shouldn't happen after backfill).
  if (hodStreams.length === 0 && assignments.length === 0) {
    try {
      const p = await query<{ stream: string }>(
        'SELECT stream FROM dashboard_users WHERE id = $1;',
        [user.uid]
      );
      const s = p.rows[0]?.stream;
      if (s) return { mode: 'assigned', uid: user.uid, hodStreams: [s], assignments: [] };
    } catch {}
  }
  return { mode: 'assigned', uid: user.uid, hodStreams, assignments };
}

/**
 * The set of streams a dashboard user may upload into (for ingest validation).
 */
export async function getAllowedStreams(user: TokenPayload): Promise<string[]> {
  if (user.role === 'admin') return []; // admin = all
  const scope = await resolveScope(user);
  const set = new Set<string>(scope.hodStreams);
  scope.assignments.forEach((a) => set.add(a.stream));
  return [...set];
}

/**
 * SQL fragment that scopes an aggregation by the user's assignments.
 *
 * `cols` are the qualified column expressions for the surrounding table
 * (e.g. { stream:'q.stream', semester:'q.semester', section:'q.section', subject:'q.subject' }).
 * If `subject` is omitted (e.g. student_users has no subject), the subject
 * condition is dropped from the EXISTS.
 *
 * Returns { sql, params } where `sql` is an AND-able clause (empty for admin).
 * Params: [hodStreams text[], uid]. Per-dimension General wildcards keep
 * General-scoped materials visible.
 */
export function dashboardScopeClause(
  cols: { stream: string; semester: string; section: string; subject?: string },
  scope: ResolvedScope,
  startIdx: number
): { sql: string; params: any[]; nextIdx: number } {
  if (scope.mode === 'all') return { sql: '', params: [], nextIdx: startIdx };

  const streams = scope.hodStreams.length ? scope.hodStreams : ['__none__'];
  const s = cols.stream;
  const se = cols.semester;
  const sec = cols.section;
  const subj = cols.subject;

  const subjectCond = subj
    ? ` AND (LOWER(${subj}) = LOWER(fa.subject) OR ${subj} = 'General' OR ${subj} IS NULL)`
    : '';

  const sql =
    ` AND (` +
    `${s} = ANY($${startIdx}::text[]) OR ${s} = 'General' OR ${s} IS NULL` +
    ` OR EXISTS (` +
    `SELECT 1 FROM faculty_assignments fa WHERE fa.user_id = $${startIdx + 1}` +
    ` AND (${s} = fa.stream OR ${s} = 'General' OR ${s} IS NULL)` +
    ` AND (${se} = fa.semester OR ${se} = 'General' OR ${se} IS NULL)` +
    ` AND (${sec} = fa.section OR ${sec} = 'General' OR ${sec} IS NULL)` +
    subjectCond +
    `)` +
    `)`;
  return { sql, params: [streams, scope.uid], nextIdx: startIdx + 2 };
}

