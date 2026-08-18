#!/usr/bin/env node

/**
 * Database Clear Script
 * Truncates and clears all data from all application tables without dropping schema/indexes.
 *
 * Usage: npm run db:clear
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function clearDb() {
  console.log('🧹 Starting Database Clear (Truncate All Tables)...\n');
  const client = await pool.connect();

  const tables = [
    'audit_logs',
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

  try {
    // 1. Get pre-clear counts
    console.log('📊 Current Record Counts:');
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT COUNT(*) as count FROM "${table}";`);
        console.log(`   - ${table.padEnd(20)}: ${res.rows[0]?.count || 0} records`);
      } catch {
        // Table might not exist yet
      }
    }

    console.log('\n⚡ Truncating tables...');
    await client.query('BEGIN');

    // Truncate all tables in one atomic statement with CASCADE
    const tableListSql = tables.map((t) => `"${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${tableListSql} CASCADE;`);

    await client.query('COMMIT');
    console.log('✅ All tables successfully truncated!');

    console.log('\n======================================================');
    console.log('🎉 DATABASE CLEARED: All 10 tables are now completely empty.');
    console.log('💡 Tip: Run \'npm run db:seed\' to re-populate admin and curriculum.');
    console.log('======================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Database clear failed with error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearDb();
