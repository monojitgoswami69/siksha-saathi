/**
 * Audit Logging and Query Tracking Service
 */

import { query } from './db';

export async function logAudit({
  userId,
  userEmail,
  role,
  action,
  targetType,
  details = {},
}: {
  userId?: string;
  userEmail?: string;
  role?: string;
  action: string;
  targetType?: string;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_email, role, action, target_type, details)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [userId || null, userEmail || null, role || null, action, targetType || null, JSON.stringify(details)]
    );
  } catch (err: any) {
    console.error('Audit log error:', err.message);
  }
}

export async function logStudentQuery({
  userId,
  queryText,
  subject,
  stream,
  semester,
  topChunkId,
}: {
  userId?: string;
  queryText: string;
  subject?: string;
  stream?: string;
  semester?: string;
  topChunkId?: string;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO query_logs (user_id, query_text, subject, stream, semester, top_chunk_id)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [userId || null, queryText, subject || 'General', stream || 'General', semester || 'General', topChunkId || null]
    );
  } catch (err: any) {
    console.error('Query log error:', err.message);
  }
}
