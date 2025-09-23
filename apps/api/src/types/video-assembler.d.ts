declare module '@vitrinealu/video-assembler' {
  export interface AdapterFactory {
    generateVideo(job: AssembleJob, preferredAdapter?: string): Promise<VideoAdapterResult>;
    getAvailableAdapters(): Promise<string[]>;
    isAdapterAvailable(adapter: string): Promise<boolean>;
    clearAvailabilityCache(): void;
    config: {
      defaultAdapter: string;
      fallbackOrder: string[];
      enableFallback: boolean;
    };
  }
  
  export function createAdapterFactoryFromEnv(): AdapterFactory;
  export function assembleWithAdapters(job: AssembleJob): Promise<VideoAdapterResult>;
  export function getAvailableAdapters(): Promise<string[]>;
  export function isAdapterAvailable(adapter: string): Promise<boolean>;
  
  export interface ClipInput {
    image: string;
    durationSec?: number;
    pan?: 'ltr' | 'rtl' | 'center';
    zoom?: 'in' | 'out' | 'none';
  }

  export interface AssembleJob {
    profile: 'reel' | 'linkedin';
    clips: ClipInput[];
    captionJson?: string;
    watermarkPath?: string;
    musicPath?: string;
    outPath: string;
    brandPath?: string;
    seed?: number;
    adapter?: 'ffmpeg' | 'capcut' | 'runway';
  }
  
  export interface VideoAdapterResult {
    outputPath: string;
    metadata: {
      adapter: string;
      duration?: number;
      [key: string]: unknown;
    };
  }
}