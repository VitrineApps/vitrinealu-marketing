
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { planCarouselSlots } from '../plan';
import { generateForCarouselWithRetry } from '../captionerClient';
import { upsertCarousel, insertItems } from '../repository';
import { createCarouselDraft } from '../bufferClient';
import { config } from '../config';
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';

interface CarouselDraftJobParams {
  root: string;
  platform: 'instagram' | 'facebook';
  brandConfigPath?: string;
  dryRun?: boolean;
  seed?: number;
}

function hashContent(obj: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function findCarouselJsons(root: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry === 'carousel.json') results.push(full);
    }
  }
  walk(root);
  return results;
}

function inferConsecutiveImages(dir: string, min: number, max: number): string[][] {
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
  const groups: string[][] = [];
  for (let i = 0; i <= files.length - min; i++) {
    for (let len = min; len <= max && i + len <= files.length; len++) {
      groups.push(files.slice(i, i + len).map(f => path.join(dir, f)));
    }
  }
  return groups;
}

export async function createCarouselDraftsJob(params: CarouselDraftJobParams) {
  const { root, platform, dryRun, brandConfigPath, seed } = params;
  const minImages = config.config.CAROUSEL_MIN_IMAGES;
  const maxImages = config.config.CAROUSEL_MAX_IMAGES;
  const brandPath = brandConfigPath || config.config.BRAND_CONFIG_PATH;

  // 1. Find all carousels (carousel.json or infer)
  const carousels: { images: string[]; meta: any; dir: string }[] = [];
  for (const dir of fs.readdirSync(root)) {
    const fullDir = path.join(root, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const carouselJson = path.join(fullDir, 'carousel.json');
    if (fs.existsSync(carouselJson)) {
      const meta = JSON.parse(fs.readFileSync(carouselJson, 'utf-8'));
      if (Array.isArray(meta.images) && meta.images.length >= minImages && meta.images.length <= maxImages) {
        carousels.push({ images: meta.images.map((img: string) => path.join(fullDir, img)), meta, dir: fullDir });
      }
    } else {
      // Infer consecutive images
      const groups = inferConsecutiveImages(fullDir, minImages, maxImages);
      for (const group of groups) {
        carousels.push({ images: group, meta: {}, dir: fullDir });
      }
    }
  }

  // 2. Plan slots
  const slots = planCarouselSlots({ platform, count: carousels.length });

  // 3. For each planned slot, build text, call Buffer, persist
  for (let i = 0; i < slots.length; i++) {
    const carousel = carousels[i];
    if (!carousel) continue;
    // Generate caption and hashtags for carousel
    const captionResult = await generateForCarouselWithRetry({
      mediaPaths: carousel.images,
      platform,
      brandPath,
      seed: seed ?? i
    });
    const contentHash = hashContent({ platform, images: carousel.images, caption: captionResult.text });
    // Check idempotency
    const exists = await (async () => {
      try {
        const rows = require('../repository').db.prepare('SELECT 1 FROM carousels WHERE hash = ?').all(contentHash);
        return rows.length > 0;
      } catch {
        return false;
      }
    })();
    if (exists) {
      logger.info({ msg: 'SKIP duplicate carousel', hash: contentHash, images: carousel.images });
      continue;
    }
    if (dryRun) {
      logger.info({ msg: '[DRY RUN] Would create carousel draft', slot: slots[i], images: carousel.images, caption: captionResult.text, hashtags: captionResult.hashtags });
      continue;
    }
    // Call Buffer
    let bufferResult;
    try {
      // TODO: lookup channelId for platform from brand config
      const channelId = config.brandConfig.platforms?.[platform]?.bufferChannelId || '';
      bufferResult = await createCarouselDraft({
        channelId,
        text: captionResult.text,
        mediaUrls: carousel.images,
        scheduledAt: slots[i].scheduledAt.toISOString(),
        platform
      });
    } catch (err) {
      logger.error({ msg: 'Buffer createCarouselDraft failed', err });
      continue;
    }
    // Persist carousel and items
    const carouselId = uuidv4();
    await upsertCarousel({
      id: carouselId,
      platform,
      status: 'drafted',
      scheduledAt: slots[i].scheduledAt.toISOString(),
      caption: captionResult.text,
      cta: captionResult.cta,
      hash: contentHash
    });
    await insertItems(carousel.images.map((img, idx) => ({
      id: uuidv4(),
      carouselId,
      mediaPath: img,
      position: idx
    })));
    logger.info({ msg: 'OK Carousel draft created', hash: contentHash, count: carousel.images.length, updateId: bufferResult.updateId });
  }
}
