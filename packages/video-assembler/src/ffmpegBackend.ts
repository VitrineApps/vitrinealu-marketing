import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { logger } from './logger';
import { Clip, OutputSpec } from './types';

export class FfmpegBackend {
  private ffmpegPath?: string;

  constructor(ffmpegPath?: string) {
    this.ffmpegPath = ffmpegPath;
    if (this.ffmpegPath) {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
  }

  /**
   * Check if ffmpeg is available
   */
  async checkAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err, formats) => {
        resolve(!err && formats !== null);
      });
    });
  }

  /**
   * Get video duration
   */
  async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        const duration = (metadata as { format: { duration: number } }).format.duration;
        resolve(duration || 0);
      });
    });
  }

  /**
   * Generate Ken Burns effect filter for a clip
   */
  generateKenBurnsFilter(clip: Clip, duration: number, width: number, height: number): string {
    const filters: string[] = [];

    // Base zoom and pan
    if (clip.zoom !== 'none' || clip.pan !== 'none') {
      const _zoomStart = clip.zoom === 'in' ? 1.0 : 1.2;
      const zoomEnd = clip.zoom === 'in' ? 1.2 : 1.0;

      let _panX = 0;
      let _panY = 0;

      switch (clip.pan) {
        case 'leftToRight':
          _panX = 0.1;
          break;
        case 'rightToLeft':
          _panX = -0.1;
          break;
        case 'topToBottom':
          _panY = 0.1;
          break;
        case 'bottomToTop':
          _panY = -0.1;
          break;
      }

      filters.push(
        `zoompan=z='min(max(zoom,pzoom)+0.0015,${zoomEnd})':` +
        `x='iw/2-(iw/zoom/2)':` +
        `y='ih/2-(ih/zoom/2)':` +
        `d=1:` +
        `s=${width}x${height}:` +
        `fps=30`
      );
    }

    return filters.join(',');
  }

  /**
   * Create video from image sequence with effects
   */
  async createVideoFromImages(
    clips: Clip[],
    outputSpec: OutputSpec,
    outputPath: string,
    inputDir: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Add input images
      clips.forEach((_clip, _index) => {
        const imagePath = path.join(inputDir, _clip.image);
        command.input(imagePath);

        // Set duration for each input
        command.inputOptions([`-t ${_clip.durationSec}`]);
      });

      // Set output options
      command
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(`${outputSpec.width}x${outputSpec.height}`)
        .fps(outputSpec.fps || 30)
        .videoBitrate(outputSpec.bitrate || '2000k')
        .audioBitrate('128k')
        .audioChannels(2)
        .audioFrequency(44100);

      // Add complex filter for Ken Burns effects
      if (clips.some(clip => clip.zoom !== 'none' || clip.pan !== 'none')) {
        const filterComplex = clips.map((clip, index) => {
          const filter = this.generateKenBurnsFilter(
            clip,
            clip.durationSec,
            outputSpec.width,
            outputSpec.height
          );
          return `[${index}:v]${filter}[v${index}]`;
        }).join(';');

        const concatInputs = clips.map((_, index) => `[v${index}]`).join('');
        const concatFilter = `${concatInputs}concat=n=${clips.length}:v=1:a=0[vout]`;

        command.complexFilter([filterComplex, concatFilter].join(';'));
        command.map('[vout]');
      } else {
        // Simple concatenation
        command.concat(clips.length);
      }

      // Add hold frame at end
      command.outputOptions(['-vf', 'tpad=stop_mode=clone:stop_duration=0.5']);

      command
        .on('start', (commandLine) => {
          logger.info(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          logger.info(`Processing: ${(progress as { percent: number }).percent}% done`);
        })
        .on('end', () => {
          logger.info('Video creation completed');
          resolve();
        })
        .on('error', (err) => {
          logger.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Add audio to video
   */
  async addAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .output(outputPath)
        .audioCodec('aac')
        .videoCodec('copy')
        .on('start', (commandLine) => {
          logger.info(`Adding audio: ${commandLine}`);
        })
        .on('end', () => {
          logger.info('Audio addition completed');
          resolve();
        })
        .on('error', (err) => {
          logger.error('Audio addition error:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Add watermark to video
   */
  async addWatermark(videoPath: string, watermarkPath: string, outputPath: string, options: {
    scale?: number;
    opacity?: number;
    position?: string;
  } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const scale = options.scale || 0.15;
      const opacity = options.opacity || 0.8;
      const position = options.position || 'bottom-right';

      // Calculate position coordinates
      let x, y;
      switch (position) {
        case 'top-left':
          x = 10;
          y = 10;
          break;
        case 'top-right':
          x = 'W-tw-10';
          y = 10;
          break;
        case 'bottom-left':
          x = 10;
          y = 'H-th-10';
          break;
        case 'bottom-right':
        default:
          x = 'W-tw-10';
          y = 'H-th-10';
          break;
      }

      const filter = `movie=${watermarkPath},scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm];[in][wm]overlay=${x}:${y}`;

      ffmpeg(videoPath)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoFilters(filter)
        .on('start', (commandLine) => {
          logger.info(`Adding watermark: ${commandLine}`);
        })
        .on('end', () => {
          logger.info('Watermark addition completed');
          resolve();
        })
        .on('error', (err) => {
          logger.error('Watermark addition error:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Add captions to video
   */
  async addCaptions(videoPath: string, captions: Array<{
    text: string;
    start: number;
    end: number;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    position?: string;
  }>, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let filterComplex = '';

      captions.forEach((caption, index) => {
        const start = caption.start;
        const end = caption.end;
        const _duration = end - start;

        const fontSize = caption.fontSize || 48;
        const fontFamily = caption.fontFamily || 'Arial';
        const color = caption.color || 'white';
        const position = caption.position || 'center';

        // Calculate position
        let x, y;
        switch (position) {
          case 'top':
            x = '(w-text_w)/2';
            y = '100';
            break;
          case 'bottom':
            x = '(w-text_w)/2';
            y = 'h-100-text_h';
            break;
          case 'center':
          default:
            x = '(w-text_w)/2';
            y = '(h-text_h)/2';
            break;
        }

        const textFilter = `drawtext=text='${caption.text.replace(/'/g, "\\'")}':` +
          `fontsize=${fontSize}:` +
          `fontcolor=${color}:` +
          `fontfile='${fontFamily}':` +
          `x=${x}:y=${y}:` +
          `enable='between(t,${start},${end})':` +
          `shadowcolor=black:shadowx=2:shadowy=2`;

        filterComplex += textFilter;
        if (index < captions.length - 1) {
          filterComplex += ',';
        }
      });

      ffmpeg(videoPath)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoFilters(filterComplex)
        .on('start', (commandLine) => {
          logger.info(`Adding captions: ${commandLine}`);
        })
        .on('end', () => {
          logger.info('Caption addition completed');
          resolve();
        })
        .on('error', (err) => {
          logger.error('Caption addition error:', err);
          reject(err);
        })
        .run();
    });
  }
}