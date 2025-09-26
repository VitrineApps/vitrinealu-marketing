import { z } from 'zod';

// Helper function for basic emoji detection
function hasEmojis(text: string): boolean {
  // Simple approach: check for high unicode codepoints typically used by emojis
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Common emoji ranges (simplified)
    if (code >= 0x1F600 && code <= 0x1F64F) return true; // Faces
    if (code >= 0x1F300 && code <= 0x1F5FF) return true; // Symbols
    if (code >= 0x1F680 && code <= 0x1F6FF) return true; // Transport
    if (code >= 0x2600 && code <= 0x26FF) return true;   // Miscellaneous symbols
  }
  return false;
}

// Platform-specific constraints and configuration
export const platformConfig = {
  instagram: {
    tone: 'lifestyle, premium, warm, concise',
    maxCaptionLength: 2200,
    maxHashtags: 5,
    recommendedHashtags: 5,
    allowsEmojis: true,
    allowsLinks: false, // Links in bio only
    characterCountIncludesHashtags: true,
  },
  tiktok: {
    tone: 'energetic, punchy, hook-first',
    maxCaptionLength: 150,
    maxHashtags: 5,
    recommendedHashtags: 5,
    allowsEmojis: true,
    allowsLinks: false,
    characterCountIncludesHashtags: true,
  },
  linkedin: {
    tone: 'professional, spec-led, value-focused',
    maxCaptionLength: 3000,
    maxHashtags: 3,
    recommendedHashtags: 3,
    allowsEmojis: false,
    allowsLinks: true,
    characterCountIncludesHashtags: false,
  },
  youtube: {
    tone: 'informative',
    maxCaptionLength: 5000,
    maxHashtags: 15,
    recommendedHashtags: 8,
    allowsEmojis: true,
    allowsLinks: true,
    characterCountIncludesHashtags: false,
  },
  facebook: {
    tone: 'friendly',
    maxCaptionLength: 63206, // Very high limit
    maxHashtags: 30,
    recommendedHashtags: 5,
    allowsEmojis: true,
    allowsLinks: true,
    characterCountIncludesHashtags: false,
  },
} as const;

export type Platform = keyof typeof platformConfig;

// Zod schema for hashtag validation
export const hashtagSchema = z.object({
  tag: z.string()
    .min(2, 'Hashtag must be at least 2 characters')
    .max(100, 'Hashtag too long')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid hashtag format: must start with letter, contain only letters/numbers/underscores')
    .refine(tag => !tag.match(/^\d+$/), 'Hashtag cannot be only numbers'),
  platform: z.enum(['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook']),
});

export const captionSchema = z.object({
  platform: z.enum(['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook']),
  caption: z.string().min(1, 'Caption cannot be empty'),
  hashtags: z.array(z.string()).default([]),
  context: z.object({
    product: z.string().optional(),
    locale: z.string().optional().default('en-US'),
    season: z.string().optional(),
    benefits: z.array(z.string()).default([]),
    tone: z.string().optional(), // Can override platform default
    variantType: z.string().optional(),
    callToAction: z.string().optional(),
    brandValues: z.array(z.string()).default([]),
    targetAudience: z.string().optional(),
  }).default({}),
});

export type CaptionRequest = z.infer<typeof captionSchema>;
export type CaptionContext = CaptionRequest['context'];

// Validation function for platform-specific constraints
export function validateCaptionForPlatform(
  caption: string,
  hashtags: string[],
  platform: Platform
): { isValid: boolean; errors: string[] } {
  const config = platformConfig[platform];
  const errors: string[] = [];

  // Validate caption length
  const totalLength = config.characterCountIncludesHashtags 
    ? caption.length + hashtags.join(' #').length + hashtags.length // +1 for each # symbol
    : caption.length;

  if (totalLength > config.maxCaptionLength) {
    errors.push(`Caption too long: ${totalLength}/${config.maxCaptionLength} characters`);
  }

  // Validate hashtag count
  if (hashtags.length > config.maxHashtags) {
    errors.push(`Too many hashtags: ${hashtags.length}/${config.maxHashtags}`);
  }

  // Validate individual hashtags
  hashtags.forEach((hashtag, index) => {
    const result = hashtagSchema.safeParse({ tag: hashtag, platform });
    if (!result.success) {
      errors.push(`Invalid hashtag #${index + 1}: ${result.error.errors[0]?.message}`);
    }
  });

  // Platform-specific validations - basic emoji detection
  if (!config.allowsEmojis && hasEmojis(caption)) {
    errors.push(`${platform} does not allow emojis in captions`);
  }

  if (!config.allowsLinks && /(https?:\/\/[^\s]+)/g.test(caption)) {
    errors.push(`${platform} does not allow links in captions`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Helper function to get optimal hashtag count for platform
export function getOptimalHashtagCount(platform: Platform): number {
  return platformConfig[platform].recommendedHashtags;
}

// Helper function to get platform tone
export function getPlatformTone(platform: Platform, customTone?: string): string {
  return customTone || platformConfig[platform].tone;
}