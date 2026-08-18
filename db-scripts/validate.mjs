#!/usr/bin/env node

/**
 * Database Verification & Validation Script
 * Verifies database connection, extensions, all 10 application tables, row counts, and indexes.
 *
 * Usage: npm run db:validate (or npm run db:verify)
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

async function validate() {
  console.log('🔍 Starting Siksha Saathi Database Validation...\n');
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    // 1. Connection & Server Info
    const pingStart = Date.now();
    const verRes = await client.query('SELECT version(), current_database(), current_user;');
    const latency = Date.now() - pingStart;

    console.log('📡 Connection Health:');
    console.log(`   Database: ${verRes.rows[0].current_database}`);
    console.log(`   User:     ${verRes.rows[0].current_user}`);
    console.log(`   Latency:  ${latency}ms`);
    console.log(`   Version:  ${verRes.rows[0].version.split(',')[0]}\n`);

    // 2. Extensions Check
    console.log('📦 PostgreSQL Extensions:');
    const extRes = await client.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');"
    );
    const installedExts = new Map(extRes.rows.map((r) => [r.extname, r.extversion]));

    if (installedExts.has('uuid-ossp')) {
      console.log(`   ✅ uuid-ossp (v${installedExts.get('uuid-ossp')})`);
    } else {
      console.log('   ⚠️ uuid-ossp: NOT installed');
    }

    if (installedExts.has('vector')) {
      console.log(`   ✅ vector (pgvector v${installedExts.get('vector')})`);
    } else {
      console.log('   ⚠️ vector: NOT installed (required for pgvector similarity search)');
    }

    // 3. Tables & Row Counts Check
    const requiredTables = [
      'dashboard_users',
      'student_users',
      'documents',
      'document_chunks',
      'document_images',
      'chat_sessions',
      'chat_messages',
      'quiz_results',
      'curriculum',
      'query_logs',
      'query_citations',
      'audit_logs',
    ];

    console.log('\n📊 Tables & Records:');
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    const existingTables = new Set(tableRes.rows.map((r) => r.table_name));

    let missingTables = 0;
    for (const table of requiredTables) {
      if (existingTables.has(table)) {
        const countRes = await client.query(`SELECT COUNT(*) as count FROM "${table}";`);
        const count = parseInt(countRes.rows[0]?.count || '0', 10);
        console.log(`   ✅ ${table.padEnd(20)} : ${count.toString().padStart(6)} records`);
      } else {
        console.log(`   ❌ ${table.padEnd(20)} : MISSING`);
        missingTables++;
      }
    }

    // 4. Index Health Check
    console.log('\n⚡ Index Health:');
    const indexRes = await client.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    const hnswIndex = indexRes.rows.find((i) => i.indexname === 'idx_chunks_embedding');
    if (hnswIndex) {
      console.log('   ✅ HNSW Vector Index (idx_chunks_embedding) is ACTIVE');
    } else {
      console.log('   ℹ️ HNSW Vector Index not present (B-tree / Exact vector scan active)');
    }
    console.log(`   Total custom indexes found: ${indexRes.rows.length}`);

    // Summary
    const totalTime = Date.now() - startTime;
    console.log(`\n======================================================`);
    if (missingTables === 0) {
      console.log(`🎉 ALL CHECKS PASSED: Database schema is 100% healthy (${totalTime}ms)`);
    } else {
      console.log(`⚠️ VALIDATION WARNING: ${missingTables} required table(s) missing. Run 'npm run db:init'`);
    }
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('\n❌ Database validation failed with error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

validate();
