import OpenAI from 'openai';
import { CaptionProvider } from './base.js';
import { Platform, CaptionJSON, CaptionJSONSchema } from '../types.js';
import { env } from '../config.js';
import { logger } from '../logger.js';
import { withRetry } from '../util/retry.js';

export class OpenAIProvider implements CaptionProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async generate(options: {
    platform: Platform;
    brief: string;
    productTags: string[];
    location?: string;
    features?: string[];
    brandTone?: string[];
    exif?: {
      lens: 'ultra-wide' | 'wide' | 'standard';
      timeOfDay: 'day' | 'golden_hour' | 'night';
    };
    seed?: number;
    model?: string;
  }): Promise<CaptionJSON> {
    const model = options.model || env.MODEL_NAME;

    const systemPrompt = `You are a social media caption generator. Create captions that are:
- Brand-safe and appropriate for all audiences
- Written in UK English
- Tailored to the ${options.platform} platform style
- Never include physical addresses
- Include 3-6 relevant hashtags
- End with a concise call to action

Respond with valid JSON matching this schema:
${JSON.stringify(CaptionJSONSchema.shape, null, 2)}`;

    const userContent = this.buildUserContent(options);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const result = await withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
        top_p: 0.9,
        seed: this.supportsSeed(model) ? options.seed : undefined,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Fallback: extract first JSON block safely
        const jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        parsed = JSON.parse(jsonMatch[0]);
      }

      const validated = CaptionJSONSchema.parse(parsed);
      return validated;
    });

    return result;
  }

  private buildUserContent(options: Parameters<CaptionProvider['generate']>[0]): string {
    let content = `Platform: ${options.platform}\nBrief: ${options.brief}\nProduct Tags: ${options.productTags.join(', ')}`;

    if (options.location) content += `\nLocation: ${options.location}`;
    if (options.features) content += `\nFeatures: ${options.features.join(', ')}`;
    if (options.brandTone) content += `\nBrand Tone: ${options.brandTone.join(', ')}`;
    if (options.exif) content += `\nEXIF: Lens ${options.exif.lens}, Time of day ${options.exif.timeOfDay}`;
    if (options.seed && !this.supportsSeed(options.model || env.MODEL_NAME)) {
      content += `\nSeed:${options.seed} — use to make consistent word choices.`;
    }

    return content;
  }

  private supportsSeed(model: string): boolean {
    return model.includes('gpt-4') || model.includes('gpt-3.5');
  }
}