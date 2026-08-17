import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export async function GET() {
  try {
    const dbRes = await query('SELECT NOW() as time;');
    const chunkRes = await query('SELECT COUNT(*) as total_chunks FROM document_chunks;');
    const docRes = await query('SELECT COUNT(*) as total_docs FROM documents;');

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      time: dbRes.rows[0]?.time,
      vector_store: {
        total_documents: parseInt(docRes.rows[0]?.total_docs || '0', 10),
        total_chunks: parseInt(chunkRes.rows[0]?.total_chunks || '0', 10),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'error',
        error: err.message,
      },
      { status: 500 }
    );
  }
}
