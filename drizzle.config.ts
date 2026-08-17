import { defineConfig } from 'drizzle-kit';
import fs from 'fs';
import path from 'path';

// Load .env.local if present
const envLocal = path.resolve(process.cwd(), '.env.local');
const envDefault = path.resolve(process.cwd(), '.env');

if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync(envLocal)) {
    process.loadEnvFile(envLocal);
  } else if (fs.existsSync(envDefault)) {
    process.loadEnvFile(envDefault);
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
