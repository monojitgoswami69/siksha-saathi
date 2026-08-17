import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const stream = slug[0];
    const semester = slug[1];

    if (!stream || !semester) {
      return NextResponse.json({ detail: 'Stream and semester are required' }, { status: 400 });
    }

    const res = await query(
      'SELECT stream, semester, subjects, updated_at FROM curriculum WHERE stream = $1 AND semester = $2;',
      [stream, semester]
    );

    if (res.rowCount === 0) {
      return NextResponse.json(
        { stream, semester, subjects: [], updated_at: new Date().toISOString() }
      );
    }

    return NextResponse.json(res.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
