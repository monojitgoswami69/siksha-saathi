/**
 * Default Curriculum Loader & Helpers
 *
 * Reads departments_curriculum.json and provides structured mappings
 * for all 8 departments across all semesters (1-8).
 */

import fs from 'fs';
import path from 'path';

export interface CurriculumEntry {
  stream: string;
  semester: string;
  subjects: string[];
  sections: string[];
}

export interface DepartmentMeta {
  code: string;
  fullName: string;
  courseCode: string;
  batches: string[];
  activeSessions: string[];
}

// MAKAUT Standard First Year (Semesters 1 & 2)
const SEM12_GROUP_A = {
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

const SEM12_GROUP_B = {
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

const GROUP_A_BRANCHES = new Set(['CSE', 'IT', 'ECE', 'EE']);

/**
 * Load raw JSON data from departments_curriculum.json
 */
export function getRawCurriculumData(): any {
  const possiblePaths = [
    path.join(process.cwd(), 'departments_curriculum.json'),
    path.resolve(__dirname, '../../../../departments_curriculum.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
      try {
        return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ p, 'utf8'));
      } catch (err) {
        console.error(`Failed to parse ${p}:`, err);
      }
    }
  }
  return null;
}

/**
 * Generate normalized curriculum entries for all departments and semesters (1 to 8)
 */
export function getDefaultCurriculumEntries(): CurriculumEntry[] {
  const rawData = getRawCurriculumData();
  if (!rawData || !rawData.departments) return [];

  const entries: CurriculumEntry[] = [];

  for (const [dept, info] of Object.entries<any>(rawData.departments)) {
    const stream = dept.toLowerCase();
    const batches: string[] = Array.isArray(info.batches) ? info.batches : [];

    // Semesters 1 and 2
    const sem12 = GROUP_A_BRANCHES.has(dept) ? SEM12_GROUP_A : SEM12_GROUP_B;
    entries.push({
      stream,
      semester: '1',
      subjects: [...sem12[1]],
      sections: [...batches],
    });
    entries.push({
      stream,
      semester: '2',
      subjects: [...sem12[2]],
      sections: [...batches],
    });

    // Semesters 3 through 8
    const curriculumObj = info.curriculum || {};
    for (const [semName, rawSubs] of Object.entries<any>(curriculumObj)) {
      const semNum = semName.replace(/[^0-9]/g, '');
      if (!semNum) continue;

      const subjects: string[] = [];
      if (Array.isArray(rawSubs)) {
        for (const item of rawSubs) {
          if (typeof item === 'string') {
            const clean = item.trim();
            if (clean && !subjects.includes(clean)) subjects.push(clean);
          } else if (typeof item === 'object' && item !== null) {
            for (const groupSubs of Object.values<any>(item)) {
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

      entries.push({
        stream,
        semester: semNum,
        subjects,
        sections: [...batches],
      });
    }
  }

  return entries;
}

/**
 * Build curriculum map { stream: { semester: [subjects] } }
 */
export function getDefaultCurriculumMap(): Record<string, Record<string, string[]>> {
  const entries = getDefaultCurriculumEntries();
  const map: Record<string, Record<string, string[]>> = {};

  for (const e of entries) {
    if (!map[e.stream]) map[e.stream] = {};
    map[e.stream][e.semester] = e.subjects;
  }

  return map;
}

/**
 * Extract distinct metadata for streams and sections
 */
export function getDefaultMetadata(): {
  streams: string[];
  semesters: string[];
  sections: string[];
  allSubjects: string[];
  departments: DepartmentMeta[];
} {
  const rawData = getRawCurriculumData();
  const entries = getDefaultCurriculumEntries();

  const streams = Array.from(new Set(entries.map((e) => e.stream))).sort();
  const semesters = Array.from(new Set(entries.map((e) => e.semester))).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  const sections = Array.from(new Set(entries.flatMap((e) => e.sections))).sort();
  const allSubjects = Array.from(new Set(entries.flatMap((e) => e.subjects))).sort();

  const departments: DepartmentMeta[] = [];
  if (rawData && rawData.departments) {
    for (const [dept, info] of Object.entries<any>(rawData.departments)) {
      departments.push({
        code: dept.toLowerCase(),
        fullName: info.full_name || dept,
        courseCode: info.course_code || '',
        batches: info.batches || [],
        activeSessions: info.active_sessions || [],
      });
    }
  }

  return {
    streams,
    semesters,
    sections,
    allSubjects,
    departments,
  };
}
