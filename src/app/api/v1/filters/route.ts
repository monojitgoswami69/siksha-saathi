import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

let cachedFilters: any = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateFilterCache() {
  cachedFilters = null;
  cacheExpiry = 0;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedFilters && now < cacheExpiry) {
      return NextResponse.json(cachedFilters, {
        headers: {
          'X-Cache': 'HIT',
        },
      });
    }

    // Parallel: fetch all filter data at once
    const [streamRes, semRes, subjRes, curricRes] = await Promise.all([
      query("SELECT DISTINCT stream FROM documents WHERE stream IS NOT NULL AND stream != '';"),
      query("SELECT DISTINCT semester FROM documents WHERE semester IS NOT NULL AND semester != '';"),
      query("SELECT DISTINCT subject FROM documents WHERE subject IS NOT NULL AND subject != '';"),
      query('SELECT stream, semester, subjects FROM curriculum ORDER BY stream ASC, semester ASC;'),
    ]);

    // Build curriculum map strictly from DB
    const curriculumMap: Record<string, Record<string, string[]>> = {};

    curricRes.rows.forEach((row) => {
      const s = row.stream.toLowerCase();
      const sem = row.semester;
      const subs = Array.isArray(row.subjects)
        ? row.subjects.map((sub: any) => (typeof sub === 'string' ? sub : sub.name || sub.title))
        : [];

      if (!curriculumMap[s]) curriculumMap[s] = {};
      curriculumMap[s][sem] = subs;
    });

    // Derive streams: union of curriculum table + documents table
    const streams = Array.from(
      new Set([
        ...Object.keys(curriculumMap),
        ...streamRes.rows.map((r) => r.stream.toLowerCase()),
      ])
    ).sort();

    // Derive semesters from both sources
    const semesters = Array.from(
      new Set([
        ...Object.values(curriculumMap).flatMap((m) => Object.keys(m)),
        ...semRes.rows.map((r) => r.semester),
      ])
    ).sort((a, b) => parseInt(a) - parseInt(b));

    // Derive subjects from both sources
    const allSubjects = Array.from(
      new Set([
        ...subjRes.rows.map((r) => r.subject),
        ...Object.values(curriculumMap).flatMap((m) => Object.values(m).flat()),
      ])
    ).sort();

    const responseData = {
      streams,
      semesters,
      subjects: allSubjects,
      curriculum: curriculumMap,
    };

    cachedFilters = responseData;
    cacheExpiry = now + CACHE_TTL_MS;

    return NextResponse.json(responseData, {
      headers: {
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
