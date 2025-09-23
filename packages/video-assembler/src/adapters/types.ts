import { z } from 'zod';
import type { AssembleJob } from '../types';

/**
 * Video adapter interface for pluggable video generation
 */
export interface IVideoAdapter {
  /**
   * Adapter name for identification
   */
  readonly name: string;

  /**
   * Generate video from assembly job
   * @param job - Video assembly job configuration
   * @returns Promise resolving to output path and metadata
   */
  generate(job: AssembleJob): Promise<VideoAdapterResult>;

  /**
   * Check if adapter is available/configured
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Result from video adapter generation
 */
export interface VideoAdapterResult {
  /**
   * Path to generated video file
   */
  outPath: string;

  /**
   * Adapter that generated the video
   */
  adapter: string;

  /**
   * Generation duration in milliseconds
   */
  durationMs: number;

  /**
   * Additional metadata from the adapter
   */
  metadata?: Record<string, unknown>;
}

/**
 * CapCut API configuration
 */
export const CapCutConfigSchema = z.object({
  apiKey: z.string().min(1, 'CapCut API key is required'),
  templateId: z.string().min(1, 'CapCut template ID is required'),
  baseUrl: z.string().url().default('https://openapi-sg.capcut.com'),
  maxPollAttempts: z.number().min(1).default(60),
  pollIntervalMs: z.number().min(1000).default(5000),
});

export type CapCutConfig = z.infer<typeof CapCutConfigSchema>;

/**
 * Runway API configuration
 */
export const RunwayConfigSchema = z.object({
  apiKey: z.string().min(1, 'Runway API key is required'),
  baseUrl: z.string().url().default('https://api.runwayml.com'),
  model: z.string().default('gen-3a-turbo'),
  maxPollAttempts: z.number().min(1).default(120),
  pollIntervalMs: z.number().min(1000).default(10000),
});

export type RunwayConfig = z.infer<typeof RunwayConfigSchema>;

/**
 * Video adapter type enumeration
 */
export const VideoAdapterType = z.enum(['ffmpeg', 'capcut', 'runway']);
export type VideoAdapterType = z.infer<typeof VideoAdapterType>;

/**
 * Adapter factory configuration
 */
export interface AdapterFactoryConfig {
  defaultAdapter: VideoAdapterType;
  fallbackOrder: VideoAdapterType[];
  enableFallback: boolean;
  capcut?: CapCutConfig;
  runway?: RunwayConfig;
}

/**
 * Error types for adapter operations
 */
export class VideoAdapterError extends Error {
  constructor(
    message: string,
    public readonly adapter: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'VideoAdapterError';
  }
}

export class VideoAdapterUnavailableError extends VideoAdapterError {
  constructor(adapter: string, reason: string) {
    super(`Adapter ${adapter} is not available: ${reason}`, adapter, 'UNAVAILABLE');
    this.name = 'VideoAdapterUnavailableError';
  }
}

export class VideoAdapterTimeoutError extends VideoAdapterError {
  constructor(adapter: string, timeoutMs: number) {
    super(`Adapter ${adapter} timed out after ${timeoutMs}ms`, adapter, 'TIMEOUT');
    this.name = 'VideoAdapterTimeoutError';
  }
}