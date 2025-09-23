// Generate caption for a multi-image carousel
export async function generateForCarousel({ mediaPaths, platform, brandPath, seed }: { mediaPaths: string[]; platform: Platform; brandPath: string; seed?: number }): Promise<CaptionJSON> {
  const brandKit = await loadBrandKit(brandPath);
  // Use all basenames as product tags
  const productTags = mediaPaths.map(p => path.basename(p, path.extname(p)).replace(/[-_]/g, ' '));
  // Compose a brief for the carousel
  const brief = `Carousel: ${productTags.join(', ')}`;
  // Use first image's EXIF as a hint (could be extended)
  const exifHints = await extractExifHints(mediaPaths[0]).catch(() => ({ lens: 'standard' as const, timeOfDay: 'day' as const }));
  const promptInputs = {
    brief,
    productTags,
    location: brandKit.locale,
    features: [],
    brandTone: brandKit.toneWords,
    exifHints,
    brand: {
      toneWords: brandKit.toneWords,
      bannedHashtags: brandKit.bannedHashtags,
      locale: brandKit.locale,
    },
  };
  const prompt = buildPrompt(platform, promptInputs);
  const provider = getProvider('openai'); // Or configurable
  const rawCaption = await provider.generate({
    platform,
    brief: prompt,
    productTags,
    location: brandKit.locale,
    features: [],
    brandTone: brandKit.toneWords,
    exif: exifHints,
    seed,
  });
  const validated = CaptionJSONSchema.parse(rawCaption);
  // Hashtag limits
  const limitByPlatform = { instagram: 30, tiktok: 30, youtube_shorts: 15, linkedin: 4, facebook: 5 } as const;
  const lim = limitByPlatform[platform];
  const deduped = Array.from(new Set(validated.hashtags.map(h => h.toLowerCase())));
  const seedNum = seed ?? 0;
  const sorted = deduped.sort((a,b) => (a+b+seedNum).localeCompare(b+a+seedNum));
  validated.hashtags = sorted.slice(0, lim);
  validated.caption = filterBannedWords(validated.caption, brandKit.bannedHashtags);
  validated.hashtags = applyBanlist(validated.hashtags, brandKit.bannedHashtags);
  if (platform === 'linkedin') validated.caption = removeEmojis(validated.caption);
  validated.caption = clampByPlatform(platform, validated.caption);
  return validated;
}
import { globby } from 'globby';
import { ensureDir } from 'fs-extra';
import { readFile, writeFile } from 'node:fs/promises';
import * as yaml from 'yaml';
import { getProvider } from './providers/index.js';
import { extractExifHints } from './extractors/exif.js';
import { createHash } from 'crypto';
import path from 'path';
import pLimit from 'p-limit';
import { buildPrompt } from './promptTemplates.js';
import { clampByPlatform, applyBanlist, filterBannedWords, removeEmojis } from './promptGuards.js';
import { type CaptionProvider } from './providers/base.js';
import { CaptionJSONSchema, Platform, BrandKit, type CaptionJSON } from './types.js';
import { logger } from './logger.js';

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

export const MEDIA_PATTERNS = ['**/*.jpg','**/*.jpeg','**/*.png','**/*.mp4'] as const;

export async function loadBrandKit(brandPath: string): Promise<BrandKit> {
  const content = await readFile(brandPath, 'utf-8');
  const data = yaml.parse(content) ?? {};
  return {
    toneWords: data?.tone_words ?? ['inspiring','authentic'],
    bannedHashtags: data?.banned_hashtags ?? [],
    locale: data?.locale ?? 'en-GB',
  };
}

