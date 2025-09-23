import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().default(3000),
  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
    maxRetriesPerRequest: z.number().default(3),
  }),
  timezone: z.string().default('Europe/London'),
  ffmpegPath: z.string().optional(),
  media: z.object({
    uploadsDir: z.string().default('./uploads'),
    outputDir: z.string().default('./media/videos'),
    maxFileSize: z.number().default(100 * 1024 * 1024), // 100MB
  }),
  rate: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(100), // limit each IP to 100 requests per windowMs
  }),
  queue: z.object({
    concurrency: z.number().default(2),
    maxAttempts: z.number().default(3),
    backoffDelay: z.number().default(5000),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const config = {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES ? parseInt(process.env.REDIS_MAX_RETRIES) : 3,
    },
    timezone: process.env.TIMEZONE || 'Europe/London',
    ffmpegPath: process.env.FFMPEG_PATH,
    media: {
      uploadsDir: process.env.UPLOADS_DIR || './uploads',
      outputDir: process.env.OUTPUT_DIR || './media/videos',
      maxFileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : 100 * 1024 * 1024,
    },
    rate: {
      windowMs: process.env.RATE_WINDOW_MS ? parseInt(process.env.RATE_WINDOW_MS) : 15 * 60 * 1000,
      max: process.env.RATE_MAX ? parseInt(process.env.RATE_MAX) : 100,
    },
    queue: {
      concurrency: process.env.QUEUE_CONCURRENCY ? parseInt(process.env.QUEUE_CONCURRENCY) : 2,
      maxAttempts: process.env.QUEUE_MAX_ATTEMPTS ? parseInt(process.env.QUEUE_MAX_ATTEMPTS) : 3,
      backoffDelay: process.env.QUEUE_BACKOFF_DELAY ? parseInt(process.env.QUEUE_BACKOFF_DELAY) : 5000,
    },
  };

  return ConfigSchema.parse(config);
}

/**
 * Validate required environment
 */
export function validateEnvironment(): void {
  const required = ['REDIS_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}