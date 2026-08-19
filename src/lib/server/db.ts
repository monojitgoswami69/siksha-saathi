/**
 * Neon PostgreSQL Client — fastest configuration.
 *
 * query() uses @neondatabase/serverless neon() HTTP driver via sql.query().
 * Each query is a stateless HTTP fetch to Neon's proxy — ~50ms vs 1-6s for
 * a new TCP+TLS connection. No connection pool, no cold-start overhead.
 *
 * getDbPool() retains a pg.Pool for legacy/Drizzle-drizzle(node-postgres) consumers.
 * Standalone scripts in db-scripts/ use pg directly (fine for one-off runs).
 */

import { Pool, PoolConfig } from 'pg';
import { neon } from '@neondatabase/serverless';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('⚠️ DATABASE_URL not set in environment variables');
    }

    const isLocal = connectionString?.includes('localhost') || connectionString?.includes('127.0.0.1');
    const config: PoolConfig = {
      connectionString: connectionString || '',
      ...(isLocal ? { ssl: false } : {}),
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 5000,
    };

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  return pool;
}

const neonSql = neon(process.env.DATABASE_URL || '');

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  try {
    const rows = await neonSql.query(text, params);
    return { rows: rows as T[], rowCount: Array.isArray(rows) ? rows.length : 0 };
  } catch (err: any) {
    console.error(`PostgreSQL Query Error [${text.slice(0, 80)}...]:`, err.message);
    throw err;
  }
}
