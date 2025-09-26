import { Platform } from './types.js';
export interface PromptInputs {
    brief: string;
    productTags: string[];
    location?: string;
    features?: string[];
    brandTone?: string[];
    exifHints?: {
        lens: 'ultra-wide' | 'wide' | 'standard';
        timeOfDay: 'day' | 'golden_hour' | 'night';
    };
    brand?: {
        toneWords: string[];
        bannedHashtags?: string[];
        locale?: string;
    };
}
export declare function buildPrompt(platform: Platform, inputs: PromptInputs): string;
//# sourceMappingURL=promptTemplates.d.ts.map