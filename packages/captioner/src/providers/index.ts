import { CaptionProvider } from './base.js';
import { OpenAIProvider } from './openaiProvider.js';
import { GeminiProvider } from './geminiProvider.js';
import mockProvider from './mockProvider.js';
import { env } from '../config.js';
import { logger } from '../logger.js';

export function getProvider(name?: 'openai' | 'gemini' | 'mock'): CaptionProvider {
  const providerName = name || env.DEFAULT_LLM_PROVIDER;

  try {
    switch (providerName) {
      case 'openai':
        return new OpenAIProvider();
      case 'gemini':
        return new GeminiProvider();
      case 'mock':
        return mockProvider;
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, provider: providerName }, 'Failed to initialize provider');
    throw error;
  }
}