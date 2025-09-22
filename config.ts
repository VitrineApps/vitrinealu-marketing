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
  TOPAZ_CLI_BIN: z.string().optional(),
  REAL_ESRGAN_BIN: z.string().optional()
});

const parsed = workerEnvSchema.parse(process.env);

export const env = {
  ...baseEnv,
  ...parsed
};

await fs.mkdir(env.GOOGLE_DRIVE_CACHE_DIR, { recursive: true });
await fs.mkdir(path.dirname(env.AESTHETIC_MODEL_PATH), { recursive: true });

logger.info(
  {
    timezone: env.TIMEZONE,
    redis: env.REDIS_URL,
    cacheDir: env.GOOGLE_DRIVE_CACHE_DIR,
    aestheticModel: env.AESTHETIC_MODEL_PATH,
    aestheticThreshold: env.AESTHETIC_THRESHOLD,
    topazBin: env.TOPAZ_CLI_BIN,
    realEsrganBin: env.REAL_ESRGAN_BIN
  },
  'Worker environment loaded'
);


