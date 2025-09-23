import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
import YAML from 'yaml';

import { AppConfig, VideoProviderConfig } from './types.js';

dotenv.config();

function resolvePath(candidate: string | undefined, fallback: string): string {
  const value = candidate && candidate.trim().length ? candidate : fallback;
  return path.resolve(value);
}

function loadProvidersConfig(configPath: string): VideoProviderConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = YAML.parse(raw) ?? {};
  const video = parsed.video ?? {};
  return {
    backendOrder: Array.isArray(video.backend_order) ? video.backend_order : ['ffmpeg'],
    aspect: video.aspect ?? { vertical: '1080x1920', horizontal: '1920x1080' },
  };
}

export function loadConfig(): AppConfig {
  const assetsRoot = resolvePath(process.env.ASSETS_ROOT, './assets');
  const providersPath = resolvePath(process.env.PROVIDERS_CONFIG, './config/providers.yaml');
  const video = loadProvidersConfig(providersPath);

  return {
    assetsRoot,
    rendersPath: path.join(assetsRoot, 'renders'),
    readyPath: path.join(assetsRoot, 'ready'),
    video,
    azure: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      deploymentId: process.env.SORA_AZURE_DEPLOYMENT_ID ?? 'sora',
      pollingIntervalMs: Number(process.env.SORA_POLL_INTERVAL_MS ?? '5000'),
      maxPollAttempts: Number(process.env.SORA_MAX_POLL_ATTEMPTS ?? '20'),
    },
    runway: {
      apiKey: process.env.RUNWAY_API_KEY,
      endpoint: process.env.RUNWAY_API_ENDPOINT ?? 'https://api.runwayml.com/v1/videos',
    },
    pika: {
      apiKey: process.env.PIKA_API_KEY,
      endpoint: process.env.PIKA_API_ENDPOINT ?? 'https://api.pika.art/v2/videos',
    },
    ffmpeg: {
      watermarkPath: process.env.FFMPEG_WATERMARK_PATH,
      fontPath: process.env.FFMPEG_FONT_PATH,
    },
  };
}