export async function generateForDir(options: GenerateOptions): Promise<CaptionResult[]> {
  const {
    mediaDir,
    platform,
    outFile,
    providerName,
    model,
    seed,
    concurrency = 4,
  } = options;

  // Load brand kit from default location
  const brandPath = path.resolve('../../config/brand.yaml');
  const brandKit = await loadBrandKit(brandPath);

  // Find media files
  const files = await globby(MEDIA_PATTERNS, { cwd: mediaDir, absolute: true });
  if (!files.length) { logger.warn({ mediaDir }, 'No media files found'); return []; }
  logger.info({ count: files.length, mediaDir }, 'Found media files');

  // Create provider
  const provider = getProvider(providerName);

  // Set up concurrency limiter
  const limit = pLimit(concurrency);

  // Process files concurrently
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return await processMediaFile(file, platform, brandKit, provider, model, seed, limit);
      } catch (error) {
        logger.error({ file, error: error instanceof Error ? error.message : String(error) }, 'Failed to process media file');
        throw error;
      }
    })
  );

  // Write sidecar files
  await Promise.all(
    results.map((result) => writeSidecarFile(result, mediaDir))
  );

  // Write merged output if requested
  if (outFile) {
    const outDir = path.resolve(outFile);
    await ensureDir(outDir);
    await writeFile(path.join(outDir, 'captions.json'), JSON.stringify(results, null, 2));
    logger.info({ outFile, count: results.length }, 'Wrote merged output');
  }

  logger.info({ processed: results.length }, 'Caption generation completed');
  return results;
}

async function processMediaFile(
  filePath: string,
  platform: Platform,
  brandKit: BrandKit,
  provider: CaptionProvider,
  model?: string,
  seed?: number,
  limit?: ReturnType<typeof pLimit>
): Promise<CaptionResult> {
  const basename = path.basename(filePath, path.extname(filePath));

  // Extract EXIF hints
  const exifHints = await extractExifHints(filePath).catch(() => ({ lens: 'standard' as const, timeOfDay: 'day' as const }));

  // Build prompt inputs
  const promptInputs = {
    brief: `Image: ${basename}`,
    productTags: [basename.replace(/[-_]/g, ' ')],
    location: brandKit.locale,
    features: [],
    brandTone: brandKit.toneWords,
    exifHints,
    brand: {
      toneWords: brandKit.toneWords,
      bannedHashtags: brandKit.bannedHashtags,
      locale: brandKit.locale,
    },
  };

  // Build prompt
  const prompt = buildPrompt(platform, promptInputs);

  // Generate caption with concurrency limit
  const rawCaption = await limit!(() => provider.generate({
    platform,
    brief: prompt,
    productTags: promptInputs.productTags,
    location: promptInputs.location,
    features: promptInputs.features,
    brandTone: promptInputs.brandTone,
    exif: exifHints,
    seed,
    model,
  }));

  // Validate and process
  const validated = CaptionJSONSchema.parse(rawCaption);

  // Apply platform-specific hashtag count limits and stable sorting
  const limitByPlatform = { instagram: 30, tiktok: 30, youtube_shorts: 15, linkedin: 4, facebook: 5 } as const;
  const lim = limitByPlatform[platform];
  const deduped = Array.from(new Set(validated.hashtags.map(h => h.toLowerCase())));
  // stable order using seed
  const seedNum = seed ?? 0;
  const sorted = deduped.sort((a,b) => (a+b+seedNum).localeCompare(b+a+seedNum));
  validated.hashtags = sorted.slice(0, lim);

  // Apply banned word filter
  validated.caption = filterBannedWords(validated.caption, brandKit.bannedHashtags);
  validated.hashtags = applyBanlist(validated.hashtags, brandKit.bannedHashtags);

  // Remove emojis from LinkedIn captions
  if (platform === 'linkedin') {
    validated.caption = removeEmojis(validated.caption);
  }

  // Clamp length
  validated.caption = clampByPlatform(platform, validated.caption);

  // Compute hash for idempotency
  const hashInput = JSON.stringify({
    file: filePath,
    platform,
    prompt,
    seed,
    model,
  });
  const hash = createHash('sha256').update(hashInput).digest('hex');

  return {
    ...validated,
    meta: {
      file: path.relative(process.cwd(), filePath),
      hash,
      seed,
      exif: exifHints,
    },
  };
}

async function writeSidecarFile(result: CaptionResult, mediaDir: string): Promise<void> {
  const base = path.resolve(mediaDir, path.basename(result.meta.file, path.extname(result.meta.file)));
  await writeFile(`${base}.captions.${result.platform}.json`, JSON.stringify(result, null, 2));
}