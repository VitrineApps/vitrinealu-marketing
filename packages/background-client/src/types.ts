/**
 * TypeScript types for the background processing client
 */

import { z } from 'zod';

// Background processing engine types
export type BGEngine = 'SDXL' | 'RUNWAY';
export type BGMode = 'transparent' | 'soften';

// Configuration schema
export const ConfigSchema = z.object({
  baseUrl: z.string().url(),
  timeout: z.number().default(300000), // 5 minutes
  retryAttempts: z.number().default(3),
  retryDelay: z.number().default(1000)
});

export type Config = z.infer<typeof ConfigSchema>;

// Cleanup request schema
export const CleanupRequestSchema = z.object({
  imagePath: z.string(),
  mode: z.enum(['transparent', 'soften']).default('transparent'),
  blurRadius: z.number().optional(),
  desaturatePct: z.number().min(0).max(100).optional(),
  enhanceFg: z.boolean().default(true),
  denoise: z.boolean().default(false)
});

export type CleanupRequest = z.infer<typeof CleanupRequestSchema>;

// Replace request schema
export const ReplaceRequestSchema = z.object({
  imagePath: z.string(),
  prompt: z.string(),
  negativePrompt: z.string().default('people, text, watermark'),
  seed: z.number().optional(),
  engine: z.enum(['SDXL', 'RUNWAY']).optional(),
  steps: z.number().min(1).max(100).default(20),
  guidanceScale: z.number().min(1).max(20).default(7.5),
  enhanceFg: z.boolean().default(true),
  matchColors: z.boolean().default(true),
  featherEdges: z.boolean().default(true)
});

export type ReplaceRequest = z.infer<typeof ReplaceRequestSchema>;

// Processing response schema
export const ProcessingResponseSchema = z.object({
  success: z.boolean(),
  outputPath: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional()
});

export type ProcessingResponse = z.infer<typeof ProcessingResponseSchema>;

// Output metadata for sidecar files
export const BackgroundMetadataSchema = z.object({
  mode: z.enum(['cleanup', 'replace']),
  engine: z.enum(['SDXL', 'RUNWAY']).optional(),
  outJpg: z.string().optional(),
  outPng: z.string().optional(),
  maskPath: z.string().optional(),
  processedAt: z.string(),
  prompt: z.string().optional(),
  settings: z.record(z.any()).optional()
});

export type BackgroundMetadata = z.infer<typeof BackgroundMetadataSchema>;

// Brand presets for automated processing
export interface BrandPreset {
  name: string;
  prompts: {
    garden: string;
    studio: string;
    minimal: string;
    lifestyle: string;
  };
  negativePrompt: string;
  settings: {
    steps: number;
    guidanceScale: number;
    engine: BGEngine;
  };
}

// Error types
export class BackgroundClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'BackgroundClientError';
  }
}

export class BackgroundTimeoutError extends BackgroundClientError {
  constructor(message: string = 'Background processing timed out') {
    super(message, 'TIMEOUT');
    this.name = 'BackgroundTimeoutError';
  }
}

export class BackgroundNetworkError extends BackgroundClientError {
  constructor(message: string, statusCode?: number) {
    super(message, 'NETWORK_ERROR', statusCode);
    this.name = 'BackgroundNetworkError';
  }
}