import axios from 'axios';

import { AppConfig, AdapterResult, VideoAdapter, VideoJob } from '../types.js';
import { prepareOutputPath, writeVideoFile } from '../storage.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SoraAzureAdapter implements VideoAdapter {
  readonly name = 'sora_azure';

  constructor(private readonly config: AppConfig) {}

  supports(_job: VideoJob): boolean {
    return Boolean(this.config.azure.endpoint && this.config.azure.apiKey);
  }

  async generate(job: VideoJob): Promise<AdapterResult> {
    const azure = this.config.azure;
    if (!azure.endpoint || !azure.apiKey) {
      throw new Error('Azure Sora configuration missing endpoint or api key');
    }

    const submitUrl = azure.endpoint.replace(/\/?$/, '/') + 'openai/deployments/' + azure.deploymentId + '/jobs';
    const submitResponse = await axios.post(
      submitUrl,
      {
        input: {
          type: 'image',
          assetPath: job.sourcePath,
          prompt: job.prompt ?? 'Cinematic walkthrough',
          aspect: job.aspectDimensions,
          duration: job.duration ?? 15,
        },
      },
      {
        headers: {
          'api-key': azure.apiKey,
        },
      },
    );

    const jobId = (submitResponse.data && submitResponse.data.id) as string | undefined;
    if (!jobId) {
      throw new Error('Azure Sora response missing job id');
    }

    let downloadUrl: string | undefined;
    let duration = job.duration ?? 15;
    for (let attempt = 0; attempt < azure.maxPollAttempts; attempt += 1) {
      await sleep(azure.pollingIntervalMs);
      const statusUrl = submitUrl + '/' + jobId;
      const status = await axios.get(statusUrl, {
        headers: {
          'api-key': azure.apiKey,
        },
      });
      const data = status.data ?? {};
      if (data.status === 'succeeded') {
        const output = data.output ?? {};
        const assets = data.assets ?? [];
        downloadUrl = output.url ?? (assets.length ? assets[0].url : undefined);
        duration = output.duration ?? duration;
        break;
      }
      if (data.status === 'failed') {
        throw new Error('Azure Sora job failed');
      }
    }

    if (!downloadUrl) {
      throw new Error('Azure Sora job timed out');
    }

    const videoResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const prepared = prepareOutputPath(this.config, job.assetId);
    await writeVideoFile(prepared.filePath, Buffer.from(videoResponse.data));

    return {
      backend: this.name,
      filePath: prepared.filePath,
      duration,
      metadata: {
        jobId,
        outputUrl: prepared.relativeUrl,
      },
    };
  }
}

export default SoraAzureAdapter;
