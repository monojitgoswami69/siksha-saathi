import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getStorageDownloadUrl } from '@/lib/server/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { documentId } = await params;
    const isDownload = req.nextUrl.searchParams.get('download') === '1';

    const docRes = await query(
      'SELECT id, title, file_name, mime_type, storage_provider, file_key, preview_url, stream, semester, section FROM documents WHERE id = $1;',
      [documentId]
    );

    if (docRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    const doc = docRes.rows[0];

    // Scope check: students can only access documents in their scope
    if (user.scope === 'student') {
      const profileRes = await query(
        'SELECT stream, sem, section FROM student_users WHERE id = $1;',
        [user.uid]
      ).catch(() => ({ rows: [], rowCount: 0 }));

      if (profileRes.rowCount && profileRes.rowCount > 0) {
        const p = profileRes.rows[0] as any;
        const streamOk =
          !doc.stream ||
          doc.stream === 'General' ||
          doc.stream.toLowerCase() === (p.stream || '').toLowerCase();
        const semOk =
          !doc.semester ||
          doc.semester === 'General' ||
          String(doc.semester) === String(p.sem);
        const secOk =
          !doc.section ||
          doc.section === 'General' ||
          doc.section.toLowerCase() === (p.section || '').toLowerCase();

        if (!streamOk || !semOk || !secOk) {
          return NextResponse.json({ detail: 'Access denied for this material.' }, { status: 403 });
        }
      }
    }

    const fileKey = doc.file_key;
    const provider = doc.storage_provider || 'local';

    // 1. Local filesystem storage
    if (provider === 'local' || !doc.storage_provider) {
      const storageDir =
        process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), '.storage');

      const cleanKey = (fileKey || '').replace(/^\/+/, '');
      const candidates = [
        path.join(storageDir, cleanKey),
        path.join(storageDir, path.basename(cleanKey)),
        path.join(process.cwd(), '.storage', cleanKey),
        path.join(process.cwd(), '.storage', path.basename(cleanKey)),
      ];

      let foundPath: string | null = null;
      for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          foundPath = cand;
          break;
        }
      }

      if (foundPath) {
        const buffer = fs.readFileSync(foundPath);
        const filename = doc.file_name || doc.title || 'document.pdf';
        const disposition = isDownload
          ? `attachment; filename="${encodeURIComponent(filename)}"`
          : `inline; filename="${encodeURIComponent(filename)}"`;

        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': doc.mime_type || 'application/pdf',
            'Content-Disposition': disposition,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // 2. Cloud storage (Cloudflare R2) redirect fallback
    if (fileKey) {
      const cloudUrl = await getStorageDownloadUrl({
        fileKey,
        filename: doc.file_name || doc.title,
        provider,
      });
      if (cloudUrl) {
        return NextResponse.redirect(cloudUrl);
      }
    }

    return NextResponse.json(
      { detail: 'File content not found on storage' },
      { status: 404 }
    );
  } catch (err: any) {
    console.error('Document file streaming error:', err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
