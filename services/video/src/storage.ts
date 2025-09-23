import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { AppConfig } from './types.js';

const SUPPORTED_IMAGE_EXT = ['.png', '.jpg', '.jpeg'];

export function ensureDirectories(config: AppConfig): void {
  fs.mkdirSync(config.rendersPath, { recursive: true });
}

export function resolveSourceAsset(config: AppConfig, assetId: string): string {
  const readyRoot = config.readyPath;
  if (!fs.existsSync(readyRoot)) {
    throw new Error('ready directory not found: ' + readyRoot);
  }
  const dateDirs = fs.readdirSync(readyRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const dir of dateDirs) {
    const assetDir = path.join(readyRoot, dir.name, assetId);
    if (fs.existsSync(assetDir) && fs.statSync(assetDir).isDirectory()) {
      const files = fs.readdirSync(assetDir);
      const match = files.find((file) => SUPPORTED_IMAGE_EXT.includes(path.extname(file).toLowerCase()));
      if (match) {
        return path.join(assetDir, match);
      }
    }
  }
  throw new Error('asset ' + assetId + ' not found under ' + readyRoot);
}

export function prepareOutputPath(config: AppConfig, assetId: string, extension = '.mp4'): {
  filePath: string;
  relativeUrl: string;
} {
  ensureDirectories(config);
  const assetDir = path.join(config.rendersPath, assetId);
  fs.mkdirSync(assetDir, { recursive: true });
  const filename = Date.now().toString() + '-' + randomUUID() + extension;
  const filePath = path.join(assetDir, filename);
  const relativeUrl = path.posix.join('/assets/renders', assetId, filename);
  return { filePath, relativeUrl };
}

export async function writeVideoFile(filePath: string, data: Buffer): Promise<void> {
  await fs.promises.writeFile(filePath, data);
}
