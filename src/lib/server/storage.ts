/**
 * Unified Cloud Storage Service
 * Supports Cloudflare R2 (Default & Recommended - 0$ Egress) with Dropbox Fallback.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  uploadToDropbox,
  getDropboxTemporaryLink,
  deleteFromDropbox,
} from './dropbox';

export type StorageProvider = 'r2' | 'dropbox';

// Active storage provider (Defaults to 'r2' if configured or specified)
const ACTIVE_PROVIDER: StorageProvider =
  (process.env.STORAGE_PROVIDER as StorageProvider) || 'r2';

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

export interface UploadResult {
  provider: StorageProvider;
  fileKey: string;
  publicUrl?: string | null;
  size: number;
}

/**
 * Upload a file to active storage (R2 preferred, Dropbox fallback)
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

  const client = getR2Client();

  if (ACTIVE_PROVIDER === 'r2' && client) {
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
      console.warn('Cloudflare R2 upload failed, falling back to Dropbox:', err.message);
    }
  }

  // Fallback to Dropbox if R2 is not configured or fails
  try {
    const dropboxRes = await uploadToDropbox(cleanName, buffer);

    return {
      provider: 'dropbox',
      fileKey: dropboxRes.path,
      publicUrl: dropboxRes.sharedUrl,
      size: dropboxRes.size,
    };
  } catch (dbxErr) {
    // If both are mock / unconfigured in local dev
    return {
      provider: 'r2',
      fileKey,
      publicUrl: null,
      size: buffer.length,
    };
  }
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
  const currentProvider = provider || ACTIVE_PROVIDER;

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

  // Dropbox link fallback
  try {
    const link = await getDropboxTemporaryLink(fileKey);
    if (link) return link;
  } catch {}

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
  const currentProvider = provider || ACTIVE_PROVIDER;

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

  // Dropbox link fallback
  try {
    const link = await getDropboxTemporaryLink(fileKey);
    if (link) return link;
  } catch {}

  return '';
}

/**
 * Delete a file from Cloudflare R2 or Dropbox
 */
export async function deleteStorageFile({
  fileKey,
  provider,
}: {
  fileKey: string;
  provider?: StorageProvider;
}): Promise<boolean> {
  const currentProvider = provider || ACTIVE_PROVIDER;

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

  // Dropbox delete
  try {
    await deleteFromDropbox(fileKey);
    return true;
  } catch {
    return false;
  }
}
