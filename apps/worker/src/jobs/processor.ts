import path from 'node:path';
import crypto from 'node:crypto';
import {
  copyFile,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { fetch } from 'undici';
import { decode } from 'jpeg-js';
import { logger } from '@vitrinealu/shared/logger';
import { driveHelpers } from '../lib/drive.js';
import { computeSha256 } from '../lib/hashing.js';
import { getSupabase } from '../lib/supabase.js';
import { env } from '../config.js';
import { enhanceJob } from './enhance.js';
import { captionJob } from './caption.js';
// import { runBackgroundTask } from '@vitrinealu/n8n-orchestrator';
import { backgroundEvents } from '../events/backgroundEvents.js';

// Mock runBackgroundTask until orchestrator is built
interface BackgroundJob {
  mediaId: string;
  inputPath: string;
  outputPath: string;
  projectId: string;
  product?: string;
  tags: string[];
  preset?: string;
  overrides?: Record<string, unknown>;
  maskPath?: string;
  seed?: number;
}

const runBackgroundTask = async (job: BackgroundJob) => {
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    engine: 'mock',
    preset: 'mock-preset',
    seed: 42,
    artifacts: {
      output: `https://example.com/output/${job.mediaId}.png`,
      mask: `https://example.com/mask/${job.mediaId}.png`
    },
    metrics: {
      elapsed_ms: 1000
    }
  };
};
import {
  MediaJobData,
  MediaJobResult,
  HashJobData,
  ScoreJobData,
  PrivacyBlurJobData,
  BackgroundCleanupJobData,
  ReelJobData,
  LinkedinJobData,
  CaptionJobData,
  BackgroundReplaceJobData,
  hashJobSchema,
  scoreJobSchema,
  privacyBlurJobSchema,
  backgroundCleanupJobSchema,
  reelJobSchema,
  linkedinJobSchema,
  captionJobSchema,
  backgroundReplaceJobSchema
} from './types.js';

type HashResult = Extract<MediaJobResult, { kind: 'hash' }>;
type ScoreResult = Extract<MediaJobResult, { kind: 'score' }>;
type PrivacyResult = Extract<MediaJobResult, { kind: 'privacyBlur' }>;
type CleanupResult = Extract<MediaJobResult, { kind: 'backgroundCleanup' }>;
type ReelResult = Extract<MediaJobResult, { kind: 'videoReel' }>;
type LinkedinResult = Extract<MediaJobResult, { kind: 'videoLinkedin' }>;
type CaptionResult = Extract<MediaJobResult, { kind: 'caption' }>;
type BackgroundReplaceResult = Extract<MediaJobResult, { kind: 'backgroundReplace' }>;

const supabase = (() => {
  try {
    return getSupabase();
  } catch (error) {
    logger.warn({ err: error }, 'Supabase client unavailable');
    return null;
  }
})();

const logResult = async (operation: string, payload: Record<string, unknown>) => {
  if (!supabase) {
    return;
  }
  try {
    await supabase.from('worker_operations').insert({ operation, payload, created_at: new Date().toISOString() });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to log operation to Supabase');
  }
};

const ensureNameWithSuffix = (originalName: string | null | undefined, suffix: string, extensionFallback: string) => {
  const base = originalName ? path.parse(originalName).name : 'asset';
  const ext = originalName ? path.parse(originalName).ext || extensionFallback : extensionFallback;
  return `${base}-${suffix}${ext}`;
};

const uploadBufferToReady = async (
  buffer: Buffer,
  metadata: { name?: string | null; mimeType?: string | null },
  suffix: string,
  mime: string
) => {
  const readyFolder = await driveHelpers.ensureReadyPath(new Date());
  const upload = await driveHelpers.uploadFile({
    name: ensureNameWithSuffix(metadata.name ?? undefined, suffix, '.jpg'),
    mimeType: mime,
    data: buffer,
    parents: [readyFolder]
  });
  return upload;
};

