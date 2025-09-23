import axios from 'axios';

import { AppConfig, AdapterResult, VideoAdapter, VideoJob } from '../types.js';
import { prepareOutputPath, writeVideoFile } from '../storage.js';

export class RunwayAdapter implements VideoAdapter {
  readonly name = 'runway';

  constructor(private readonly config: AppConfig) {}

  supports(_job: VideoJob): boolean {
    return Boolean(this.config.runway.apiKey);
  }

  async generate(job: VideoJob): Promise<AdapterResult> {
    const runway = this.config.runway;
    if (!runway.apiKey) {
      throw new Error('Runway API key missing');
    }
    const endpoint = runway.endpoint ?? 'https://api.runwayml.com/v1/videos';
    const response = await axios.post(
      endpoint,
      {
        imagePath: job.sourcePath,
        prompt: job.prompt ?? 'Cinematic pans and zooms',
        aspect: job.aspectDimensions,
        duration: job.duration ?? 15,
      },
      {
        headers: {
          Authorization: 'Bearer ' + runway.apiKey,
        },
      },
    );
    const data = response.data ?? {};
    const downloadUrl = data.download_url ?? data.url;
    if (!downloadUrl) {
      throw new Error('Runway response missing download URL');
    }
    const duration = data.duration ?? (job.duration ?? 15);
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

export default RunwayAdapter;
