export type AspectRatio = 'vertical' | 'horizontal' | 'square';

export interface VideoRequest {
  assetId: string;
  backend?: string;
  aspect?: AspectRatio;
  duration?: number;
  prompt?: string;
}

export interface VideoJob extends VideoRequest {
  sourcePath: string;
  aspectDimensions: string;
}

export interface AdapterResult {
  backend: string;
  filePath: string;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface VideoAdapter {
  readonly name: string;
  supports(job: VideoJob): boolean;
  generate(job: VideoJob): Promise<AdapterResult>;
}

export interface AzureSoraConfig {
  endpoint?: string;
  apiKey?: string;
  deploymentId?: string;
  pollingIntervalMs: number;
  maxPollAttempts: number;
}

export interface RunwayConfig {
  apiKey?: string;
  endpoint?: string;
}

export interface PikaConfig {
  apiKey?: string;
  endpoint?: string;
}

export interface FfmpegConfig {
  watermarkPath?: string;
  fontPath?: string;
}

export interface VideoProviderConfig {
  backendOrder: string[];
  aspect: Record<string, string>;
}

export interface AppConfig {
  assetsRoot: string;
  rendersPath: string;
  readyPath: string;
  video: VideoProviderConfig;
  azure: AzureSoraConfig;
  runway: RunwayConfig;
  pika: PikaConfig;
  ffmpeg: FfmpegConfig;
}
