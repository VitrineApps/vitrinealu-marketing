import { performance } from 'perf_hooks';
import { assemble } from '../jobRunner';
import type { IVideoAdapter, VideoAdapterResult } from './types';
import type { AssembleJob } from '../types';

/**
 * FFmpeg adapter - wraps existing assembly logic
 */
export class FFmpegAdapter implements IVideoAdapter {
  readonly name = 'ffmpeg';

  async generate(job: AssembleJob): Promise<VideoAdapterResult> {
    const startTime = performance.now();

    try {
      // Use existing assemble function
      await assemble(job);
      
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      return {
        outPath: job.outPath,
        adapter: this.name,
        durationMs,
        metadata: {
          clips: job.clips.length,
          profile: job.profile || 'reel',
          hasMusic: !!job.musicPath,
          hasCaptions: !!job.captionJson,
          hasBrand: !!job.brandPath,
        },
      };
    } catch (error) {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      throw new Error(`FFmpeg generation failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Import FFmpeg wrapper and check availability
      const { checkFFmpegAvailability } = await import('../ffmpeg');
      const info = await checkFFmpegAvailability();
      return info.available;
    } catch (error) {
      return false;
    }
  }
}