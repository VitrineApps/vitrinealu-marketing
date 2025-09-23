import axios from 'axios';

import { AppConfig, AdapterResult, VideoAdapter, VideoJob } from '../types.js';
import { prepareOutputPath, writeVideoFile } from '../storage.js';

export class PikaAdapter implements VideoAdapter {
  readonly name = 'pika';

  constructor(private readonly config: AppConfig) {}

  supports(_job: VideoJob): boolean {
    return Boolean(this.config.pika.apiKey);
  }

  async generate(job: VideoJob): Promise<AdapterResult> {
    const pika = this.config.pika;
    if (!pika.apiKey) {
      throw new Error('Pika API key missing');
    }
    const endpoint = pika.endpoint ?? 'https://api.pika.art/v2/videos';
    const response = await axios.post(
      endpoint,
      {
        imagePath: job.sourcePath,
        prompt: job.prompt ?? 'Dynamic slider-inspired motion',
        aspect: job.aspectDimensions,
        duration: job.duration ?? 12,
      },
      {
        headers: {
          'X-API-Key': pika.apiKey,
        },
      },
    );
    const data = response.data ?? {};
    const downloadUrl = data.download_url ?? data.video_url;
    if (!downloadUrl) {
      throw new Error('Pika response missing download URL');
    }
    const duration = data.duration ?? (job.duration ?? 12);
    const video = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const prepared = prepareOutputPath(this.config, job.assetId);
    await writeVideoFile(prepared.filePath, Buffer.from(video.data));
    return {
      backend: this.name,
      filePath: prepared.filePath,
      duration,
      metadata: {
        outputUrl: prepared.relativeUrl,
      },
    };
  }
}

export default PikaAdapter;
