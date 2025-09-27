import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { fetch } from 'undici';
import { logger } from '@vitrinealu/shared/logger';
import { driveHelpers } from '../lib/drive.js';
import { runOpencvPost } from '../lib/opencvPost.js';
import { TopazEnhancer } from '../providers/enhance/TopazEnhancer.js';
import { RealEsrganEnhancer } from '../providers/enhance/RealEsrganEnhancer.js';
import { NoopEnhancer } from '../providers/enhance/NoopEnhancer.js';
import { EnhanceProvider } from '../providers/enhance/EnhanceProvider.js';
import { EnhanceJobData, MediaJobResult } from './types.js';

type EnhanceResult = Extract<MediaJobResult, { kind: 'enhance' }>;

const providers: EnhanceProvider[] = [new TopazEnhancer(), new RealEsrganEnhancer(), new NoopEnhancer()];

const uploadBufferToReady = async (
  buffer: Buffer,
  metadata: { name?: string | null; mimeType?: string | null },
  suffix: string,
  mime: string
) => {
  const readyFolder = await driveHelpers.ensureReadyPath(new Date());
  const upload = await driveHelpers.uploadFile({
    name: metadata.name ? `${path.parse(metadata.name).name}-${suffix}${path.parse(metadata.name).ext}` : `asset-${suffix}.jpg`,
    mimeType: mime,
    data: buffer,
    parents: [readyFolder]
  });
  return upload;
};

export const enhanceJob = async (data: EnhanceJobData): Promise<EnhanceResult> => {
  let buffer: Buffer;
  let metadata: { name?: string | null; mimeType?: string | null } = {};

  if (data.assetId) {
    const [{ buffer: downloadedBuffer }, fileMetadata] = await Promise.all([
      driveHelpers.downloadFile(data.assetId),
      driveHelpers.getFileMetadata(data.assetId)
    ]);
    buffer = downloadedBuffer;
    metadata = fileMetadata;
  } else if (data.sourceUrl) {
    const response = await fetch(data.sourceUrl);
    buffer = Buffer.from(await response.arrayBuffer());
    metadata.mimeType = response.headers.get('content-type') || 'image/jpeg';
    metadata.name = `fetched-${crypto.randomUUID()}.jpg`;
  } else {
    throw new Error('No assetId or sourceUrl provided');
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'worker-enhance-'));
  const inputPath = path.join(tempDir, 'input.jpg');
  const providerOutputPath = path.join(tempDir, 'provider-output.jpg');
  const opencvOutputPath = path.join(tempDir, 'opencv-output.jpg');

  try {
    await writeFile(inputPath, buffer);

    let selectedProvider: EnhanceProvider | null = null;
    let providerResult: { scale: number; ms: number } | null = null;

    for (const provider of providers) {
      if (provider.isAvailable()) {
        try {
          providerResult = await provider.enhance(inputPath, providerOutputPath);
          selectedProvider = provider;
          break;
        } catch (error) {
          logger.warn({ err: error, provider: provider.name }, 'Enhancement provider failed, trying next');
        }
      }
    }

    if (!selectedProvider || !providerResult) {
      throw new Error('All enhancement providers failed');
    }

    // Run OpenCV post-processing
    await runOpencvPost(providerOutputPath, opencvOutputPath);

    // Preserve EXIF if exiftool is available
    try {
      const { spawn } = await import('node:child_process');
      await new Promise<void>((resolve, _reject) => {
        const child = spawn('exiftool', ['-TagsFromFile', inputPath, '-all:all', opencvOutputPath], { stdio: 'inherit' });
        child.on('error', () => resolve()); // Ignore if exiftool not available
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else resolve(); // Best-effort
        });
      });
    } catch {
      // Ignore EXIF preservation failures
    }

    const enhancedBuffer = await readFile(opencvOutputPath);
    const upload = await uploadBufferToReady(enhancedBuffer, metadata, 'enhanced', 'image/jpeg');
    const url = upload.webContentLink ?? upload.webViewLink ?? '';

    return {
      kind: 'enhance',
      url,
      fileId: upload.id,
      metadata: {
        provider: selectedProvider.name,
        scale: providerResult.scale,
        ms: providerResult.ms
      }
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};