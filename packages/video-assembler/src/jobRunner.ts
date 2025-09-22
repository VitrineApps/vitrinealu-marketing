import { promises as fs } from 'fs';
import path from 'path';
import { Job, JobSchema, VideoAssemblerOptions, PLATFORM_PRESETS, OutputSpec, BrandKit } from './types';
import { FfmpegBackend } from './ffmpegBackend';
import { BrandKitLoader } from './brandKit';
import { logger } from './logger';

export class JobRunner {
  public ffmpeg: FfmpegBackend;

  constructor(ffmpegPath?: string) {
    this.ffmpeg = new FfmpegBackend(ffmpegPath);
  }

  /**
   * Run a video assembly job
   */
  async runJob(options: VideoAssemblerOptions): Promise<string> {
    logger.info({ msg: 'Starting video assembly job', options });

    try {
      // Load and validate job configuration
      const job = await this.loadJobConfig(options.inputDir);

      // Load brand kit
      const brandKit = await this.loadBrandKit(options);

      // Determine output spec
      const outputSpec = this.getOutputSpec(job, options);

      // Validate inputs
      await this.validateInputs(job, options.inputDir);

      // Create output directory
      await fs.mkdir(path.dirname(options.outputPath), { recursive: true });

      // Generate video from images
      const tempVideoPath = options.outputPath.replace('.mp4', '_temp.mp4');
      await this.ffmpeg.createVideoFromImages(
        job.clips,
        outputSpec,
        tempVideoPath,
        options.inputDir
      );

      // Add captions if present
      let currentVideoPath = tempVideoPath;
      if (this.hasCaptions(job)) {
        const captionedPath = options.outputPath.replace('.mp4', '_captioned.mp4');
        await this.addCaptions(job, outputSpec, currentVideoPath, captionedPath, brandKit);
        currentVideoPath = captionedPath;

        // Clean up temp file
        await fs.unlink(tempVideoPath).catch(() => {});
      }

      // Add watermark if enabled
      if (options.watermark && brandKit.watermark?.path) {
        const watermarkedPath = options.outputPath.replace('.mp4', '_watermarked.mp4');
        await this.ffmpeg.addWatermark(
          currentVideoPath,
          brandKit.watermark.path,
          watermarkedPath,
          {
            scale: brandKit.watermark.scale,
            opacity: brandKit.watermark.opacity,
            position: brandKit.watermark.position,
          }
        );
        currentVideoPath = watermarkedPath;

        // Clean up previous temp file
        if (currentVideoPath !== tempVideoPath) {
          await fs.unlink(currentVideoPath.replace('_watermarked.mp4', '_captioned.mp4')).catch(() => {});
        }
      }

      // Add audio if specified
      if (options.music || job.music) {
        const musicPath = options.music || job.music!;
        if (await this.fileExists(musicPath)) {
          const finalPath = options.outputPath;
          await this.ffmpeg.addAudio(currentVideoPath, musicPath, finalPath);
          currentVideoPath = finalPath;

          // Clean up watermarked file
          if (currentVideoPath !== tempVideoPath) {
            await fs.unlink(currentVideoPath.replace('.mp4', '_watermarked.mp4')).catch(() => {});
          }
        } else {
          logger.warn({ msg: 'Music file not found', path: musicPath });
        }
      } else {
        // No audio to add, just rename final file
        if (currentVideoPath !== options.outputPath) {
          await fs.rename(currentVideoPath, options.outputPath);
        }
      }

      // Verify output
      const stats = await fs.stat(options.outputPath);
      logger.info({
        msg: 'Video assembly completed',
        outputPath: options.outputPath,
        size: stats.size,
        duration: await this.getVideoDuration(options.outputPath)
      });

      return options.outputPath;

    } catch (error) {
      logger.error({ msg: 'Job failed', error });
      throw error;
    }
  }

  /**
   * Load job configuration from captions.json
   */
  async loadJobConfig(inputDir: string): Promise<Job> {
    const configPath = path.join(inputDir, 'captions.json');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const data = JSON.parse(content);
      return JobSchema.parse(data);
    } catch (error) {
      throw new Error(`Failed to load job config from ${configPath}: ${error}`);
    }
  }

  /**
   * Load brand kit with fallbacks
   */
  private async loadBrandKit(options: VideoAssemblerOptions) {
    if (options.brandKit && typeof options.brandKit === 'object') {
      return options.brandKit;
    }

    const fallbackPaths = [
      typeof options.brandKit === 'string' ? options.brandKit : null,
      path.join(options.inputDir, 'brand.yaml'),
      path.join(process.cwd(), 'config', 'brand.yaml'),
      path.join(process.cwd(), 'brand.yaml'),
    ].filter(Boolean) as string[];

    return await BrandKitLoader.loadWithFallbacks(fallbackPaths);
  }

  /**
   * Get output specification
   */
  private getOutputSpec(job: Job, options: VideoAssemblerOptions) {
    // Use job outputSpec if provided
    if (job.outputSpec) {
      return job.outputSpec;
    }

    // Use profile preset
    if (options.profile) {
      switch (options.profile) {
        case 'reels':
          return PLATFORM_PRESETS.instagram_reel;
        case 'square':
          return { width: 1080, height: 1080, fps: 30, bitrate: '2000k' };
        case 'landscape':
          return PLATFORM_PRESETS.facebook;
      }
    }

    // Use platform preset
    return PLATFORM_PRESETS[job.platform] || PLATFORM_PRESETS.instagram_reel;
  }

  /**
   * Validate input files exist
   */
  private async validateInputs(job: Job, inputDir: string): Promise<void> {
    const missingFiles: string[] = [];

    for (const clip of job.clips) {
      const imagePath = path.join(inputDir, clip.image);
      if (!await this.fileExists(imagePath)) {
        missingFiles.push(clip.image);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(`Missing input files: ${missingFiles.join(', ')}`);
    }
  }

  private hasCaptions(job: Job): boolean {
    return job.clips.some(clip =>
      clip.caption ||
      (clip.captionLayer && clip.captionLayer.text)
    );
  }

  /**
   * Add captions to video
   */
  private async addCaptions(
    job: Job,
    outputSpec: OutputSpec,
    inputPath: string,
    outputPath: string,
    brandKit: BrandKit
  ): Promise<void> {
    const captions: Array<{
      text: string;
      start: number;
      end: number;
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      position?: string;
    }> = [];

    let currentTime = 0;
    for (const clip of job.clips) {
      const captionText = clip.caption || clip.captionLayer?.text;
      if (captionText) {
        captions.push({
          text: captionText,
          start: currentTime,
          end: currentTime + clip.durationSec,
          fontSize: clip.captionLayer?.fontSize,
          fontFamily: clip.captionLayer?.fontFamily || brandKit.fonts.primary,
          color: clip.captionLayer?.color || brandKit.colors.primary,
          position: clip.captionLayer?.position || 'bottom',
        });
      }
      currentTime += clip.durationSec;
    }

    if (captions.length > 0) {
      await this.ffmpeg.addCaptions(inputPath, captions, outputPath);
    }
  }

  /**
   * Get video duration
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    try {
      return await this.ffmpeg.getDuration(videoPath);
    } catch {
      return 0;
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}