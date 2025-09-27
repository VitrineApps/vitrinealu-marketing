import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnv } from '@vitrinealu/shared/env';
import { logger } from '@vitrinealu/shared/logger';

const baseEnv = loadEnv();

const workerEnvSchema = z.object({
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  GOOGLE_DRIVE_CACHE_DIR: z.string().default(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'drive')
  ),
  GOOGLE_READY_PARENT_ID: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  APPROVAL_EDIT_BASE_URL: z.string().optional(),
  AESTHETIC_MODEL_PATH: z
    .string()
    .optional()
    .default(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'models', 'aesthetic-linear.onnx')
    ),
  AESTHETIC_THRESHOLD: z.coerce.number().default(0.62),
  TOPAZ_CLI: z.string().optional(),
  REAL_ESRGAN_BIN: z.string().optional(),
  ENHANCE_DEFAULT_SCALE: z.coerce.number().default(2),
  ENHANCE_KEEP_SCALE: z.coerce.number().default(1),
  PYTHON_BIN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  CAPTION_MODEL: z.string().default('gpt-4o-mini'),
  CAPTION_MAX_HASHTAGS: z.coerce.number().default(5),
  BUFFER_ACCESS_TOKEN: z.string().optional(),
  BUFFER_PROFILE_IDS_JSON: z.string().optional(),
  APPROVAL_SECRET: z.string().optional(),
  WEBHOOK_SECRET: z.string().min(32, 'WEBHOOK_SECRET must be at least 32 characters').optional(),
  ENHANCE_SERVICE_URL: z.string().default('http://localhost:8000'),
  RUNWAY_API_KEY: z.string().optional(),
  LOCAL_INPUT_DIR: z.string().default('/host/input')
});

const parsed = workerEnvSchema.parse(process.env);

export const env = {
  ...baseEnv,
  ...parsed
};

// Initialize directories
(async () => {
  await fs.mkdir(env.GOOGLE_DRIVE_CACHE_DIR, { recursive: true });
  await fs.mkdir(path.dirname(env.AESTHETIC_MODEL_PATH), { recursive: true });
})().catch((err: Error) => {
  logger.error({ err }, 'Failed to create directories');
});

logger.info(
  {
    timezone: env.TIMEZONE,
    redis: env.REDIS_URL,
    cacheDir: env.GOOGLE_DRIVE_CACHE_DIR,
    aestheticModel: env.AESTHETIC_MODEL_PATH,
    aestheticThreshold: env.AESTHETIC_THRESHOLD
  },
  'Worker environment loaded'
);


