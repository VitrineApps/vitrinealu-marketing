import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, extname } from 'path';
import { FFmpegWrapper } from './ffmpeg';
import { loadBrandKit, getDefaultBrandKit, resolveWatermarkPath } from './brandKit';
import { getVideoProfile, generateVideoCodecSettings, generateAudioCodecSettings, generateOutputSettings } from './profiles';
import { getKenBurnsEffect, generateKenBurnsFilter, calculateTransitionTimings } from './kenburns';
import { generateWatermarkFilter, generateAssSubtitles, parseCaptionJson, calculateSafeArea } from './overlays';
import { AssembleJob, AssembleResult, ClipInput, BrandKit, VideoProfile, KenBurnsEffect } from './types';
import pino from 'pino';
import { Semaphore } from './utils';


const logger = pino({ name: 'job-runner' });

// Concurrency guard
const maxConcurrency = parseInt(process.env.VIDEO_MAX_CONCURRENCY || '2', 10);
const semaphore = new Semaphore(maxConcurrency);

// Default job timeout (ms)
const JOB_TIMEOUT_MS = parseInt(process.env.VIDEO_JOB_TIMEOUT_MS || '600000', 10);

/**
 * JobRunner class for backward compatibility with CLI
 */
export class JobRunner {
  private ffmpegPath?: string;
  public ffmpeg: { checkAvailability: () => Promise<boolean> };

  constructor(ffmpegPath?: string) {
    this.ffmpegPath = ffmpegPath;
    this.ffmpeg = {
      checkAvailability: async () => {
        // Simple availability check - could implement proper FFmpeg check
        return true;
      }
    };
  }

  /**
   * Load job configuration (for CLI compatibility)
   */
  async loadJobConfig(_inputDir: string): Promise<AssembleJob> {
    // This would need proper implementation to load from captions.json
    return {
      profile: 'reel',
      clips: [],
      outPath: '',
      seed: 42,
    };
  }

  /**
   * Run a job from legacy interface
   */
  async runJob(options: {
    inputDir?: string;
    outputPath?: string;
    profile?: string;
    brandKit?: string;
    watermark?: boolean;
    music?: string;
    fps?: number;
    bitrate?: string;
  }): Promise<string> {
    // Convert legacy options to AssembleJob
    const job: AssembleJob = {
      profile: (options.profile as 'reel' | 'linkedin') || 'reel',
      clips: [], // This would need to be loaded from the inputDir
      outPath: options.outputPath || '',
      seed: 42,
    };

    const result = await assemble(job);
    return result.outPath;
  }
}

/**
 * Main assembly function
 */
