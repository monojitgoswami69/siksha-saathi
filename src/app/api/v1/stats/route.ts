import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export async function GET() {
  try {
    const chunkRes = await query('SELECT COUNT(*) as total_chunks FROM document_chunks;');
    const docRes = await query('SELECT COUNT(*) as total_docs FROM documents;');
    const userRes = await query('SELECT COUNT(*) as total_students FROM student_users;');

    return NextResponse.json({
      total_documents: parseInt(docRes.rows[0]?.total_docs || '0', 10),
      total_chunks: parseInt(chunkRes.rows[0]?.total_chunks || '0', 10),
      total_students: parseInt(userRes.rows[0]?.total_students || '0', 10),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
