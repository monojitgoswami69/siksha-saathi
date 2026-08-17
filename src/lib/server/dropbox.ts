/**
 * Dropbox Storage Service
 * Handles uploading, generating preview links, downloads, and deletions via the Dropbox SDK.
 */

import { Dropbox } from 'dropbox';

const APP_KEY = process.env.DROPBOX_APP_KEY || '';
const APP_SECRET = process.env.DROPBOX_APP_SECRET || '';
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || '';
const FOLDER_PATH = (process.env.DROPBOX_FOLDER_PATH || '/siksha_saathi').replace(/\/$/, '');

let dbxClient: Dropbox | null = null;

function getDropboxClient(): Dropbox | null {
  if (!dbxClient) {
    if (!APP_KEY || !APP_SECRET || !REFRESH_TOKEN || APP_KEY.includes('dummy')) {
      return null;
    }
    dbxClient = new Dropbox({
      clientId: APP_KEY,
      clientSecret: APP_SECRET,
      refreshToken: REFRESH_TOKEN,
    });
  }
  return dbxClient;
}

export interface DropboxUploadResult {
  path: string;
  sharedUrl: string | null;
  size: number;
}

/**
 * Uploads a file buffer to Dropbox
 */
export async function uploadToDropbox(
  filename: string,
  buffer: Buffer
): Promise<DropboxUploadResult> {
  const client = getDropboxClient();
  const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const dropboxPath = `${FOLDER_PATH}/${safeFilename}`;

  if (!client) {
    // Return mock path for development
    return {
      path: dropboxPath,
      sharedUrl: null,
      size: buffer.length,
    };
  }

  try {
    const uploadRes = await client.filesUpload({
      path: dropboxPath,
      contents: buffer,
      mode: { '.tag': 'overwrite' },
    });

    let sharedUrl: string | null = null;
    try {
      const linkRes = await client.sharingCreateSharedLinkWithSettings({
        path: dropboxPath,
      });
      sharedUrl = linkRes.result.url;
    } catch (e: any) {
      // If shared link already exists, fetch it
      try {
        const existingLinks = await client.sharingListSharedLinks({
          path: dropboxPath,
          direct_only: true,
        });
        if (existingLinks.result.links.length > 0) {
          sharedUrl = existingLinks.result.links[0].url;
        }
      } catch {}
    }

    return {
      path: uploadRes.result.path_display || dropboxPath,
      sharedUrl,
      size: uploadRes.result.size,
    };
  } catch (err: any) {
    console.error('Dropbox upload error:', err);
    throw err;
  }
}

/**
 * Gets a temporary direct download/preview link for a Dropbox file
 */
export async function getDropboxTemporaryLink(path: string): Promise<string> {
  const client = getDropboxClient();
  if (!client) {
    return '';
  }

  try {
    const res = await client.filesGetTemporaryLink({ path });
    return res.result.link;
  } catch (err: any) {
    console.error('Dropbox getTemporaryLink error:', err);
    throw err;
  }
}

/**
 * Deletes a file from Dropbox
 */
export async function deleteFromDropbox(path: string): Promise<void> {
  const client = getDropboxClient();
  if (!client) return;

  try {
    await client.filesDeleteV2({ path });
  } catch (err: any) {
    console.warn(`Dropbox delete warning for ${path}:`, err.message);
  }
}
