import { GoogleGenerativeAI } from '@google/generative-ai';
import { CaptionProvider } from './base.js';
import { Platform, CaptionJSON, CaptionJSONSchema } from '../types.js';
import { env } from '../config.js';
import { logger } from '../logger.js';
import { withRetry } from '../util/retry.js';

export class GeminiProvider implements CaptionProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    const key = apiKey || env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Gemini API key is required');
    }
    this.client = new GoogleGenerativeAI(key);
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
    const modelName = options.model || 'gemini-pro';

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
    const fullPrompt = `${systemPrompt}\n\n${userContent}`;

    const result = await withRetry(async () => {
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          ...(options.seed && { randomSeed: options.seed }),
        },
      });

      const response = await model.generateContent(fullPrompt);
      const text = response.response.text();

      if (!text) {
        throw new Error('No content in response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Fallback: extract first JSON block safely
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
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

    return content;
  }
}