const cloneFileToReady = async (
  fileId: string,
  suffix: string,
  mimeTypeFallback = 'application/octet-stream'
) => {
  const [{ buffer }, metadata] = await Promise.all([
    driveHelpers.downloadFile(fileId),
    driveHelpers.getFileMetadata(fileId)
  ]);
  const upload = await uploadBufferToReady(buffer, metadata, suffix, metadata.mimeType ?? mimeTypeFallback);
  await logResult('drive_upload', {
    sourceFileId: fileId,
    createdFileId: upload.id,
    suffix
  });
  return upload;
};

const hashJob = async (data: HashJobData): Promise<HashResult> => {
  const parsed = hashJobSchema.parse(data);
  const { buffer } = await driveHelpers.downloadFile(parsed.fileId);
  const hash = computeSha256(buffer);
  await logResult('hash', { fileId: parsed.fileId, hash });
  return { kind: 'hash', hash };
};

const computeImageFeature = (buffer: Buffer): number => {
  const decoded = decode(buffer, { useTArray: true });
  if (!decoded.width || !decoded.height) {
    throw new Error('Failed to decode JPEG');
  }
  const { data } = decoded;
  let sum = 0;
  const pixelCount = decoded.width * decoded.height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += (r + g + b) / 3;
  }
  const mean = sum / pixelCount;
  return mean / 255;
};

const scoreJob = async (data: ScoreJobData): Promise<ScoreResult> => {
  const parsed = scoreJobSchema.parse(data);
  const { buffer } = await driveHelpers.downloadFile(parsed.fileId);
  const feature = computeImageFeature(buffer);
  // const score = await evaluateAestheticScore(feature);
  const score = 0.8; // Mock score until ONNX is fixed
  const isCandidate = score >= env.AESTHETIC_THRESHOLD;
  await logResult('score', { fileId: parsed.fileId, score, isCandidate, feature });
  return { kind: 'score', score, isCandidate };
};

const privacyJob = async (data: PrivacyBlurJobData): Promise<PrivacyResult> => {
  const parsed = privacyBlurJobSchema.parse(data);
  const upload = await cloneFileToReady(parsed.fileId, 'safe');
  const url = upload.webContentLink ?? upload.webViewLink ?? '';
  await logResult('privacy_blur', { fileId: parsed.fileId, newFileId: upload.id, url });
  return { kind: 'privacyBlur', url };
};

const cleanupJob = async (data: BackgroundCleanupJobData): Promise<CleanupResult> => {
  const parsed = backgroundCleanupJobSchema.parse(data);
  const mode = parsed.mode ?? 'clean';
  const suffix = mode === 'replace' ? 'background-replace' : 'background-clean';
  const upload = await cloneFileToReady(parsed.fileId, suffix);
  const url = upload.webContentLink ?? upload.webViewLink ?? '';
  await logResult('background_cleanup', {
    fileId: parsed.fileId,
    newFileId: upload.id,
    url,
    mode,
    prompt: parsed.prompt
  });
  return { kind: 'backgroundCleanup', url };
};

const videoReelJob = async (data: ReelJobData): Promise<ReelResult> => {
  const parsed = reelJobSchema.parse(data);
  const firstAsset = parsed.assetIds[0];
  const upload = await cloneFileToReady(firstAsset, 'reel', 'video/mp4');
  const url = upload.webContentLink ?? upload.webViewLink ?? '';
  const thumbUrl = url.replace(/\/view\?.*/, '') + '?thumb=reel';
  await logResult('video_reel', {
    assetIds: parsed.assetIds,
    newFileId: upload.id,
    url,
    thumbUrl,
    music: parsed.music,
    overlays: parsed.textOverlays
  });
  return { kind: 'videoReel', mp4Url: url, thumbUrl };
};

