/**
 * Role-based analytics scoping.
 *
 *  - admin   : sees everything (no filter)
 *  - hod     : scoped to their stream (dashboard_users.stream)
 *  - faculty : scoped to the documents THEY uploaded (what they teach)
 *
 * The JWT does not carry stream, so HOD/faculty scope is resolved from
 * dashboard_users at request time. This guarantees no cross-stream leakage.
 */
import { TokenPayload } from './auth';
import { getDashboardProfile } from './auth';

export type ScopeMode = 'all' | 'stream' | 'faculty';

export interface ResolvedScope {
  mode: ScopeMode;
  stream: string | null;
  uid: string;
}

export async function resolveScope(user: TokenPayload): Promise<ResolvedScope> {
  if (user.role === 'admin') {
    return { mode: 'all', stream: null, uid: user.uid };
  }
  if (user.role === 'faculty') {
    return { mode: 'faculty', stream: null, uid: user.uid };
  }
  // hod (and any other dashboard role) -> stream scope
  const profile = await getDashboardProfile(user.uid);
  return { mode: profile.stream ? 'stream' : 'all', stream: profile.stream, uid: user.uid };
}

/**
 * SQL fragment to scope a query_logs-based aggregation (alias `q`).
 * Returns { sql, params } where `sql` is an AND-able clause (empty for 'all').
 */
export function queryLogScopeClause(
  scope: ResolvedScope,
  startIdx: number
): { sql: string; params: any[]; nextIdx: number } {
  if (scope.mode === 'stream' && scope.stream) {
    return {
      sql: ` AND (q.stream = $${startIdx} OR q.stream = 'General' OR q.stream IS NULL)`,
      params: [scope.stream],
      nextIdx: startIdx + 1,
    };
  }
  if (scope.mode === 'faculty') {
    return {
      sql: ` AND EXISTS (
        SELECT 1 FROM query_citations qc
        JOIN documents d ON d.id = qc.document_id
        WHERE qc.query_log_id = q.id AND d.uploaded_by = $${startIdx}
      )`,
      params: [scope.uid],
      nextIdx: startIdx + 1,
    };
  }
  return { sql: '', params: [], nextIdx: startIdx };
}

/**
 * SQL fragment to scope a query_citations-based aggregation (alias `qc`).
 */
export function citationScopeClause(
  scope: ResolvedScope,
  startIdx: number
): { sql: string; params: any[]; nextIdx: number } {
  if (scope.mode === 'stream' && scope.stream) {
    return {
      sql: ` AND (qc.stream = $${startIdx} OR qc.stream = 'General' OR qc.stream IS NULL)`,
      params: [scope.stream],
      nextIdx: startIdx + 1,
    };
  }
  if (scope.mode === 'faculty') {
    return {
      sql: ` AND qc.document_id IN (SELECT id FROM documents WHERE uploaded_by = $${startIdx})`,
      params: [scope.uid],
      nextIdx: startIdx + 1,
    };
  }
  return { sql: '', params: [], nextIdx: startIdx };
}

/**
 * SQL fragment to scope a documents-based aggregation (alias `d`).
 */
export function documentScopeClause(
  scope: ResolvedScope,
  startIdx: number
): { sql: string; params: any[]; nextIdx: number } {
  if (scope.mode === 'stream' && scope.stream) {
    return {
      sql: ` AND (d.stream = $${startIdx} OR d.stream = 'General' OR d.stream IS NULL)`,
      params: [scope.stream],
      nextIdx: startIdx + 1,
    };
  }
  if (scope.mode === 'faculty') {
    return {
      sql: ` AND d.uploaded_by = $${startIdx}`,
      params: [scope.uid],
      nextIdx: startIdx + 1,
    };
  }
  return { sql: '', params: [], nextIdx: startIdx };
}
