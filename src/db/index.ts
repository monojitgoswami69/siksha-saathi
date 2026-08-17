import { drizzle } from 'drizzle-orm/node-postgres';
import { getDbPool } from '@/lib/server/db';
import * as schema from './schema';

export const db = drizzle(getDbPool(), { schema });

export * from './schema';
export { schema };
