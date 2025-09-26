import { Platform } from './types.js';
export declare function clampCaptionLength(platform: Platform, caption: string): string;
export declare function clampByPlatform(platform: Platform, text: string): string;
export declare function filterBannedWords(caption: string, banned: string[]): string;
export declare function applyBanlist(hashtags: string[], banned: string[]): string[];
export declare const removeEmojis: (s: string) => string;
//# sourceMappingURL=promptGuards.d.ts.map