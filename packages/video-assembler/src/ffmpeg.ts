import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';
import pino from 'pino';

const logger = pino({ name: 'ffmpeg' });

export interface FFmpegInfo {
  available: boolean;
  version?: string;
  path?: string;
  codecs?: string[];
}

/**
 * Check if FFmpeg is available and get version info
 */
export async function checkFFmpegAvailability(): Promise<FFmpegInfo> {
  return new Promise((resolve) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    
    try {
      const proc = spawn(ffmpegPath, ['-version'], { 
        stdio: ['ignore', 'pipe', 'pipe'] 
      });
      
      let output = '';
      let errorOutput = '';
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
          const version = versionMatch ? versionMatch[1] : 'unknown';
          
          // Extract codec info
          const codecMatch = output.match(/configuration:.*?--enable-([^\s]+)/g) || [];
          const codecs = codecMatch.map(c => c.replace(/.*--enable-/, ''));
          
          resolve({
            available: true,
            version,
            path: ffmpegPath,
            codecs,
          });
        } else {
          logger.warn({ code, errorOutput }, 'FFmpeg not available');
          resolve({ available: false });
        }
      });
      
      proc.on('error', (error) => {
        logger.warn({ error: error.message }, 'FFmpeg spawn error');
        resolve({ available: false });
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        resolve({ available: false });
      }, 5000);
      
    } catch (error) {
      logger.warn({ error }, 'FFmpeg check failed');
      resolve({ available: false });
    }
  });
}

/**
 * Fluent FFmpeg wrapper with error handling and logging
 */
export class FFmpegWrapper {
  private ffmpegPath?: string;
  
  constructor(ffmpegPath?: string) {
    this.ffmpegPath = ffmpegPath || process.env.FFMPEG_PATH;
    if (this.ffmpegPath) {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
  }
  
  /**
   * Create a new FFmpeg command
   */
  createCommand(input?: string): ReturnType<typeof ffmpeg> {
    const command = ffmpeg(input);
    
    // Add common settings
    command
      .on('start', (...args: unknown[]) => {
        const commandLine = args[0] as string;
        logger.debug({ commandLine }, 'FFmpeg command started');
      })
      .on('progress', (...args: unknown[]) => {
        const progress = args[0] as { percent?: number };
        if (progress.percent) {
          logger.debug({ percent: progress.percent }, 'FFmpeg progress');
        }
      })
      .on('error', (...args: unknown[]) => {
        const [err, stdout, stderr] = args;
        const error = err as Error;
        logger.error({ err: error.message, stdout, stderr }, 'FFmpeg error');
      })
      .on('end', () => {
        logger.debug('FFmpeg command completed');
      });
    
    return command;
  }
  
  /**
   * Run FFmpeg command as promise
   */
  async runCommand(command: ReturnType<typeof ffmpeg>): Promise<void> {
    return new Promise((resolve, reject) => {
      command
        .on('end', () => resolve())
        .on('error', (err: unknown) => reject(err))
        .run();
    });
  }
  
  /**
   * Get video duration in seconds
   */
  async getVideoDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: unknown, metadata: unknown) => {
        if (err) {
          reject(err);
        } else {
          const data = metadata as { format?: { duration?: number } };
          const duration = data.format?.duration || 0;
          resolve(duration);
        }
      });
    });
  }
  
  /**
   * Get image dimensions
   */
  async getImageDimensions(inputPath: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: unknown, metadata: unknown) => {
        if (err) {
          reject(err);
        } else {
          const data = metadata as { 
            streams?: Array<{ 
              codec_type?: string; 
              width?: number; 
              height?: number; 
            }> 
          };
          const videoStream = data.streams?.find(s => s.codec_type === 'video');
          if (videoStream) {
            resolve({
              width: videoStream.width || 0,
              height: videoStream.height || 0,
            });
          } else {
            reject(new Error('No video stream found'));
          }
        }
      });
    });
  }
}

/**
 * Default FFmpeg wrapper instance
 */
export const ffmpegWrapper = new FFmpegWrapper();

/**
 * Smoke test function for FFmpeg availability
 */
export async function __smoke() {
  const info = await checkFFmpegAvailability();
  console.log('FFmpeg availability check:', info);
  
  if (!info.available) {
    throw new Error('FFmpeg is not available');
  }
  
  console.log('✅ FFmpeg smoke test passed');
}