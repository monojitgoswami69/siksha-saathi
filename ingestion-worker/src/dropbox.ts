import { Dropbox } from 'dropbox';

const APP_KEY = process.env.DROPBOX_APP_KEY || '';
const APP_SECRET = process.env.DROPBOX_APP_SECRET || '';
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || '';

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

export async function getDropboxTemporaryLink(path: string): Promise<string> {
  const client = getDropboxClient();
  if (!client) return '';
  try {
    const res = await client.filesGetTemporaryLink({ path });
    return res.result.link;
  } catch (err: any) {
    console.error('Dropbox getTemporaryLink error:', err.message);
    return '';
  }
}
