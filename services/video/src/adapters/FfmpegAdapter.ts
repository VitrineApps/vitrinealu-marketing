import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

import { AppConfig, AdapterResult, VideoAdapter, VideoJob } from '../types.js';
import { prepareOutputPath } from '../storage.js';

export class FfmpegAdapter implements VideoAdapter {
  readonly name = 'ffmpeg';

  constructor(private readonly config: AppConfig) {}

  supports(_job: VideoJob): boolean {
    return true;
  }

  async generate(job: VideoJob): Promise<AdapterResult> {
    const prepared = prepareOutputPath(this.config, job.assetId);
    const dims = job.aspectDimensions.split('x');
    const width = Number(dims[0] ?? '1080');
    const height = Number(dims[1] ?? '1920');
    const duration = job.duration ?? 12;

    const baseFilters = [
      'scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease',
      'pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2',
      'format=yuv420p',
    ];

    const watermarkPath = this.config.ffmpeg.watermarkPath;

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(job.sourcePath).loop(duration);
      if (watermarkPath && fs.existsSync(watermarkPath)) {
        command = command.input(watermarkPath);
        const filters = [
          '[0:v]' + baseFilters[0] + ',' + baseFilters[1] + ',format=rgba[bk]',
          '[bk][1:v]overlay=W-w-40:H-h-40,format=yuv420p[out]',
        ];
        command = command.complexFilter(filters, 'out');
      } else {
        command = command.videoFilters(baseFilters);
      }
      command
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-pix_fmt yuv420p', '-movflags +faststart'])
        .duration(duration)
        .output(prepared.filePath)
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .run();
    });

    return {
      backend: this.name,
      filePath: prepared.filePath,
      duration,
      metadata: {
        outputUrl: prepared.relativeUrl,
      },
    };
  }
}

export default FfmpegAdapter;
