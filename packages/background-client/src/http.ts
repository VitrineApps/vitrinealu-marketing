/**
 * HTTP client utilities for the background service
 */

import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import FormData from 'form-data';
import fetch, { type Response } from 'node-fetch';
import pRetry from 'p-retry';
import pino from 'pino';

import { 
  BackgroundClientError, 
  BackgroundNetworkError, 
  BackgroundTimeoutError,
  type Config,
  type ProcessingResponse,
  ProcessingResponseSchema
} from './types.js';

const logger = pino({ name: 'background-client' });

/**
 * HTTP client for the background processing service
 */
export class HttpClient {
  constructor(private readonly config: Config) {}

  /**
   * Validate that an image file exists and is accessible
   */
  private async validateImageFile(imagePath: string): Promise<void> {
    if (!existsSync(imagePath)) {
      throw new BackgroundClientError(`Image file not found: ${imagePath}`, 'FILE_NOT_FOUND');
    }

    try {
      const stats = await stat(imagePath);
      if (!stats.isFile()) {
        throw new BackgroundClientError(`Path is not a file: ${imagePath}`, 'INVALID_FILE');
      }
      
      // Check file size (max 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (stats.size > maxSize) {
        throw new BackgroundClientError(
          `File too large: ${stats.size} bytes (max ${maxSize})`, 
          'FILE_TOO_LARGE'
        );
      }
    } catch (error) {
      if (error instanceof BackgroundClientError) {
        throw error;
      }
      throw new BackgroundClientError(`Failed to access file: ${imagePath}`, 'FILE_ACCESS_ERROR');
    }
  }

  /**
   * Create multipart form data for file upload
   */
  private createFormData(imagePath: string, additionalFields: Record<string, any> = {}): FormData {
    const form = new FormData();
    
    // Add the image file
    form.append('file', createReadStream(imagePath));
    
    // Add additional form fields
    for (const [key, value] of Object.entries(additionalFields)) {
      if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    }
    
    return form;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(
    endpoint: string, 
    formData: FormData,
    operationType: string
  ): Promise<ProcessingResponse> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    return pRetry(
      async () => {
        logger.info({ url, operation: operationType }, 'Making request to background service');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            headers: {
              ...formData.getHeaders()
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            const errorText = await response.text();
            logger.error({ 
              status: response.status, 
              statusText: response.statusText,
              error: errorText 
            }, 'Request failed');
            
            throw new BackgroundNetworkError(
              `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
              response.status
            );
          }
          
          const result = await response.json();
          const validatedResult = ProcessingResponseSchema.parse(result);
          
          logger.info({ 
            success: validatedResult.success,
            outputPath: validatedResult.outputPath 
          }, 'Request completed successfully');
          
          return validatedResult;
          
        } catch (error) {
          clearTimeout(timeoutId);
          
          if (error.name === 'AbortError') {
            throw new BackgroundTimeoutError('Request timed out');
          }
          
          if (error instanceof BackgroundClientError) {
            throw error;
          }
          
          throw new BackgroundNetworkError(`Network error: ${error.message}`);
        }
      },
      {
        retries: this.config.retryAttempts,
        minTimeout: this.config.retryDelay,
        factor: 2,
        maxTimeout: this.config.retryDelay * 8,
        onFailedAttempt: (error) => {
          logger.warn({
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.message
          }, 'Request attempt failed, retrying...');
        }
      }
    );
  }

  /**
   * Upload image for cleanup processing
   */
  async cleanup(params: {
    imagePath: string;
    mode?: 'transparent' | 'soften';
    blurRadius?: number;
    desaturatePct?: number;
    enhanceFg?: boolean;
    denoise?: boolean;
  }): Promise<ProcessingResponse> {
    await this.validateImageFile(params.imagePath);
    
    const formData = this.createFormData(params.imagePath, {
      mode: params.mode || 'transparent',
      blur_radius: params.blurRadius,
      desaturate_pct: params.desaturatePct,
      enhance_fg: params.enhanceFg !== false,
      denoise: params.denoise || false
    });
    
    return this.makeRequest('/background/cleanup', formData, 'cleanup');
  }

  /**
   * Upload image for background replacement
   */
  async replace(params: {
    imagePath: string;
    prompt: string;
    negativePrompt?: string;
    seed?: number;
    engine?: 'SDXL' | 'RUNWAY';
    steps?: number;
    guidanceScale?: number;
    enhanceFg?: boolean;
    matchColors?: boolean;
    featherEdges?: boolean;
  }): Promise<ProcessingResponse> {
    await this.validateImageFile(params.imagePath);
    
    if (!params.prompt?.trim()) {
      throw new BackgroundClientError('Prompt is required for background replacement', 'MISSING_PROMPT');
    }
    
    const formData = this.createFormData(params.imagePath, {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || 'people, text, watermark',
      seed: params.seed,
      engine: params.engine,
      steps: params.steps || 20,
      guidance_scale: params.guidanceScale || 7.5,
      enhance_fg: params.enhanceFg !== false,
      match_colors: params.matchColors !== false,
      feather_edges: params.featherEdges !== false
    });
    
    return this.makeRequest('/background/replace', formData, 'replace');
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<{ status: string; engine: string; device: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (!response.ok) {
        throw new BackgroundNetworkError(`Health check failed: ${response.statusText}`, response.status);
      }
      
      return await response.json() as any;
    } catch (error) {
      if (error instanceof BackgroundClientError) {
        throw error;
      }
      throw new BackgroundNetworkError(`Health check failed: ${error.message}`);
    }
  }
}