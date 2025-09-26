export declare function generateForCarousel({ mediaPaths, platform, brandPath, seed }: {
    mediaPaths: string[];
    platform: Platform;
    brandPath: string;
    seed?: number;
}): Promise<CaptionJSON>;
import { Platform, BrandKit, type CaptionJSON } from './types.js';
export interface GenerateOptions {
    mediaDir: string;
    platform: Platform;
    outFile?: string;
    providerName?: 'openai' | 'gemini' | 'mock';
    model?: string;
    seed?: number;
    concurrency?: number;
}
export interface CaptionResult extends CaptionJSON {
    meta: {
        file: string;
        hash: string;
        seed?: number;
        exif?: {
            lens: string;
            timeOfDay: string;
        };
    };
}
export declare const MEDIA_PATTERNS: readonly ["**/*.jpg", "**/*.jpeg", "**/*.png", "**/*.mp4"];
export declare function loadBrandKit(brandPath: string): Promise<BrandKit>;
export declare function generateForDir(options: GenerateOptions): Promise<CaptionResult[]>;
//# sourceMappingURL=generate.d.ts.map