export * from './types';
export * from './jobRunner';
export { FFmpegWrapper, checkFFmpegAvailability } from './ffmpeg';
export * from './brandKit';
export * from './overlays';
export * from './kenburns';
export * from './profiles';
export { checkFFmpegAvailability as __smoke } from './ffmpeg';

// Adapter system exports
export * from './adapters/types';
export { AdapterFactory, createAdapterFactoryFromEnv } from './adapterFactory';
export { FFmpegAdapter } from './adapters/ffmpegAdapter';
export { CapCutAdapter } from './adapters/capcutAdapter';
export { RunwayAdapter } from './adapters/runwayAdapter';

// Convenient adapter functions
import { AdapterFactory, createAdapterFactoryFromEnv } from './adapterFactory';
import type { AssembleJob } from './types';
import type { VideoAdapterResult } from './adapters/types';

// Default factory instance
let defaultFactory: AdapterFactory | null = null;

/**
 * Assemble video using the adapter system
 * @param job - Video assembly job configuration
 * @returns Promise resolving to video generation result
 */
export async function assembleWithAdapters(job: AssembleJob): Promise<VideoAdapterResult> {
  if (!defaultFactory) {
    defaultFactory = createAdapterFactoryFromEnv();
  }

  return defaultFactory.generateVideo(job, job.adapter);
}

/**
 * Get available video adapters
 * @returns Promise resolving to list of available adapter names
 */
export async function getAvailableAdapters(): Promise<string[]> {
  if (!defaultFactory) {
    defaultFactory = createAdapterFactoryFromEnv();
  }

  return defaultFactory.getAvailableAdapters();
}

/**
 * Check if a specific adapter is available
 * @param adapter - Adapter name to check
 * @returns Promise resolving to availability status
 */
export async function isAdapterAvailable(adapter: 'ffmpeg' | 'capcut' | 'runway'): Promise<boolean> {
  if (!defaultFactory) {
    defaultFactory = createAdapterFactoryFromEnv();
  }

  return defaultFactory.isAdapterAvailable(adapter);
}