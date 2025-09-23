import type { IVideoAdapter, VideoAdapterResult, AdapterFactoryConfig, VideoAdapterType } from './adapters/types';
import { VideoAdapterError, VideoAdapterUnavailableError } from './adapters/types';
import { FFmpegAdapter } from './adapters/ffmpegAdapter';
import { CapCutAdapter } from './adapters/capcutAdapter';
import { RunwayAdapter } from './adapters/runwayAdapter';
import type { AssembleJob } from './types';

/**
 * Factory for creating and managing video adapters
 */
export class AdapterFactory {
  private adapters = new Map<VideoAdapterType, IVideoAdapter>();
  private availabilityCache = new Map<VideoAdapterType, { available: boolean; timestamp: number }>();
  private readonly cacheExpiryMs = 5 * 60 * 1000; // 5 minutes

  constructor(private config: AdapterFactoryConfig) {
    this.initializeAdapters();
  }

  /**
   * Generate video using the specified adapter with fallback support
   */
  async generateVideo(job: AssembleJob, preferredAdapter?: VideoAdapterType): Promise<VideoAdapterResult> {
    const adapterSequence = this.getAdapterSequence(preferredAdapter);
    const errors: Array<{ adapter: string; error: Error }> = [];

    for (const adapterType of adapterSequence) {
      const adapter = this.adapters.get(adapterType);
      if (!adapter) {
        continue;
      }

      try {
        // Check availability with caching
        const isAvailable = await this.isAdapterAvailable(adapterType);
        if (!isAvailable) {
          errors.push({
            adapter: adapterType,
            error: new VideoAdapterUnavailableError(adapterType, 'Adapter not available'),
          });
          continue;
        }

        // Attempt generation
        console.log(`Attempting video generation with ${adapterType} adapter`);
        const result = await adapter.generate(job);
        
        console.log(`Successfully generated video with ${adapterType} adapter in ${result.durationMs}ms`);
        return result;

      } catch (error) {
        console.warn(`${adapterType} adapter failed:`, error instanceof Error ? error.message : String(error));
        
        errors.push({
          adapter: adapterType,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // If this is a configuration error or the adapter is unavailable, mark it as such
        if (error instanceof VideoAdapterUnavailableError) {
          this.markAdapterUnavailable(adapterType);
        }

        // Continue to next adapter if fallback is enabled
        if (!this.config.enableFallback) {
          break;
        }
      }
    }

    // All adapters failed
    const errorMessage = errors
      .map(({ adapter, error }) => `${adapter}: ${error.message}`)
      .join('; ');
    
    throw new VideoAdapterError(
      `All video adapters failed: ${errorMessage}`,
      'factory',
      'ALL_ADAPTERS_FAILED',
    );
  }

  /**
   * Get available adapters
   */
  async getAvailableAdapters(): Promise<VideoAdapterType[]> {
    const available: VideoAdapterType[] = [];

    for (const [type, adapter] of this.adapters) {
      try {
        if (await this.isAdapterAvailable(type)) {
          available.push(type);
        }
      } catch (error) {
        // Ignore availability check errors
      }
    }

    return available;
  }

  /**
   * Check if a specific adapter is available
   */
  async isAdapterAvailable(type: VideoAdapterType): Promise<boolean> {
    const cached = this.availabilityCache.get(type);
    const now = Date.now();

    // Return cached result if still valid
    if (cached && (now - cached.timestamp) < this.cacheExpiryMs) {
      return cached.available;
    }

    // Check availability
    const adapter = this.adapters.get(type);
    if (!adapter) {
      this.availabilityCache.set(type, { available: false, timestamp: now });
      return false;
    }

    try {
      const available = await adapter.isAvailable();
      this.availabilityCache.set(type, { available, timestamp: now });
      return available;
    } catch (error) {
      this.availabilityCache.set(type, { available: false, timestamp: now });
      return false;
    }
  }

  /**
   * Clear availability cache
   */
  clearAvailabilityCache(): void {
    this.availabilityCache.clear();
  }

  private initializeAdapters(): void {
    // Always create FFmpeg adapter
    this.adapters.set('ffmpeg', new FFmpegAdapter());

    // Create CapCut adapter if configured
    if (this.config.capcut) {
      this.adapters.set('capcut', new CapCutAdapter(this.config.capcut));
    }

    // Create Runway adapter if configured
    if (this.config.runway) {
      this.adapters.set('runway', new RunwayAdapter(this.config.runway));
    }
  }

  private getAdapterSequence(preferredAdapter?: VideoAdapterType): VideoAdapterType[] {
    if (preferredAdapter && this.adapters.has(preferredAdapter)) {
      if (!this.config.enableFallback) {
        return [preferredAdapter];
      }

      // Put preferred adapter first, then follow fallback order
      const sequence = [preferredAdapter];
      const fallbackAdapters = this.config.fallbackOrder.filter(a => a !== preferredAdapter);
      sequence.push(...fallbackAdapters);
      return sequence;
    }

    // Use fallback order starting with default
    const sequence = [this.config.defaultAdapter];
    const fallbackAdapters = this.config.fallbackOrder.filter(a => a !== this.config.defaultAdapter);
    sequence.push(...fallbackAdapters);
    return sequence;
  }

  private markAdapterUnavailable(type: VideoAdapterType): void {
    this.availabilityCache.set(type, { 
      available: false, 
      timestamp: Date.now() 
    });
  }
}

/**
 * Create adapter factory from environment variables
 */
export function createAdapterFactoryFromEnv(): AdapterFactory {
  const defaultAdapter = (process.env.VIDEO_ADAPTER as VideoAdapterType) || 'ffmpeg';
  
  // Default fallback order: capcut -> runway -> ffmpeg
  const fallbackOrder: VideoAdapterType[] = ['capcut', 'runway', 'ffmpeg'];
  
  const config: AdapterFactoryConfig = {
    defaultAdapter,
    fallbackOrder,
    enableFallback: process.env.VIDEO_ADAPTER_FALLBACK !== 'false',
  };

  // Configure CapCut if API key is provided
  if (process.env.CAPCUT_API_KEY && process.env.CAPCUT_TEMPLATE_ID) {
    config.capcut = {
      apiKey: process.env.CAPCUT_API_KEY,
      templateId: process.env.CAPCUT_TEMPLATE_ID,
      baseUrl: process.env.CAPCUT_BASE_URL || 'https://openapi-sg.capcut.com',
      maxPollAttempts: process.env.CAPCUT_MAX_POLL_ATTEMPTS ? 
        parseInt(process.env.CAPCUT_MAX_POLL_ATTEMPTS) : 60,
      pollIntervalMs: process.env.CAPCUT_POLL_INTERVAL_MS ? 
        parseInt(process.env.CAPCUT_POLL_INTERVAL_MS) : 5000,
    };
  }

  // Configure Runway if API key is provided
  if (process.env.RUNWAY_API_KEY) {
    config.runway = {
      apiKey: process.env.RUNWAY_API_KEY,
      baseUrl: process.env.RUNWAY_BASE_URL || 'https://api.runwayml.com',
      model: process.env.RUNWAY_MODEL || 'gen-3a-turbo',
      maxPollAttempts: process.env.RUNWAY_MAX_POLL_ATTEMPTS ? 
        parseInt(process.env.RUNWAY_MAX_POLL_ATTEMPTS) : 120,
      pollIntervalMs: process.env.RUNWAY_POLL_INTERVAL_MS ? 
        parseInt(process.env.RUNWAY_POLL_INTERVAL_MS) : 10000,
    };
  }

  return new AdapterFactory(config);
}