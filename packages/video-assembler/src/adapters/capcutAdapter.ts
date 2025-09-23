import { performance } from 'perf_hooks';
import { writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type { IVideoAdapter, VideoAdapterResult, CapCutConfig } from './types';
import { VideoAdapterUnavailableError, VideoAdapterTimeoutError, VideoAdapterError } from './types';
import type { AssembleJob } from '../types';

/**
 * CapCut API responses
 */
interface CapCutRenderRequest {
  template_id: string;
  replacements: {
    images?: Array<{
      slot_id: string;
      url: string;
    }>;
    texts?: Array<{
      slot_id: string;
      text: string;
    }>;
    audios?: Array<{
      slot_id: string;
      url: string;
    }>;
  };
  output_config?: {
    resolution?: string;
    fps?: number;
    bitrate?: string;
  };
}

interface CapCutRenderResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
  };
}

interface CapCutStatusResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    status: 'pending' | 'processing' | 'success' | 'failed';
    progress?: number;
    result_url?: string;
    error_message?: string;
  };
}

/**
 * CapCut adapter for template-based video generation
 */
export class CapCutAdapter implements IVideoAdapter {
  readonly name = 'capcut';

  constructor(private config: CapCutConfig) {}

  async generate(job: AssembleJob): Promise<VideoAdapterResult> {
    const startTime = performance.now();

    try {
      // Prepare template replacements
      const replacements = await this.prepareReplacements(job);
      
      // Submit render request
      const taskId = await this.submitRender(replacements);
      
      // Poll for completion
      const resultUrl = await this.pollForCompletion(taskId);
      
      // Download result
      await this.downloadResult(resultUrl, job.outPath);
      
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      return {
        outPath: job.outPath,
        adapter: this.name,
        durationMs,
        metadata: {
          taskId,
          templateId: this.config.templateId,
          clips: job.clips.length,
          resultUrl,
        },
      };
    } catch (error) {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      if (error instanceof VideoAdapterError) {
        throw error;
      }

      throw new Error(`CapCut generation failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey || !this.config.templateId) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/template/info`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private async prepareReplacements(job: AssembleJob) {
    const replacements: CapCutRenderRequest['replacements'] = {
      images: [],
      texts: [],
      audios: [],
    };

    // Add image replacements
    job.clips.forEach((clip, index) => {
      replacements.images!.push({
        slot_id: `image_${index + 1}`,
        url: this.getPublicUrl(clip.image),
      });
    });

    // Add caption replacements if available
    if (job.captionJson) {
      try {
        const captions = JSON.parse(job.captionJson);
        if (Array.isArray(captions)) {
          captions.forEach((caption, index) => {
            replacements.texts!.push({
              slot_id: `text_${index + 1}`,
              text: caption.text || caption.content || '',
            });
          });
        }
      } catch (error) {
        // Ignore caption parsing errors
      }
    }

    // Add audio replacement if available
    if (job.musicPath) {
      replacements.audios!.push({
        slot_id: 'background_music',
        url: this.getPublicUrl(job.musicPath),
      });
    }

    return replacements;
  }

  private async submitRender(replacements: CapCutRenderRequest['replacements']): Promise<string> {
    const requestBody: CapCutRenderRequest = {
      template_id: this.config.templateId,
      replacements,
      output_config: {
        resolution: '1080p',
        fps: 30,
        bitrate: '10M',
      },
    };

    const response = await fetch(`${this.config.baseUrl}/v1/template/render`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new VideoAdapterUnavailableError(
        this.name,
        `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json() as CapCutRenderResponse;
    
    if (result.code !== 0) {
      throw new Error(`CapCut API error: ${result.message}`);
    }

    return result.data.task_id;
  }

  private async pollForCompletion(taskId: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = this.config.maxPollAttempts;
    const pollInterval = this.config.pollIntervalMs;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.config.baseUrl}/v1/template/status/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to check render status: HTTP ${response.status}`);
      }

      const result = await response.json() as CapCutStatusResponse;
      
      if (result.code !== 0) {
        throw new Error(`CapCut status error: ${result.message}`);
      }

      const { status, result_url, error_message } = result.data;

      switch (status) {
        case 'success':
          if (!result_url) {
            throw new Error('Render completed but no result URL provided');
          }
          return result_url;

        case 'failed':
          throw new Error(`Render failed: ${error_message || 'Unknown error'}`);

        case 'pending':
        case 'processing':
          // Continue polling
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          break;

        default:
          throw new Error(`Unknown render status: ${status}`);
      }
    }

    throw new VideoAdapterTimeoutError(this.name, maxAttempts * pollInterval);
  }

  private async downloadResult(url: string, outPath: string): Promise<void> {
    // Ensure output directory exists
    const outputDir = dirname(outPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download result: HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(outPath, Buffer.from(buffer));
  }

  private getPublicUrl(filePath: string): string {
    // In a real implementation, this would upload the file to a public URL
    // For now, assume files are already publicly accessible
    // This could integrate with AWS S3, Google Cloud Storage, etc.
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Placeholder - in production, upload to CDN and return public URL
    return `https://cdn.example.com/uploads/${encodeURIComponent(filePath)}`;
  }
}