export async function assemble(job: AssembleJob): Promise<AssembleResult> {
  const release = await semaphore.acquire();
  const startWall = Date.now();
  let retries = 0;
  let ffmpegProc: any = null;
  let timedOut = false;
  let result: AssembleResult;
  let error: any = null;
  try {
    logger.info({ profile: job.profile, clipCount: job.clips.length }, 'Starting video assembly');
    // Validate inputs
    await validateJob(job);
    // Load brand kit
    const brandKit = await loadBrandKitSafely(job.brandPath);
    // Get video profile
    const profile = getVideoProfile(job.profile);
    // Setup FFmpeg
    const ffmpeg = new FFmpegWrapper();
    // Ensure output directory exists
    const outputDir = dirname(job.outPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    // Process clips
    const processedClips = await processClips(job.clips, profile, brandKit, job.seed || 42);

    // Timeout logic
    const jobPromise = (async () => {
      // Patch FFmpegWrapper to expose process for kill
      const origRunCommand = ffmpeg.runCommand.bind(ffmpeg);
      ffmpeg.runCommand = async (command: any) => {
        return new Promise((resolve, reject) => {
          const proc = command.spawn();
          ffmpegProc = proc;
          proc.on('close', (code: number) => {
            ffmpegProc = null;
            if (code === 0) resolve(undefined);
            else reject(new Error(`ffmpeg exited with code ${code}`));
          });
          proc.on('error', reject);
        });
      };
      return await generateVideo(
        processedClips,
        job,
        profile,
        brandKit,
        ffmpeg
      );
    })();

    result = await Promise.race([
      jobPromise,
      new Promise<never>((_, reject) => setTimeout(() => {
        timedOut = true;
        if (ffmpegProc) {
          ffmpegProc.kill('SIGKILL');
        }
        reject(new Error('Video job timed out'));
      }, JOB_TIMEOUT_MS))
    ]);

    const wallMs = Date.now() - startWall;
    logger.info({ outPath: job.outPath, duration: result.duration, wallMs }, 'Video assembly completed');
    // Emit structured metrics
    logger.info({
      adapter: 'ffmpeg',
      profile: job.profile,
      durationSec: result.duration,
      wallMs,
      retries
    }, 'video_job_metrics');
    return result;
  } catch (err) {
    error = err;
    logger.error({ err, timedOut }, 'Video assembly failed');
    throw err;
  } finally {
    release();
  }
}

/**
 * Validate job inputs
 */
async function validateJob(job: AssembleJob): Promise<void> {
  if (!job.clips || job.clips.length === 0) {
    throw new Error('At least one clip is required');
  }
  
  if (!job.outPath) {
    throw new Error('Output path is required');
  }
  
  // Validate clip files exist
  for (const [index, clip] of job.clips.entries()) {
    if (!existsSync(clip.image)) {
      throw new Error(`Clip ${index} image not found: ${clip.image}`);
    }
  }
  
  // Validate music file if provided
  if (job.musicPath && !existsSync(job.musicPath)) {
    throw new Error(`Music file not found: ${job.musicPath}`);
  }
  
  // Validate watermark if provided
  if (job.watermarkPath && !existsSync(job.watermarkPath)) {
    throw new Error(`Watermark file not found: ${job.watermarkPath}`);
  }
}

/**
 * Load brand kit with fallbacks
 */
async function loadBrandKitSafely(brandPath?: string): Promise<BrandKit> {
  if (brandPath) {
    try {
      return await loadBrandKit(brandPath);
    } catch (error) {
      logger.warn({ error, brandPath }, 'Failed to load brand kit, using default');
    }
  }
  
  return getDefaultBrandKit();
}

/**
 * Process clips with Ken Burns effects
 */
async function processClips(
  clips: ClipInput[],
  profile: VideoProfile,
  brandKit: BrandKit,
  seed: number
): Promise<ProcessedClip[]> {
  const processedClips: ProcessedClip[] = [];
  
  for (const [index, clip] of clips.entries()) {
    const duration = clip.durationSec || 3;
    
    // Generate deterministic Ken Burns effect
    const clipSeed = seed + index;
    const kenBurnsEffect = getKenBurnsEffect(
      clip.pan || 'center',
      clip.zoom || 'none',
      clipSeed
    );
    
    processedClips.push({
      ...clip,
      index,
      duration,
      kenBurnsEffect,
    });
  }
  
  return processedClips;
}

/**
 * Generate the final video
 */
async function generateVideo(
  clips: ProcessedClip[],
  job: AssembleJob,
  profile: VideoProfile,
  brandKit: BrandKit,
  ffmpeg: FFmpegWrapper
): Promise<AssembleResult> {
  const command = ffmpeg.createCommand();
  
  // Add input clips
  clips.forEach(clip => {
    command.input(clip.image);
  });
  
  // Add music if provided
  if (job.musicPath) {
    command.input(job.musicPath);
  }
  
  // Build filter complex
  const filters: string[] = [];
  
  // Process each clip with Ken Burns
  clips.forEach((clip, index) => {
    const kenBurnsFilter = generateKenBurnsFilter(
      clip.kenBurnsEffect,
      clip.duration,
      1920, // Assume input width - would get from image probe in production
      1080, // Assume input height
      profile.width,
      profile.height
    );
    
    filters.push(`[${index}:v]${kenBurnsFilter}[clip${index}]`);
  });
  
  // Add transitions between clips
  const transitionDuration = 0.5;
  const timings = calculateTransitionTimings(
    clips.map(c => c.duration),
    transitionDuration
  );
  
  // Concatenate clips with crossfades
  if (clips.length > 1) {
    let concatInput = '[clip0]';
    for (let i = 1; i < clips.length; i++) {
      const fadeFilter = `${concatInput}[clip${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${timings[i-1]?.offset || 0}`;
      if (i === clips.length - 1) {
        filters.push(`${fadeFilter}[video]`);
      } else {
        filters.push(`${fadeFilter}[concat${i}]`);
        concatInput = `[concat${i}]`;
      }
    }
  } else {
    filters.push('[clip0]copy[video]');
  }
  
  // Add watermark if configured
  const watermarkPath = job.watermarkPath || resolveWatermarkPath(brandKit, job.brandPath || '');
  if (watermarkPath && existsSync(watermarkPath)) {
    command.input(watermarkPath);
    const watermarkFilter = generateWatermarkFilter(
      watermarkPath,
      profile,
      brandKit.watermark?.opacity || 0.8,
      brandKit.watermark?.margin_px || 48
    );
    filters.push(watermarkFilter.replace('[in]', '[video]').replace('[out]', '[video_wm]'));
  }
  
  // Add captions if provided
  let finalVideoLabel = watermarkPath ? '[video_wm]' : '[video]';
  if (job.captionJson) {
    const captions = parseCaptionJson(job.captionJson);
    if (captions.length > 0) {
      const safeArea = calculateSafeArea(job.profile, brandKit);
      const assContent = generateAssSubtitles(captions, profile, brandKit, safeArea);
      
      // Write ASS file
      const assPath = job.outPath.replace(extname(job.outPath), '.ass');
      writeFileSync(assPath, assContent);
      
      filters.push(`${finalVideoLabel}subtitles=${assPath.replace(/\\/g, '/')}[video_final]`);
      finalVideoLabel = '[video_final]';
    }
  }
  
  // Apply filters
  command.complexFilter(filters);
  
  // Add audio processing
  if (job.musicPath) {
    // Normalize audio to -23 LUFS and mix with video  
    const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0) - (transitionDuration * (clips.length - 1));
    command.outputOptions([
      '-af', `loudnorm=I=-23:TP=-2:LRA=7,atrim=duration=${totalDuration}`
    ]);
  }
  
  // Apply codec settings
  const videoSettings = generateVideoCodecSettings(profile);
  const audioSettings = generateAudioCodecSettings();
  const outputSettings = generateOutputSettings(profile);
  
  // Add video settings
  command.outputOptions(videoSettings);
  
  // Add audio settings
  command.outputOptions(audioSettings);
  
  // Add output format settings
  command.outputOptions(outputSettings);
  
  // Set output
  command.output(job.outPath);
  
  // Run the command
  await ffmpeg.runCommand(command);
  
  // Get final duration
  const duration = await ffmpeg.getVideoDuration(job.outPath);
  
  return {
    outPath: job.outPath,
    duration,
  };
}

interface ProcessedClip extends ClipInput {
  index: number;
  duration: number;
  kenBurnsEffect: KenBurnsEffect;
}