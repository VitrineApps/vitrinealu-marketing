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

export function buildPrompt(platform: Platform, inputs: PromptInputs): string {
  const { brief, productTags, location, features, brandTone, exifHints, brand } = inputs;

  // Use brand.locale if available, else location
  const region = (brand?.locale || location) ? ` in the ${(brand?.locale || location)?.split(',')[0]} region` : '';
  const featureBullets = features ? features.map(f => `- ${f}`).join('\n') : '';
  const exifBullets = exifHints ? `- ${exifHints.lens} lens\n- taken during ${exifHints.timeOfDay}` : '';
  const toneVocab = (brand?.toneWords || brandTone) ? `Use vocabulary that is ${(brand?.toneWords || brandTone)?.join(', ')}.` : '';

  switch (platform) {
    case 'instagram':
    case 'tiktok':
      return `Create a lifestyle-focused caption for ${platform} about: ${brief}

Key benefits: ${productTags.map(tag => `benefits of ${tag}`).join(', ')}${region}

Features:
${featureBullets}
${exifBullets}

${toneVocab}

Style: Use emojis, keep 80-180 words, include 3-6 hashtags, end with CTA: "Tap link in bio for a free quote."`;

    case 'youtube_shorts':
      return `Create a YouTube Shorts caption with a concise hook first line about: ${brief}

Key benefits: ${productTags.map(tag => `benefits of ${tag}`).join(', ')}${region}

Features:
${featureBullets}
${exifBullets}

${toneVocab}

Style: Start with hook, 1-3 hashtags, end with CTA: "Learn more via our site."`;

    case 'linkedin':
      return `Create a professional LinkedIn caption about: ${brief}

Key benefits: ${productTags.map(tag => `benefits of ${tag}`).join(', ')}${region}

Features:
${featureBullets}
${exifBullets}

${toneVocab}

Style: Spec-driven, no emojis, 60-140 words, 2-4 hashtags, end with CTA: "Request a specification or site survey."`;

    case 'facebook':
      return `Create a friendly Facebook caption about: ${brief}

Key benefits: ${productTags.map(tag => `benefits of ${tag}`).join(', ')}${region}

Features:
${featureBullets}
${exifBullets}

${toneVocab}

Style: Friendly tone, 60-120 words, 3-5 hashtags.`;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}