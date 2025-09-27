import fs from 'node:fs/promises';
import path from 'node:path';
import { google, drive_v3 } from 'googleapis';
import { env } from '../config.js';
import { logger } from '@vitrinealu/shared/logger';

interface UploadOptions {
  name: string;
  mimeType: string;
  data: Buffer;
  parents?: string[];
}

const serviceAccountJson = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  logger.warn('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not configured; Drive helper will throw on use');
}

let driveClient: drive_v3.Drive | null = null;

const getDriveClient = (): drive_v3.Drive => {
  if (!serviceAccountJson) {
    throw new Error('Missing GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON');
  }
  if (driveClient) {
    return driveClient;
  }
  const credentials = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
};

export const driveHelpers = {
  async getFileMetadata(fileId: string): Promise<drive_v3.Schema$File> {
    const drive = getDriveClient();
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, createdTime, webViewLink'
    });
    return response.data;
  },

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; cachePath: string }> {
    const cachePath = path.join(env.GOOGLE_DRIVE_CACHE_DIR, `${fileId}.bin`);
    try {
      const cached = await fs.readFile(cachePath);
      return { buffer: cached, cachePath };
    } catch {
      // cache miss - download from Drive
    }
    const drive = getDriveClient();
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const data = Buffer.from(response.data as ArrayBuffer);
    await fs.writeFile(cachePath, data);
    return { buffer: data, cachePath };
  },

  async uploadFile(options: UploadOptions): Promise<drive_v3.Schema$File> {
    const drive = getDriveClient();
    const { name, mimeType, data, parents } = options;
    const media = {
      mimeType,
      body: data
    };
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType,
        parents
      },
      media,
      fields: 'id, name, mimeType, webViewLink, webContentLink'
    });
    return response.data;
  },

  async ensureFolder({ parentId, folderName }: { parentId?: string; folderName: string }): Promise<string> {
    const drive = getDriveClient();
    const escapedName = folderName.replace(/'/g, '\\u0027');
    const qParts = [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${escapedName}'`,
      'trashed = false'
    ];
    if (parentId) {
      qParts.push(`'${parentId}' in parents`);
    }
    const response = await drive.files.list({
      q: qParts.join(' and '),
      fields: 'files(id, name)',
      pageSize: 1
    });
    const existing = response.data.files?.[0];
    if (existing?.id) {
      return existing.id;
    }
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined
      },
      fields: 'id'
    });
    if (!created.data.id) {
      throw new Error(`Failed to create folder ${folderName}`);
    }
    return created.data.id;
  },

  async ensureReadyPath(date: Date): Promise<string> {
    const yearMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const readyRoot = env.GOOGLE_READY_PARENT_ID || (await driveHelpers.ensureFolder({ folderName: 'ready' }));
    return driveHelpers.ensureFolder({ parentId: readyRoot, folderName: yearMonth });
  },

  async ensureSourcePath(): Promise<string> {
    return driveHelpers.ensureFolder({ folderName: 'source' });
  }
};
