import { z } from 'zod';

// Zod schemas for validation
export const ClipInputSchema = z.object({
  image: z.string(),
  durationSec: z.number().optional().default(3),
  pan: z.enum(['ltr', 'rtl', 'center']).optional().default('center'),
  zoom: z.enum(['in', 'out', 'none']).optional().default('none'),
});

export const AssembleJobSchema = z.object({
  profile: z.enum(['reel', 'linkedin']),
  clips: z.array(ClipInputSchema),
  captionJson: z.string().optional(),
  watermarkPath: z.string().optional(),
  musicPath: z.string().optional(),
  outPath: z.string(),
  brandPath: z.string().optional(),
  seed: z.number().optional().default(42),
  adapter: z.enum(['ffmpeg', 'capcut', 'runway']).optional(),
});

export const BrandKitSchema = z.object({
  brand: z.string(),
  tagline: z.string().optional(),
  colors: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
    text_light: z.string().optional(),
    text_dark: z.string().optional(),
  }),
  fonts: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    heading: z.string().optional(),
  }),
  watermark: z.object({
    path: z.string(),
    opacity: z.number().optional().default(0.8),
    margin_px: z.number().optional().default(48),
  }).optional(),
  safe_areas: z.object({
    reels: z.object({
      top: z.number(),
      bottom: z.number(),
      left: z.number(),
      right: z.number(),
    }).optional(),
    square: z.object({
      top: z.number(),
      bottom: z.number(),
      left: z.number(),
      right: z.number(),
    }).optional(),
    landscape: z.object({
      top: z.number(),
      bottom: z.number(),
      left: z.number(),
      right: z.number(),
    }).optional(),
  }).optional(),
});

// TypeScript interfaces
export interface ClipInput {
  image: string;
  durationSec?: number;
  pan?: 'ltr' | 'rtl' | 'center';
  zoom?: 'in' | 'out' | 'none';
}

// Legacy compatibility interfaces - these match the old structure
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
  output?: OutputSpec;
  captions?: CaptionLayer[];
  watermark?: {
    path: string;
    opacity?: number;
    margin_px?: number;
  };
}

export interface AssembleJob {
  profile: 'reel' | 'linkedin';
  clips: ClipInput[];
  captionJson?: string;
  watermarkPath?: string;
  musicPath?: string;
  outPath: string;
  brandPath?: string;
  seed?: number;
  adapter?: 'ffmpeg' | 'capcut' | 'runway';
}

export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BrandKit {
  brand: string;
  tagline?: string;
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
    text_light?: string;
    text_dark?: string;
  };
  fonts: {
    primary: string;
    secondary?: string;
    heading?: string;
  };
  watermark?: {
    path: string;
    opacity?: number;
    margin_px?: number;
  };
  safe_areas?: {
    reels?: SafeArea;
    square?: SafeArea;
    landscape?: SafeArea;
  };
}

export interface VideoProfile {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  keyint: number;
}

export interface CaptionSegment {
  text: string;
  start: number;
  end: number;
}

export interface AssembleResult {
  outPath: string;
  duration: number;
}

// Video profiles
export const VIDEO_PROFILES: Record<string, VideoProfile> = {
  reel: {
    width: 1080,
    height: 1920,
    fps: 30,
    bitrate: '12000k', // 10-14 Mb/s range
    keyint: 60,
  },
  linkedin: {
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '10000k', // 8-12 Mb/s range
    keyint: 60,
  },
};

// Ken Burns presets
export interface KenBurnsEffect {
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const KEN_BURNS_PRESETS: Record<string, Record<string, KenBurnsEffect>> = {
  zoom: {
    in: { startScale: 1.0, endScale: 1.2, startX: 0, startY: 0, endX: 0, endY: 0 },
    out: { startScale: 1.2, endScale: 1.0, startX: 0, startY: 0, endX: 0, endY: 0 },
    none: { startScale: 1.0, endScale: 1.0, startX: 0, startY: 0, endX: 0, endY: 0 },
  },
  pan: {
    ltr: { startScale: 1.1, endScale: 1.1, startX: -50, startY: 0, endX: 50, endY: 0 },
    rtl: { startScale: 1.1, endScale: 1.1, startX: 50, startY: 0, endX: -50, endY: 0 },
    center: { startScale: 1.0, endScale: 1.0, startX: 0, startY: 0, endX: 0, endY: 0 },
  },
};