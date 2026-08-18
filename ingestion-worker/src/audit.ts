import { query } from './db.js';

export async function logAudit(opts: {
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
      [
        opts.userId || null,
        opts.userEmail || null,
        opts.role || null,
        opts.action,
        opts.targetType || null,
        JSON.stringify(opts.details || {}),
      ]
    );
  } catch (e: any) {
    console.error('Audit log error:', e.message);
  }
}
