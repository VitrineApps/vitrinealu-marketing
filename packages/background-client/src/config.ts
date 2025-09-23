/**
 * Configuration management for the background client
 */

import { z } from 'zod';
import { ConfigSchema, type Config } from './types.js';

// Re-export Config type
export type { Config };

// Environment configuration schema
const EnvConfigSchema = z.object({
  BACKGROUND_API_URL: z.string().url().default('http://localhost:8089'),
  BACKGROUND_TIMEOUT: z.coerce.number().default(300000),
  BACKGROUND_RETRY_ATTEMPTS: z.coerce.number().default(3),
  BACKGROUND_RETRY_DELAY: z.coerce.number().default(1000)
});

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const env = EnvConfigSchema.parse(process.env);
  
  return ConfigSchema.parse({
    baseUrl: env.BACKGROUND_API_URL,
    timeout: env.BACKGROUND_TIMEOUT,
    retryAttempts: env.BACKGROUND_RETRY_ATTEMPTS,
    retryDelay: env.BACKGROUND_RETRY_DELAY
  });
}

/**
 * Create configuration with custom overrides
 */
export function createConfig(overrides: Partial<Config> = {}): Config {
  const defaultConfig = loadConfig();
  return ConfigSchema.parse({
    ...defaultConfig,
    ...overrides
  });
}

/**
 * Validate configuration
 */
export function validateConfig(config: unknown): Config {
  return ConfigSchema.parse(config);
}