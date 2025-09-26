import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env as config } from '../config.js';
import { getLLM } from './llm.js';
import { logger } from '@vitrinealu/shared';
import {
  captionSchema,
  type CaptionContext,
  type Platform,
  platformConfig,
  getOptimalHashtagCount,
  getPlatformTone,
} from './platformConfig.js';
import { z } from 'zod';

const captionResultSchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string().optional()
});

export type { CaptionContext, Platform };

export interface CaptionResult {
  text: string;
  hashtags: string[];
  cta?: string;
}

export async function generateCaption(
  platform: Platform,
  context: CaptionContext = {}
): Promise<CaptionResult> {
  // Validate and normalize input
  const request = captionSchema.parse({ platform, context });
  
  // Load platform-specific system prompt
  const systemPrompt = await loadSystemPrompt(platform);
  const userPrompt = buildUserPrompt(request.context, platform);

  // Generate content using LLM
  const llm = getLLM();
  const content = await llm.chat({
    system: systemPrompt,
    user: userPrompt,
    model: config.CAPTION_MODEL,
  });

  if (!content) {
    throw new Error(`No content generated for ${platform}`);
  }

  // Parse caption and hashtags with platform-aware logic
  const { text, hashtags } = parseContent(content, platform);
  
  const result: CaptionResult = {
    text,
    hashtags,
    cta: context.callToAction
  };

  captionResultSchema.parse(result);

  logger.info({
    text,
    hashtags: hashtags.length,
    platform,
  }, 'Caption generated successfully');

  return result;
}

// Legacy function for backward compatibility
export async function generateCaptionLegacy(
  channel: Platform,
  context: CaptionContext
): Promise<{ caption: string; hashtags: string[] }> {
  const result = await generateCaption(channel, context);
  return {
    caption: result.text,
    hashtags: result.hashtags,
  };
}

async function loadSystemPrompt(platform: Platform): Promise<string> {
  const filePath = join(process.cwd(), 'services', 'worker', 'prompts', `${platform}.md`);
  
  try {
    return await readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to load system prompt for ${platform}: ${(error as Error).message}`);
  }
}

function buildUserPrompt(context: CaptionContext, platform: Platform): string {
  const parts: string[] = [];
  const platformConf = platformConfig[platform];
  
  // Add context information
  if (context.product) parts.push(`Product/Service: ${context.product}`);
  if (context.locale) parts.push(`Locale: ${context.locale}`);
  if (context.season) parts.push(`Season/Timing: ${context.season}`);
  if (context.benefits && context.benefits.length > 0) {
    parts.push(`Key Benefits: ${context.benefits.join(', ')}`);
  }
  if (context.brandValues && context.brandValues.length > 0) {
    parts.push(`Brand Values: ${context.brandValues.join(', ')}`);
  }
  if (context.targetAudience) parts.push(`Target Audience: ${context.targetAudience}`);
  if (context.variantType) parts.push(`Content Type: ${context.variantType}`);
  
  // Add tone guidance
  const tone = getPlatformTone(platform, context.tone);
  parts.push(`Desired Tone: ${tone}`);
  
  // Add platform-specific constraints
  parts.push(`Platform: ${platform}`);
  parts.push(`Max Caption Length: ${platformConf.maxCaptionLength} characters`);
  parts.push(`Optimal Hashtag Count: ${getOptimalHashtagCount(platform)}`);
  
  // Add custom call-to-action if provided
  if (context.callToAction) {
    parts.push(`Call-to-Action: ${context.callToAction}`);
  }
  
  return parts.join('\n');
}

function parseContent(content: string, platform: Platform): { text: string; hashtags: string[] } {
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Separate hashtags from caption content
  const hashtagLines: string[] = [];
  const captionLines: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('#')) {
      // Extract individual hashtags from the line
      const tags = line.split(/\s+/).filter(tag => tag.startsWith('#'));
      hashtagLines.push(...tags);
    } else {
      captionLines.push(line);
    }
  }
  
  const caption = captionLines.join('\n').trim();
  const rawHashtags = hashtagLines.map(tag => tag.replace('#', '').trim());
  
  // Limit hashtags to platform optimal count
  const optimalCount = getOptimalHashtagCount(platform);
  const hashtags = rawHashtags.slice(0, optimalCount);
  
  return { text: caption, hashtags };
}

