/**
 * Cloudflare R2 Cloud Storage Service
 * Cloudflare R2 (S3-compatible, zero-cost egress) is the singular cloud storage
 * provider for Siksha Saathi, with local filesystem storage for offline development.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageProvider = 'r2' | 'local';

// Cloudflare R2 Config
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'siksha-saathi';
const R2_PUBLIC_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');

let r2Client: S3Client | null = null;

function getR2Client(): S3Client | null {
  if (!r2Client) {
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      R2_ACCESS_KEY_ID.includes('dummy')
    ) {
      return null;
    }

    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2Client;
}

// Active storage provider
function getActiveProvider(): StorageProvider {
  const envProvider = process.env.STORAGE_PROVIDER as StorageProvider;
  if (envProvider === 'r2' || envProvider === 'local') return envProvider;
  return getR2Client() ? 'r2' : 'local';
}

export interface UploadResult {
  provider: StorageProvider;
  fileKey: string;
  publicUrl?: string | null;
  size: number;
}

/**
 * Upload a file to Cloudflare R2 (or local disk in offline dev)
 */
export async function uploadStorageFile({
  filename,
  buffer,
  mimeType,
  folder = 'course_materials',
}: {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  folder?: string;
}): Promise<UploadResult> {
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileKey = `${folder}/${Date.now()}_${cleanName}`;
  const activeProvider = getActiveProvider();

  // 1. Explicit local storage provider (Docker volume / local disk)
  if (activeProvider === 'local') {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const storageDir = process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), '.storage');
      const localPath = path.join(storageDir, fileKey);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);

      return {
        provider: 'local',
        fileKey,
        publicUrl: null,
        size: buffer.length,
      };
    } catch (e: any) {
      console.warn('Could not write local storage file:', e.message);
    }
  }

  // 2. Cloudflare R2 Upload
  const client = getR2Client();
  if (client) {
    try {
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
      });

      await client.send(command);

      const publicUrl = R2_PUBLIC_DOMAIN
        ? `${R2_PUBLIC_DOMAIN}/${fileKey}`
        : null;

      return {
        provider: 'r2',
        fileKey,
        publicUrl,
        size: buffer.length,
      };
    } catch (err: any) {
      console.warn('Cloudflare R2 upload failed, falling back to local disk:', err.message);
    }
  }

  // 3. Fallback to local disk if R2 is not configured or fails
  try {
    const fs = await import('fs');
    const path = await import('path');
    const storageDir = process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), '.storage');
    const localPath = path.join(storageDir, fileKey);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
  } catch (e: any) {
    console.warn('Could not write local storage fallback file:', e.message);
  }

  return {
    provider: 'local',
    fileKey,
    publicUrl: null,
    size: buffer.length,
  };
}

/**
 * Generates an instant streaming preview URL
 */
export async function getStoragePreviewUrl({
  fileKey,
  provider,
  expiresIn = 3600, // 1 hour
}: {
  fileKey: string;
  provider?: StorageProvider;
  expiresIn?: number;
}): Promise<string> {
  const currentProvider = provider || getActiveProvider();

  if (currentProvider === 'r2') {
    if (R2_PUBLIC_DOMAIN) {
      return `${R2_PUBLIC_DOMAIN}/${fileKey}`;
    }

    const client = getR2Client();
    if (client) {
      try {
        const command = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileKey,
        });

        return await getSignedUrl(client, command, { expiresIn });
      } catch (err: any) {
        console.error('R2 presign preview error:', err.message);
      }
    }
  }

  return '';
}

/**
 * Generates a direct download URL
 */
export async function getStorageDownloadUrl({
  fileKey,
  filename,
  provider,
  expiresIn = 3600,
}: {
  fileKey: string;
  filename?: string;
  provider?: StorageProvider;
  expiresIn?: number;
}): Promise<string> {
  const currentProvider = provider || getActiveProvider();

  if (currentProvider === 'r2') {
    const client = getR2Client();
    if (client) {
      try {
        const command = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileKey,
          ResponseContentDisposition: `attachment; filename="${filename || fileKey.split('/').pop()}"`,
        });

        return await getSignedUrl(client, command, { expiresIn });
      } catch (err: any) {
        console.error('R2 presign download error:', err.message);
      }
    }
  }

  return '';
}

/**
 * Delete a file from Cloudflare R2 or local disk
 */
export async function deleteStorageFile({
  fileKey,
  provider,
}: {
  fileKey: string;
  provider?: StorageProvider;
}): Promise<boolean> {
  const currentProvider = provider || getActiveProvider();

  if (currentProvider === 'r2') {
    const client = getR2Client();
    if (client) {
      try {
        const command = new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileKey,
        });
        await client.send(command);
        return true;
      } catch (err: any) {
        console.error('R2 delete error:', err.message);
      }
    }
  }

  // Local storage file deletion
  try {
    const fs = await import('fs');
    const path = await import('path');
    const storageDir = process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), '.storage');
    const localPath = path.join(storageDir, fileKey);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    return true;
  } catch {
    return false;
  }
}