const videoLinkedinJob = async (data: LinkedinJobData): Promise<LinkedinResult> => {
  const parsed = linkedinJobSchema.parse(data);
  const firstAsset = parsed.assetIds[0];
  const upload = await cloneFileToReady(firstAsset, 'linkedin', 'video/mp4');
  const url = upload.webContentLink ?? upload.webViewLink ?? '';
  const thumbUrl = url.replace(/\/view\?.*/, '') + '?thumb=linkedin';
  await logResult('video_linkedin', {
    assetIds: parsed.assetIds,
    newFileId: upload.id,
    url,
    thumbUrl,
    narration: parsed.narration
  });
  return { kind: 'videoLinkedin', mp4Url: url, thumbUrl };
};

const captionJob = async (data: CaptionJobData): Promise<CaptionResult> => {
  const parsed = captionJobSchema.parse(data);
  const result = await captionJob(parsed);
  await logResult('caption', { channel: parsed.channel, caption: result.caption, hashtags: result.hashtags });
  return { kind: 'caption', ...result };
};

const backgroundReplaceJob = async (data: BackgroundReplaceJobData): Promise<BackgroundReplaceResult> => {
  const parsed = backgroundReplaceJobSchema.parse(data);
  const jobId = crypto.randomUUID();

  // Generate output path
  const outputPath = `/tmp/background-${parsed.mediaId}-${Date.now()}.png`; // TODO: proper path

  // Emit started event
  backgroundEvents.emit('backgroundJobStarted', {
    jobId,
    mediaId: parsed.mediaId,
    projectId: parsed.projectId,
    inputPath: parsed.inputPath,
    callbackUrl: parsed.callbackUrl
  });

  try {
    // Call orchestrator
    const result = await runBackgroundTask({
      mediaId: parsed.mediaId,
      inputPath: parsed.inputPath,
      outputPath,
      projectId: parsed.projectId,
      product: parsed.product,
      tags: parsed.tags || [],
      preset: parsed.preset,
      overrides: parsed.overrides,
      maskPath: parsed.maskPath,
      seed: parsed.seed
    });

    if (!result) {
      throw new Error('Background task returned null');
    }

    // Emit success event
    backgroundEvents.emit('backgroundJobSucceeded', {
      jobId,
      mediaId: parsed.mediaId,
      projectId: parsed.projectId,
      outputUrl: result.artifacts.output,
      callbackUrl: parsed.callbackUrl
    });

    await logResult('background_replace', {
      mediaId: parsed.mediaId,
      projectId: parsed.projectId,
      outputUrl: result.artifacts.output,
      engine: result.engine,
      preset: result.preset,
      seed: result.seed,
      elapsedMs: result.metrics.elapsed_ms
    });

    return { kind: 'backgroundReplace', jobId };
  } catch (error) {
    // Emit failed event
    backgroundEvents.emit('backgroundJobFailed', {
      jobId,
      mediaId: parsed.mediaId,
      projectId: parsed.projectId,
      error: error instanceof Error ? error.message : 'Unknown error',
      callbackUrl: parsed.callbackUrl
    });

    throw error;
  }
};

export const processMediaJob = async (data: MediaJobData): Promise<MediaJobResult> => {
  switch (data.kind) {
    case 'hash':
      return hashJob({ fileId: data.fileId });
    case 'score':
      return scoreJob({ fileId: data.fileId });
    case 'enhance':
      return enhanceJob(data);
    case 'privacyBlur':
      return privacyJob({ fileId: data.fileId });
    case 'backgroundCleanup':
      return cleanupJob({ fileId: data.fileId, mode: data.mode, prompt: data.prompt });
    case 'backgroundReplace':
      return backgroundReplaceJob(data);
    case 'videoReel':
      return videoReelJob({ assetIds: data.assetIds, music: data.music, textOverlays: data.textOverlays });
    case 'videoLinkedin':
      return videoLinkedinJob({ assetIds: data.assetIds, narration: data.narration });
    case 'caption':
      return captionJob({ context: data.context, channel: data.channel });
    default:
      throw new Error(`Unsupported job kind ${(data as { kind: string }).kind}`);
  }
};
