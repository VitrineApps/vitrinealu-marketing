import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

import { AppConfig, VideoJob } from '../src/types.js';

let lastCommand: any;

function createMockCommand() {
  const handlers: Record<string, () => void> = {};
  const command: any = {
    recordedFilters: [] as string[],
    recordedComplex: [] as string[],
    loop: jest.fn().mockImplementation(() => command),
    input: jest.fn().mockImplementation(() => command),
    videoFilters: jest.fn().mockImplementation((filters: string[]) => {
      command.recordedFilters = filters;
      return command;
    }),
    complexFilter: jest.fn().mockImplementation((filters: string[]) => {
      command.recordedComplex = filters;
      return command;
    }),
    videoCodec: jest.fn().mockImplementation(() => command),
    audioCodec: jest.fn().mockImplementation(() => command),
    outputOptions: jest.fn().mockImplementation(() => command),
    duration: jest.fn().mockImplementation(() => command),
    output: jest.fn().mockImplementation(() => command),
    on: jest.fn().mockImplementation((event: string, handler: () => void) => {
      handlers[event] = handler;
      return command;
    }),
    run: jest.fn().mockImplementation(() => {
      if (handlers.end) {
        handlers.end();
      }
    }),
  };
  lastCommand = command;
  return command;
}

jest.unstable_mockModule('fluent-ffmpeg', () => ({
  default: jest.fn(() => createMockCommand()),
}));

const { FfmpegAdapter } = await import('../src/adapters/FfmpegAdapter.js');

function baseConfig(): AppConfig {
  const assetsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'video-service-'));
  return {
    assetsRoot,
    rendersPath: path.join(assetsRoot, 'renders'),
    readyPath: path.join(assetsRoot, 'ready'),
    video: {
      backendOrder: ['ffmpeg'],
      aspect: {
        vertical: '1080x1920',
        horizontal: '1920x1080',
      },
    },
    azure: {
      endpoint: undefined,
      apiKey: undefined,
      deploymentId: 'sora',
      pollingIntervalMs: 1,
      maxPollAttempts: 1,
    },
    runway: {
      apiKey: undefined,
      endpoint: undefined,
    },
    pika: {
      apiKey: undefined,
      endpoint: undefined,
    },
    ffmpeg: {
      watermarkPath: undefined,
      fontPath: undefined,
    },
  };
}

describe('FfmpegAdapter', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('generates with scale and pad filters', async () => {
    const config = baseConfig();
    const adapter = new FfmpegAdapter(config);
    const sourcePath = path.join(config.assetsRoot, 'image.png');
    fs.writeFileSync(sourcePath, 'data');

    const job: VideoJob = {
      assetId: 'asset',
      aspect: 'vertical',
      aspectDimensions: '1080x1920',
      sourcePath,
      duration: 10,
    } as VideoJob;

    await adapter.generate(job);

    expect(lastCommand.videoFilters).toHaveBeenCalled();
    expect(lastCommand.recordedFilters[0]).toContain('scale=1080:1920');
    expect(lastCommand.duration).toHaveBeenCalledWith(10);
  });

  it('applies watermark when path provided', async () => {
    const config = baseConfig();
    const watermark = path.join(config.assetsRoot, 'wm.png');
    fs.writeFileSync(watermark, 'watermark');
    config.ffmpeg.watermarkPath = watermark;
    const adapter = new FfmpegAdapter(config);
    const sourcePath = path.join(config.assetsRoot, 'image.png');
    fs.writeFileSync(sourcePath, 'data');

    const job: VideoJob = {
      assetId: 'asset',
      aspect: 'vertical',
      aspectDimensions: '1080x1920',
      sourcePath,
      duration: 8,
    };

    await adapter.generate(job);

    expect(lastCommand.complexFilter).toHaveBeenCalled();
    expect(lastCommand.recordedComplex[0]).toContain('[0:v]scale=1080:1920');
  });
});
