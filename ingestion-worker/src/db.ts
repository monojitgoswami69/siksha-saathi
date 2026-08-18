import pg, { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('DATABASE_URL is not set');
      process.exit(1);
    }
    const isLocal =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    const config: PoolConfig = {
      connectionString,
      ...(isLocal ? { ssl: false } : {}),
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
    pool = new pg.Pool(config);
    pool.on('error', (err) => console.error('PG pool error:', err.message));
  }
  return pool;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const db = getDbPool();
  const res = await db.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount };
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function endPool() {
  if (pool) await pool.end();
}
