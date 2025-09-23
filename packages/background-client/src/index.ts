/**
 * Background processing client main module
 */

import pino from 'pino';
import { createConfig, loadConfig, type Config } from './config.js';
import { HttpClient } from './http.js';
import { 
  type CleanupRequest,
  type ReplaceRequest,
  type ProcessingResponse,
  type BackgroundMetadata,
  type BrandPreset,
  CleanupRequestSchema,
  ReplaceRequestSchema,
  BackgroundClientError
} from './types.js';

const logger = pino({ name: 'background-client' });

/**
 * Main background processing client
 */
export class BackgroundClient {
  private readonly httpClient: HttpClient;

  constructor(config?: Partial<Config>) {
    const finalConfig = config ? createConfig(config) : loadConfig();
    this.httpClient = new HttpClient(finalConfig);
    logger.info({ baseUrl: finalConfig.baseUrl }, 'Background client initialized');
  }

  /**
   * Clean up image background (remove or soften)
   */
  async cleanup(request: CleanupRequest): Promise<BackgroundMetadata> {
    const validated = CleanupRequestSchema.parse(request);
    
    logger.info({ 
      imagePath: validated.imagePath, 
      mode: validated.mode 
    }, 'Starting background cleanup');

    try {
      const response = await this.httpClient.cleanup({
        imagePath: validated.imagePath,
        mode: validated.mode,
        blurRadius: validated.blurRadius,
        desaturatePct: validated.desaturatePct,
        enhanceFg: validated.enhanceFg,
        denoise: validated.denoise
      });

      if (!response.success) {
        throw new BackgroundClientError(
          response.error || response.message || 'Cleanup failed',
          'CLEANUP_FAILED'
        );
      }

      const metadata: BackgroundMetadata = {
        mode: 'cleanup',
        outJpg: response.outputPath,
        processedAt: new Date().toISOString(),
        settings: {
          mode: validated.mode,
          blurRadius: validated.blurRadius,
          desaturatePct: validated.desaturatePct,
          enhanceFg: validated.enhanceFg,
          denoise: validated.denoise
        }
      };

      logger.info({ outputPath: response.outputPath }, 'Background cleanup completed');
      return metadata;

    } catch (error) {
      logger.error({ error: error.message }, 'Background cleanup failed');
      throw error;
    }
  }

  /**
   * Replace image background with AI-generated content
   */
  async replace(request: ReplaceRequest): Promise<BackgroundMetadata> {
    const validated = ReplaceRequestSchema.parse(request);
    
    logger.info({ 
      imagePath: validated.imagePath, 
      prompt: validated.prompt 
    }, 'Starting background replacement');

    try {
      const response = await this.httpClient.replace({
        imagePath: validated.imagePath,
        prompt: validated.prompt,
        negativePrompt: validated.negativePrompt,
        seed: validated.seed,
        engine: validated.engine,
        steps: validated.steps,
        guidanceScale: validated.guidanceScale,
        enhanceFg: validated.enhanceFg,
        matchColors: validated.matchColors,
        featherEdges: validated.featherEdges
      });

      if (!response.success) {
        throw new BackgroundClientError(
          response.error || response.message || 'Background replacement failed',
          'REPLACE_FAILED'
        );
      }

      const metadata: BackgroundMetadata = {
        mode: 'replace',
        engine: validated.engine,
        outJpg: response.outputPath,
        processedAt: new Date().toISOString(),
        prompt: validated.prompt,
        settings: {
          negativePrompt: validated.negativePrompt,
          seed: validated.seed,
          steps: validated.steps,
          guidanceScale: validated.guidanceScale,
          enhanceFg: validated.enhanceFg,
          matchColors: validated.matchColors,
          featherEdges: validated.featherEdges
        }
      };

      logger.info({ outputPath: response.outputPath }, 'Background replacement completed');
      return metadata;

    } catch (error) {
      logger.error({ error: error.message }, 'Background replacement failed');
      throw error;
    }
  }

  /**
   * Check if the background service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.httpClient.healthCheck();
      return true;
    } catch (error) {
      logger.warn({ error: error.message }, 'Background service health check failed');
      return false;
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{ status: string; engine: string; device: string }> {
    return this.httpClient.healthCheck();
  }
}

/**
 * Brand presets for automated background replacement
 */
export const brandPresets: Record<string, BrandPreset> = {
  vitrinealu: {
    name: 'VitrineAlu',
    prompts: {
      garden: 'modern minimalist garden with soft natural lighting, clean architectural lines, contemporary outdoor space',
      studio: 'professional photography studio with soft diffused lighting, neutral gray backdrop, clean minimal setup',
      minimal: 'clean white minimalist background with soft shadow, product photography style, professional lighting',
      lifestyle: 'modern living space with natural light, contemporary interior design, soft neutral colors'
    },
    negativePrompt: 'people, faces, text, watermark, cluttered, busy, dark, harsh shadows, oversaturated',
    settings: {
      steps: 25,
      guidanceScale: 7.5,
      engine: 'SDXL' as const
    }
  }
};

/**
 * Create a background client instance with default configuration
 */
export function createClient(config?: Partial<Config>): BackgroundClient {
  return new BackgroundClient(config);
}

/**
 * Create a background client instance from environment variables
 */
export function createClientFromEnv(): BackgroundClient {
  return new BackgroundClient();
}

// Export all types
export * from './types.js';
export * from './config.js';
export { HttpClient } from './http.js';