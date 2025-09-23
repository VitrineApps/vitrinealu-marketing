import { Request, Response } from 'express';
import { readdir, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { promisify } from 'util';
import { addVideoJob } from '../queue';
import { VideoRequest } from '../types';
import logger from '../logger';

const readdirAsync = promisify(readdir);

/**
 * Create a 9:16 reel video
 */
export async function createReel(req: Request, res: Response) {
  try {
    const data: VideoRequest = req.body;
    
    // Resolve clips from mediaDir or use provided clips
    const clips = data.clips || await resolveClipsFromDirectory(data.mediaDir);
    
    if (clips.length === 0) {
      return res.status(400).json({
        error: 'No Content',
        message: 'No images found in media directory',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 400,
      });
    }
    
    // Generate output path
    const timestamp = new Date();
    const dateDir = `${timestamp.getFullYear()}/${String(timestamp.getMonth() + 1).padStart(2, '0')}`;
    const slug = generateSlug();
    const outPath = join(data.outDir, dateDir, `${slug}.mp4`);
    
    // Load captions if available
    const captionJson = await loadCaptionSidecar(data.mediaDir, data.captionSidecarPlatform);
    
    // Add job to queue
    const jobId = await addVideoJob('reel', {
      clips: clips.map(clip => {
        const baseClip = {
          image: join(data.mediaDir, clip.image),
          durationSec: clip.durationSec || 3,
        };
        
        // Add pan and zoom if they exist in the clip data (from the provided clips array)
        if (data.clips) {
          const originalClip = data.clips.find(c => c.image === clip.image);
          if (originalClip) {
            return {
              ...baseClip,
              pan: originalClip.pan || 'center',
              zoom: originalClip.zoom || 'none',
            };
          }
        }
        
        // Default for auto-resolved clips
        return {
          ...baseClip,
          pan: 'center' as const,
          zoom: 'none' as const,
        };
      }),
      outPath,
      brandPath: data.brandPath,
      musicPath: data.musicPath,
      captionJson,
      seed: data.seed || 42,
    });
    
    logger.info({ jobId, mediaDir: data.mediaDir, outPath }, 'Reel job queued');
    
    res.status(202).json({
      jobId,
      outPath,
      status: 'queued',
      estimatedDuration: clips.length * 3, // rough estimate
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.error({ error, path: req.path }, 'Failed to create reel');
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process reel request',
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
}

/**
 * Resolve image files from directory by timestamp
 */
async function resolveClipsFromDirectory(mediaDir: string): Promise<Array<{ image: string; durationSec?: number }>> {
  if (!existsSync(mediaDir)) {
    throw new Error(`Media directory not found: ${mediaDir}`);
  }
  
  const files = await readdirAsync(mediaDir);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
  
  const imageFiles = files
    .filter(file => {
      const ext = extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    })
    .map(file => {
      const filePath = join(mediaDir, file);
      const stats = statSync(filePath);
      return {
        file,
        mtime: stats.mtime,
      };
    })
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime()) // Sort by modification time
    .map(item => ({ image: item.file }));
  
  return imageFiles;
}

/**
 * Load caption sidecar file if available
 */
async function loadCaptionSidecar(mediaDir: string, platform?: string): Promise<string | undefined> {
  if (!platform) return undefined;
  
  const captionFile = join(mediaDir, `captions.${platform}.json`);
  
  if (existsSync(captionFile)) {
    try {
      const { readFileSync } = await import('fs');
      return readFileSync(captionFile, 'utf8');
    } catch (error) {
      logger.warn({ error, captionFile }, 'Failed to load caption sidecar');
    }
  }
  
  return undefined;
}

/**
 * Generate a unique slug for the video file
 */
function generateSlug(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `reel_${timestamp}_${random}`;
}