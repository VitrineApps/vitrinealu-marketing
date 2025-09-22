import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { env as config } from '../config.js';
import { getLLM } from './llm.js';

const Schema = z.object({
  channel: z.enum(["instagram", "tiktok", "linkedin", "youtube"]),
  context: z.object({
    product: z.string().optional(),
    locale: z.string().optional(),
    season: z.string().optional(),
    benefits: z.array(z.string()).default([]),
    tone: z.string().optional(),
    variantType: z.string().optional()
  })
});

type CaptionInput = z.infer<typeof Schema>;

export async function generateCaption(
  channel: CaptionInput['channel'], 
  context: CaptionInput['context']
): Promise<{ caption: string; hashtags: string[] }> {
  // Validate input
  const validated = Schema.parse({ channel, context });
  
  const systemPrompt = await loadSystemPrompt(validated.channel);
  const userPrompt = buildUserPrompt(validated.context);

  const llm = getLLM();
  const content = await llm.chat({
    system: systemPrompt,
    user: userPrompt,
    model: config.CAPTION_MODEL
  });

  if (!content) {
    throw new Error('No content generated');
  }

  // Parse caption and hashtags
  const lines = content.split('\n');
  const caption = lines.filter(line => !line.startsWith('#')).join('\n').trim();
  const allHashtags = lines.filter(line => line.startsWith('#')).map(line => line.trim());
  const hashtags = pickTopN(allHashtags, config.CAPTION_MAX_HASHTAGS);

  return { caption, hashtags };
}

async function loadSystemPrompt(channel: string): Promise<string> {
  const fileName = `system.${channel === 'youtube' ? 'youtube' : channel === 'tiktok' ? 'tiktok' : channel === 'linkedin' ? 'linkedin' : 'ig'}.txt`;
  const filePath = join(process.cwd(), 'prompts', fileName);
  return readFile(filePath, 'utf-8');
}

function buildUserPrompt(context: CaptionInput['context']): string {
  const parts: string[] = [];
  
  if (context.product) parts.push(`Product: ${context.product}`);
  if (context.locale) parts.push(`Locale: ${context.locale}`);
  if (context.season) parts.push(`Season: ${context.season}`);
  if (context.benefits.length > 0) parts.push(`Benefits: ${context.benefits.join(', ')}`);
  if (context.tone) parts.push(`Tone: ${context.tone}`);
  if (context.variantType) parts.push(`Variant Type: ${context.variantType}`);
  
  return parts.join('\n');
}

function pickTopN(hashtags: string[], n: number): string[] {
  return hashtags.slice(0, n);
}