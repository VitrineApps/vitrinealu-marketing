import { z } from 'zod';

export const BackgroundConfigSchema = z.object({
  presets_enabled: z.boolean(),
  default_engine: z.enum(['diffusion', 'runway']),
  allowed_presets: z.array(z.string()),
  routing_rules: z.array(z.object({
    condition: z.object({
      tags: z.array(z.string()).optional(),
      product: z.string().optional(),
    }),
    preset: z.string(),
  })),
});

export type BackgroundConfig = z.infer<typeof BackgroundConfigSchema>;

export const BackgroundResultSchema = z.object({
  engine: z.string(),
  preset: z.string(),
  seed: z.number().nullable(),
  metrics: z.object({
    elapsed_ms: z.number(),
  }),
  artifacts: z.object({
    output: z.string(),
    mask: z.string().optional(),
  }),
});

export type BackgroundResult = z.infer<typeof BackgroundResultSchema>;

export const BackgroundJobSchema = z.object({
  mediaId: z.string(),
  inputPath: z.string(),
  outputPath: z.string(),
  projectId: z.string(),
  product: z.string().optional(),
  tags: z.array(z.string()),
});

export type BackgroundJob = z.infer<typeof BackgroundJobSchema>;