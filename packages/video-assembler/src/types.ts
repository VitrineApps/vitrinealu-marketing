import { z } from 'zod';

// Zod schemas for validation
export const CaptionLayerSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  color: z.string().optional(),
  position: z.enum(['top', 'center', 'bottom']).optional(),
  safeArea: z.boolean().optional().default(true),
});

export const ClipSchema = z.object({
  image: z.string(),
  durationSec: z.number(),
  pan: z.enum(['none', 'leftToRight', 'rightToLeft', 'topToBottom', 'bottomToTop']).optional().default('none'),
  zoom: z.enum(['none', 'in', 'out']).optional().default('none'),
  caption: z.string().optional(),
  captionLayer: CaptionLayerSchema.optional(),
});

export const JobSchema = z.object({
  platform: z.enum(['instagram_reel', 'tiktok', 'youtube_short', 'facebook', 'linkedin']),
  clips: z.array(ClipSchema),
  outputSpec: z.object({
    width: z.number(),
    height: z.number(),
    fps: z.number().optional().default(30),
    bitrate: z.string().optional().default('2000k'),
    format: z.string().optional().default('mp4'),
  }).optional(),
  music: z.string().optional(),
  watermark: z.boolean().optional().default(true),
});

export const BrandKitSchema = z.object({
  brand: z.string(),
  colors: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
  }),
  fonts: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    heading: z.string().optional(),
  }),
  watermark: z.object({
    path: z.string(),
    opacity: z.number().optional().default(0.8),
    scale: z.number().optional().default(0.15),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional().default('bottom-right'),
  }).optional(),
});

// TypeScript interfaces
export interface CaptionLayer {
  text: string;
  startTime: number;
  endTime: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  position?: 'top' | 'center' | 'bottom';
  safeArea?: boolean;
}

export interface Clip {
  image: string;
  durationSec: number;
  pan?: 'none' | 'leftToRight' | 'rightToLeft' | 'topToBottom' | 'bottomToTop';
  zoom?: 'none' | 'in' | 'out';
  caption?: string;
  captionLayer?: CaptionLayer;
}

export interface OutputSpec {
  width: number;
  height: number;
  fps?: number;
  bitrate?: string;
  format?: string;
}

export interface Job {
  platform: 'instagram_reel' | 'tiktok' | 'youtube_short' | 'facebook' | 'linkedin';
  clips: Clip[];
  outputSpec?: OutputSpec;
  music?: string;
  watermark?: boolean;
}

export interface BrandKit {
  brand: string;
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
  };
  fonts: {
    primary: string;
    secondary?: string;
    heading?: string;
  };
  watermark?: {
    path: string;
    opacity?: number;
    scale?: number;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
}

export interface VideoAssemblerOptions {
  inputDir: string;
  outputPath: string;
  brandKit?: BrandKit | string;
  profile?: 'reels' | 'square' | 'landscape';
  fps?: number;
  bitrate?: string;
  watermark?: boolean;
  music?: string;
}

// Platform presets
export const PLATFORM_PRESETS: Record<string, OutputSpec> = {
  instagram_reel: { width: 1080, height: 1920, fps: 30, bitrate: '2000k' },
  tiktok: { width: 1080, height: 1920, fps: 30, bitrate: '2000k' },
  youtube_short: { width: 1080, height: 1920, fps: 30, bitrate: '2000k' },
  facebook: { width: 1280, height: 720, fps: 30, bitrate: '2500k' },
  linkedin: { width: 1920, height: 1080, fps: 30, bitrate: '3000k' },
};