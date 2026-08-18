import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getDropboxTemporaryLink } from './dropbox.js';

let r2Client: S3Client | null = null;

function getR2Client(): S3Client | null {
  if (!r2Client) {
    const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
    const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
    const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || R2_ACCESS_KEY_ID.includes('dummy')) {
      return null;
    }
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return r2Client;
}

/**
 * Download a previously-uploaded file as a Buffer by its storage fileKey + provider.
 */
export async function downloadFile(fileKey: string, provider?: string): Promise<Buffer | null> {
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'siksha-saathi';

  // R2 / S3
  if ((!provider || provider === 'r2') && getR2Client()) {
    try {
      const res = await getR2Client()!.send(
        new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: fileKey })
      );
      if (res.Body) {
        // Body is a stream; collect into Buffer
        const chunks: Buffer[] = [];
        for await (const chunk of res.Body as any) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        return Buffer.concat(chunks);
      }
    } catch (e: any) {
      console.error('R2 download error:', e.message);
    }
  }

  // Dropbox fallback
  if (provider === 'dropbox' || (!getR2Client() && fileKey.startsWith('/'))) {
    try {
      const link = await getDropboxTemporaryLink(fileKey);
      if (!link) return null;
      const r = await fetch(link);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    } catch (e: any) {
      console.error('Dropbox download error:', e.message);
    }
  }

  return null;
}
