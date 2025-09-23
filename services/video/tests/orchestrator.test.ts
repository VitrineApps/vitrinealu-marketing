import { jest } from '@jest/globals';

import { AppConfig, AdapterResult, VideoAdapter, VideoRequest } from '../src/types.js';

jest.unstable_mockModule('../src/storage.js', () => ({
  resolveSourceAsset: jest.fn(() => '/tmp/source.png'),
}));

const { VideoOrchestrator } = await import('../src/orchestrator.js');

function createConfig(): AppConfig {
  return {
    assetsRoot: '/tmp/assets',
    rendersPath: '/tmp/assets/renders',
    readyPath: '/tmp/assets/ready',
    video: {
      backendOrder: ['sora_azure', 'runway', 'ffmpeg'],
      aspect: {
        vertical: '1080x1920',
        horizontal: '1920x1080',
      },
    },
    azure: {
      endpoint: 'https://azure.example.com',
      apiKey: 'key',
      deploymentId: 'sora',
      pollingIntervalMs: 10,
      maxPollAttempts: 1,
    },
    runway: {
      apiKey: 'runway',
      endpoint: 'https://runway.example.com',
    },
    pika: {
      apiKey: 'pika',
      endpoint: 'https://pika.example.com',
    },
    ffmpeg: {
      watermarkPath: undefined,
      fontPath: undefined,
    },
  };
}

describe('VideoOrchestrator', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('falls back when the first adapter fails', async () => {
    const config = createConfig();
    const failing: VideoAdapter = {
      name: 'sora_azure',
      supports: jest.fn().mockReturnValue(true),
      generate: jest.fn().mockRejectedValue(new Error('fail')),
    };
    const succeedingResult: AdapterResult = {
      backend: 'runway',
      filePath: '/tmp/assets/renders/asset/output.mp4',
      duration: 15,
      metadata: { outputUrl: '/assets/renders/asset/output.mp4' },
    };
    const succeeding: VideoAdapter = {
      name: 'runway',
      supports: jest.fn().mockReturnValue(true),
      generate: jest.fn().mockResolvedValue(succeedingResult),
    };
    const orchestrator = new VideoOrchestrator(config, [failing, succeeding]);

    const result = await orchestrator.generate({ assetId: 'asset' });

    expect(failing.generate).toHaveBeenCalled();
    expect(succeeding.generate).toHaveBeenCalled();
    expect(result.backend).toBe('runway');
    expect(result.outputUrl).toBe('/assets/renders/asset/output.mp4');
  });

  it('prioritises requested backend if available', async () => {
    const config = createConfig();
    const preferred: VideoAdapter = {
      name: 'ffmpeg',
      supports: jest.fn().mockReturnValue(true),
      generate: jest.fn().mockResolvedValue({
        backend: 'ffmpeg',
        filePath: '/tmp/assets/renders/asset/ffmpeg.mp4',
        duration: 12,
        metadata: {},
      }),
    };
    const orchestrator = new VideoOrchestrator(config, [preferred]);

    const result = await orchestrator.generate({ assetId: 'asset', backend: 'ffmpeg' });

    expect(preferred.generate).toHaveBeenCalledTimes(1);
    expect(result.backend).toBe('ffmpeg');
  });

  it('throws aggregated error when all adapters fail', async () => {
    const config = createConfig();
    const adapter: VideoAdapter = {
      name: 'sora_azure',
      supports: jest.fn().mockReturnValue(true),
      generate: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const orchestrator = new VideoOrchestrator(config, [adapter]);

    await expect(orchestrator.generate({ assetId: 'asset' } as VideoRequest)).rejects.toThrow('boom');
  });
});
