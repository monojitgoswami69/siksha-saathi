/**
 * NeonDB PostgreSQL Client & Connection Pooling
 * Supports relational queries and pgvector vector search operations.
 * Schema management and seeding have been migrated to dedicated scripts in db-scripts/.
 */

import { Pool, PoolConfig } from 'pg';

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
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  return pool;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const db = getDbPool();
  try {
    const res = await db.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount };
  } catch (err: any) {
    console.error(`PostgreSQL Query Error [${text.slice(0, 80)}...]:`, err.message);
    throw err;
  }
}
