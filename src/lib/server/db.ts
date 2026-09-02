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

    const isNeon = connectionString?.includes('neon.tech');
    const isLocal = !isNeon;
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

let _neonSql: ReturnType<typeof neon> | null = null;
function getNeonSql() {
  if (!_neonSql) {
    _neonSql = neon(process.env.DATABASE_URL || '');
  }
  return _neonSql;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const connectionString = process.env.DATABASE_URL || '';
  const isNeon = connectionString.includes('neon.tech');
  const isLocal = !isNeon;

  try {
    if (isLocal) {
      const p = getDbPool();
      const res = await p.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount };
    } else {
      const nSql = getNeonSql();
      const rows = await nSql.query(text, params);
      return { rows: rows as T[], rowCount: Array.isArray(rows) ? rows.length : 0 };
    }
  } catch (err: any) {
    console.error(`PostgreSQL Query Error [${text.slice(0, 80)}...]:`, err.message);
    throw err;
  }
}

