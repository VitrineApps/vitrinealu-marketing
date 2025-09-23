import path from 'path';

import { AppConfig, AdapterResult, VideoAdapter, VideoJob, VideoRequest } from './types.js';
import { resolveSourceAsset } from './storage.js';

interface GenerationResult extends AdapterResult {
  outputUrl: string;
}

export class VideoOrchestrator {
  private readonly adapterMap = new Map<string, VideoAdapter>();

  constructor(private readonly config: AppConfig, adapters: VideoAdapter[]) {
    for (const adapter of adapters) {
      this.adapterMap.set(adapter.name, adapter);
    }
  }

  async generate(request: VideoRequest): Promise<GenerationResult> {
    const aspectKey = request.aspect ?? 'vertical';
    const aspectDimensions = this.config.video.aspect[aspectKey] ?? this.config.video.aspect.vertical;
    const sourcePath = resolveSourceAsset(this.config, request.assetId);
    const job: VideoJob = {
      ...request,
      aspect: aspectKey,
      aspectDimensions,
      sourcePath,
      duration: request.duration ?? 15,
    };

    const order = this.selectBackends(request.backend);
    const errors: Error[] = [];

    for (const backend of order) {
      const adapter = this.adapterMap.get(backend);
      if (!adapter) {
        continue;
      }
      if (!adapter.supports(job)) {
        continue;
      }
      try {
        const result = await adapter.generate(job);
        const outputUrl = this.resolveOutputUrl(result);
        return {
          ...result,
          outputUrl,
        };
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    const message = errors.length ? errors.map((err) => err.message).join('; ') : 'no backends available';
    throw new Error('Video generation failed: ' + message);
  }

  private selectBackends(preferred?: string): string[] {
    const order = [...this.config.video.backendOrder];
    if (preferred) {
      if (order.includes(preferred)) {
        return [preferred, ...order.filter((name) => name !== preferred)];
      }
      return [preferred, ...order];
    }
    return order;
  }

  private resolveOutputUrl(result: AdapterResult): string {
    if (result.metadata && typeof result.metadata.outputUrl === 'string') {
      return result.metadata.outputUrl as string;
    }
    const relative = path.relative(this.config.assetsRoot, result.filePath).split(path.sep).join('/');
    return '/' + relative.replace(/^\/+/, '');
  }
}
