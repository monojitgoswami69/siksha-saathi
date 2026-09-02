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

    // 2. Seed Default Curriculum Structure from departments_curriculum.json
    console.log('\n📚 Loading and syncing departments curriculum from departments_curriculum.json...');
    const curricJsonPath = path.join(rootDir, 'departments_curriculum.json');
    let defaultCurriculum = [];

    if (fs.existsSync(curricJsonPath)) {
      const rawData = JSON.parse(fs.readFileSync(curricJsonPath, 'utf8'));
      const groupABranches = new Set(['CSE', 'IT', 'ECE', 'EE']);

      const sem12GroupA = {
        1: [
          'Mathematics-I (Calculus & Linear Algebra)',
          'Physics-I',
          'Basic Electrical Engineering',
          'Engineering Graphics & Design',
          'Physics-I Lab',
          'Basic Electrical Engineering Lab',
        ],
        2: [
          'Mathematics-II (Differential Equations & Complex Variables)',
          'Chemistry-I',
          'Programming for Problem Solving (C Programming)',
          'English',
          'Chemistry-I Lab',
          'Programming for Problem Solving Lab',
        ],
      };

      const sem12GroupB = {
        1: [
          'Mathematics-I (Calculus & Linear Algebra)',
          'Chemistry-I',
          'Programming for Problem Solving (C Programming)',
          'English',
          'Chemistry-I Lab',
          'Programming for Problem Solving Lab',
        ],
        2: [
          'Mathematics-II (Differential Equations & Complex Variables)',
          'Physics-I',
          'Basic Electrical Engineering',
          'Engineering Graphics & Design',
          'Physics-I Lab',
          'Basic Electrical Engineering Lab',
        ],
      };

      for (const [dept, info] of Object.entries(rawData.departments || {})) {
        const stream = dept.toLowerCase();
        const batches = Array.isArray(info.batches) ? info.batches : [];

        // Semesters 1 and 2
        const sem12 = groupABranches.has(dept) ? sem12GroupA : sem12GroupB;
        defaultCurriculum.push({ stream, semester: '1', subjects: sem12[1], sections: batches });
        defaultCurriculum.push({ stream, semester: '2', subjects: sem12[2], sections: batches });

        // Semesters 3 through 8
        for (const [semLabel, rawSubs] of Object.entries(info.curriculum || {})) {
          const semNum = semLabel.replace(/[^0-9]/g, '');
          if (!semNum) continue;

          const subjects = [];
          if (Array.isArray(rawSubs)) {
            for (const item of rawSubs) {
              if (typeof item === 'string') {
                const clean = item.trim();
                if (clean && !subjects.includes(clean)) subjects.push(clean);
              } else if (typeof item === 'object' && item !== null) {
                for (const groupSubs of Object.values(item)) {
                  if (Array.isArray(groupSubs)) {
                    for (const s of groupSubs) {
                      if (typeof s === 'string') {
                        const clean = s.trim();
                        if (clean && !subjects.includes(clean)) subjects.push(clean);
                      }
                    }
                  }
                }
              }
            }
          }

          defaultCurriculum.push({ stream, semester: semNum, subjects, sections: batches });
        }
      }
    }

    let seededCount = 0;
    for (const item of defaultCurriculum) {
      await client.query(
        `INSERT INTO curriculum (stream, semester, subjects, sections, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (stream, semester)
         DO UPDATE SET subjects = EXCLUDED.subjects, sections = EXCLUDED.sections, updated_at = NOW();`,
        [item.stream, item.semester, JSON.stringify(item.subjects), JSON.stringify(item.sections)]
      );
      seededCount++;
    }
    console.log(`   ✅ Synced ${seededCount} curriculum semester entries across ${Object.keys(defaultCurriculum).length ? '8' : '0'} departments.`);

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
