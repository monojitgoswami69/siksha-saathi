#!/usr/bin/env node

/**
 * Database Reset Script
 * Drops all application tables and indexes, then executes schema initialization.
 *
 * Usage: npm run db:reset
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env.local or .env
function loadEnv() {
  const envLocal = path.join(rootDir, '.env.local');
  const envDefault = path.join(rootDir, '.env');

  if (typeof process.loadEnvFile === 'function') {
    if (fs.existsSync(envLocal)) {
      process.loadEnvFile(envLocal);
    } else if (fs.existsSync(envDefault)) {
      process.loadEnvFile(envDefault);
    }
  } else {
    const targetFile = fs.existsSync(envLocal) ? envLocal : fs.existsSync(envDefault) ? envDefault : null;
    if (targetFile) {
      const content = fs.readFileSync(targetFile, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...rest] = trimmed.split('=');
          const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
          if (key && !process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      });
    }
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL is not set in environment or .env.local');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({
  connectionString,
  ...(isLocal ? { ssl: false } : {}),
  connectionTimeoutMillis: 10000,
});

async function reset() {
  console.log('⚠️ WARNING: Dropping all Siksha Saathi application tables...\n');
  const client = await pool.connect();

  try {
    const tablesToDrop = [
      'audit_logs',
      'ingestion_jobs',
      'query_citations',
      'query_logs',
      'curriculum',
      'quiz_results',
      'chat_messages',
      'chat_sessions',
      'document_images',
      'document_chunks',
      'documents',
      'student_users',
      'dashboard_users',
    ];

    for (const table of tablesToDrop) {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
      console.log(`   🗑️ Dropped table: ${table}`);
    }

    console.log('\n✅ All tables dropped cleanly.');
  } catch (err) {
    console.error('❌ Failed to drop tables:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  // Re-run init schema
  console.log('\n🔄 Re-initializing clean schema...');
  execSync('node db-scripts/init-schema.mjs', { stdio: 'inherit', cwd: rootDir });
}

reset();
