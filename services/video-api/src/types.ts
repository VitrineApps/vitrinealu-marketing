import { z } from 'zod';

// Request validation schemas
export const VideoRequestSchema = z.object({
  mediaDir: z.string(),
  brandPath: z.string().optional(),
  musicPath: z.string().optional(),
  outDir: z.string(),
  captionSidecarPlatform: z.enum(['instagram', 'tiktok', 'linkedin']).optional(),
  seed: z.number().optional().default(42),
  clips: z.array(z.object({
    image: z.string(),
    durationSec: z.number().optional().default(3),
    pan: z.enum(['ltr', 'rtl', 'center']).optional().default('center'),
    zoom: z.enum(['in', 'out', 'none']).optional().default('none'),
  })).optional(),
});

export const JobStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['waiting', 'active', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  data: z.record(z.any()).optional(),
  result: z.record(z.any()).optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});

// TypeScript interfaces
export interface VideoRequest {
  mediaDir: string;
  brandPath?: string;
  musicPath?: string;
  outDir: string;
  captionSidecarPlatform?: 'instagram' | 'tiktok' | 'linkedin';
  seed?: number;
  clips?: Array<{
    image: string;
    durationSec?: number;
    pan?: 'ltr' | 'rtl' | 'center';
    zoom?: 'in' | 'out' | 'none';
  }>;
}

export interface JobStatus {
  id: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  data?: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface VideoJobData {
  profile: 'reel' | 'linkedin';
  clips: Array<{
    image: string;
    durationSec?: number;
    pan?: 'ltr' | 'rtl' | 'center';
    zoom?: 'in' | 'out' | 'none';
  }>;
  outPath: string;
  brandPath?: string;
  musicPath?: string;
  captionJson?: string;
  seed?: number;
}

export interface VideoJobResult {
  jobId: string;
  outPath: string;
  duration: number;
  fileSize: number;
  metadata: {
    profile: string;
    clipCount: number;
    hasMusic: boolean;
    hasCaptions: boolean;
    hasWatermark: boolean;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  path: string;
  statusCode: number;
}