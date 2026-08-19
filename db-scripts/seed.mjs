#!/usr/bin/env node

/**
 * Database Seeding Script
 * Seeds administrator user and base curriculum data without hardcoded values.
 *
 * Usage: npm run db:seed
 * Configurable via .env.local:
 *   SEED_ADMIN_EMAIL
 *   SEED_ADMIN_PASSWORD
 *   SEED_ADMIN_NAME
 *   SEED_ORG_NAME
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
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

// Configurable Admin Seed Parameters
const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@sikshasaathi.in').trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
const adminName = process.env.SEED_ADMIN_NAME || 'Siksha Saathi Administrator';
const orgName = process.env.SEED_ORG_NAME || 'Siksha Saathi College';

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({
  connectionString,
  ...(isLocal ? { ssl: false } : {}),
  connectionTimeoutMillis: 10000,
});

async function seed() {
  console.log('🌱 Starting Database Seeding...\n');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Seed Admin User
    console.log(`👤 Checking admin user [${adminEmail}]...`);
    const existingAdmin = await client.query(
      'SELECT id, email, role FROM dashboard_users WHERE email = $1;',
      [adminEmail]
    );

    if (existingAdmin.rowCount > 0) {
      console.log(`   ℹ️ Admin user already exists (ID: ${existingAdmin.rows[0].id}). Updating password...`);
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(adminPassword, salt);
      await client.query(
        'UPDATE dashboard_users SET password_hash = $1 WHERE email = $2;',
        [passwordHash, adminEmail]
      );
      console.log(`   ✅ Admin password updated to match SEED_ADMIN_PASSWORD.`);
    } else {
      console.log('   🔒 Hashing admin password with bcrypt...');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(adminPassword, salt);

      const insertRes = await client.query(
        `INSERT INTO dashboard_users (email, password_hash, role, display_name, organization_name)
         VALUES ($1, $2, 'admin', $3, $4)
         RETURNING id, email, role, display_name;`,
        [adminEmail, passwordHash, adminName, orgName]
      );
      console.log(`   ✅ Admin user seeded successfully!`);
      console.log(`      Email: ${adminEmail}`);
      console.log(`      Role: ${insertRes.rows[0].role}`);
      console.log(`      Name: ${insertRes.rows[0].display_name}`);
    }

    // 2. Seed Default Curriculum Structure (if curriculum is empty)
    console.log('\n📚 Checking default curriculum structure...');
    const curricCheck = await client.query('SELECT COUNT(*) as total FROM curriculum;');
    const curricCount = parseInt(curricCheck.rows[0]?.total || '0', 10);

    if (curricCount === 0) {
      console.log('   📦 Seeding standard engineering curriculum semesters...');
      const defaultCurriculum = [
        {
          stream: 'cse',
          semester: '1',
          subjects: ['Mathematics I', 'Physics', 'Basic Electrical Engineering', 'Programming in C'],
        },
        {
          stream: 'cse',
          semester: '2',
          subjects: ['Mathematics II', 'Chemistry', 'Data Structures & Algorithms', 'Digital Logic Design'],
        },
        {
          stream: 'cse',
          semester: '3',
          subjects: ['Object Oriented Programming (Java)', 'Discrete Mathematics', 'Computer Organization & Architecture'],
        },
        {
          stream: 'cse',
          semester: '4',
          subjects: ['Operating Systems', 'Database Management Systems', 'Design & Analysis of Algorithms', 'Formal Language & Automata Theory'],
        },
        {
          stream: 'cse',
          semester: '5',
          subjects: ['Computer Networks', 'Software Engineering', 'Compiler Design', 'Artificial Intelligence'],
        },
        {
          stream: 'cse',
          semester: '6',
          subjects: ['Machine Learning', 'Cloud Computing', 'Information Security', 'Web Technologies'],
        },
        {
          stream: 'it',
          semester: '1',
          subjects: ['Mathematics I', 'Physics', 'Programming in C', 'Basic Electronics'],
        },
        {
          stream: 'ece',
          semester: '1',
          subjects: ['Mathematics I', 'Physics', 'Basic Electrical Engineering', 'Engineering Mechanics'],
        },
      ];

      for (const item of defaultCurriculum) {
        await client.query(
          `INSERT INTO curriculum (stream, semester, subjects)
           VALUES ($1, $2, $3)
           ON CONFLICT (stream, semester) DO NOTHING;`,
          [item.stream, item.semester, JSON.stringify(item.subjects)]
        );
      }
      console.log(`   ✅ Seeded ${defaultCurriculum.length} curriculum semester entries.`);
    } else {
      console.log(`   ℹ️ Curriculum already contains ${curricCount} entries. Skipping curriculum seed.`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Database seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Database seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
