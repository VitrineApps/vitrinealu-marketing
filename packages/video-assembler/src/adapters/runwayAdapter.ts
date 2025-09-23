import { performance } from 'perf_hooks';
import { writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type { IVideoAdapter, VideoAdapterResult, RunwayConfig } from './types';
import { VideoAdapterUnavailableError, VideoAdapterTimeoutError, VideoAdapterError } from './types';
import type { AssembleJob } from '../types';

/**
 * Runway API interfaces
 */
interface RunwayGenerateRequest {
  model: string;
  prompt: string;
  image?: string;
  duration?: number;
  aspect_ratio?: string;
  seed?: number;
}

interface RunwayGenerateResponse {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  failure?: string;
  failureCode?: string;
}

interface RunwayTaskResponse {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  progress?: number;
  failure?: string;
  failureCode?: string;
  output?: string[];
}

/**
 * Runway adapter for AI video generation
 */
export class RunwayAdapter implements IVideoAdapter {
  readonly name = 'runway';

  constructor(private config: RunwayConfig) {}

  async generate(job: AssembleJob): Promise<VideoAdapterResult> {
    const startTime = performance.now();

    try {
      // Generate video prompt from job
      const prompt = this.generatePrompt(job);
      
      // Get primary image for generation
      const primaryImage = await this.getPrimaryImage(job);
      
      // Submit generation request
      const taskId = await this.submitGeneration(prompt, primaryImage, job);
      
      // Poll for completion
      const videoUrl = await this.pollForCompletion(taskId);
      
      // Download result
      await this.downloadResult(videoUrl, job.outPath);
      
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      return {
        outPath: job.outPath,
        adapter: this.name,
        durationMs,
        metadata: {
          taskId,
          model: this.config.model,
          prompt,
          primaryImage,
          videoUrl,
        },
      };
    } catch (error) {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      if (error instanceof VideoAdapterError) {
        throw error;
      }

      throw new Error(`Runway generation failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/tasks`, {
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

  private generatePrompt(job: AssembleJob): string {
    let prompt = 'Create a professional video from the provided images';

    // Add profile-specific guidance
    if (job.profile === 'reel') {
      prompt += ' optimized for social media reels with dynamic transitions and engaging visual flow';
    } else if (job.profile === 'linkedin') {
      prompt += ' with a professional, corporate aesthetic suitable for business content';
    }

    // Add caption context if available
    if (job.captionJson) {
      try {
        const captions = JSON.parse(job.captionJson);
        if (Array.isArray(captions) && captions.length > 0) {
          const captionText = captions.map(c => c.text || c.content).filter(Boolean).join(' ');
          if (captionText) {
            prompt += `. The video should illustrate: ${captionText}`;
          }
        }
      } catch (error) {
        // Ignore caption parsing errors
      }
    }

    // Add visual style guidance
    prompt += '. Use smooth transitions, maintain visual coherence, and create an engaging narrative flow';

    return prompt;
  }

  private async getPrimaryImage(job: AssembleJob): Promise<string> {
    if (job.clips.length === 0) {
      throw new Error('No clips provided for Runway generation');
    }

    // Use the first clip as the primary image
    const primaryClip = job.clips[0];
    return this.getPublicUrl(primaryClip.image);
  }

  private async submitGeneration(prompt: string, imageUrl: string, job: AssembleJob): Promise<string> {
    const requestBody: RunwayGenerateRequest = {
      model: this.config.model,
      prompt,
      image: imageUrl,
      duration: this.calculateDuration(job),
      aspect_ratio: job.profile === 'reel' ? '9:16' : '16:9',
      seed: job.seed,
    };

    const response = await fetch(`${this.config.baseUrl}/v1/image_to_video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new VideoAdapterUnavailableError(
        this.name,
        `HTTP ${response.status}: ${errorText}`,
      );
    }

    const result = await response.json() as RunwayGenerateResponse;
    
    if (result.status === 'FAILED') {
      throw new Error(`Runway generation failed: ${result.failure || 'Unknown error'}`);
    }

    return result.id;
  }

  private async pollForCompletion(taskId: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = this.config.maxPollAttempts;
    const pollInterval = this.config.pollIntervalMs;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.config.baseUrl}/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to check generation status: HTTP ${response.status}`);
      }

      const result = await response.json() as RunwayTaskResponse;

      switch (result.status) {
        case 'SUCCEEDED':
          if (!result.output || result.output.length === 0) {
            throw new Error('Generation completed but no output provided');
          }
          return result.output[0];

        case 'FAILED':
          throw new Error(`Generation failed: ${result.failure || 'Unknown error'}`);

        case 'CANCELLED':
          throw new Error('Generation was cancelled');

        case 'PENDING':
        case 'RUNNING':
          // Continue polling
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          break;

        default:
          throw new Error(`Unknown generation status: ${result.status}`);
      }
    }

    throw new VideoAdapterTimeoutError(this.name, maxAttempts * pollInterval);
  }

  private calculateDuration(job: AssembleJob): number {
    // Calculate total duration from clips, capped at Runway limits
    const totalDuration = job.clips.reduce((sum, clip) => sum + (clip.durationSec || 3), 0);
    
    // Runway typically supports 5-10 second generations
    return Math.min(Math.max(totalDuration, 5), 10);
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
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Placeholder - in production, upload to CDN and return public URL
    return `https://cdn.example.com/uploads/${encodeURIComponent(filePath)}`;
  }
}