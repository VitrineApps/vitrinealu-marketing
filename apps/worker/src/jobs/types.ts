import { z } from 'zod';

export const hashJobSchema = z.object({
  fileId: z.string()
});

export const scoreJobSchema = z.object({
  fileId: z.string()
});

export const enhanceJobSchema = z.object({
  assetId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sync: z.boolean().optional()
}).refine(data => data.assetId || data.sourceUrl, {
  message: "Either assetId or sourceUrl must be provided"
});

export const privacyBlurJobSchema = z.object({
  fileId: z.string()
});

export const backgroundCleanupJobSchema = z.object({
  fileId: z.string(),
  mode: z.enum(['clean', 'replace']).default('clean'),
  prompt: z.string().optional()
});

export const reelJobSchema = z.object({
  assetIds: z.array(z.string()).min(1),
  music: z.enum(['cinematic', 'uplift']).optional(),
  textOverlays: z.array(z.string()).optional()
});

export const linkedinJobSchema = z.object({
  assetIds: z.array(z.string()).min(1),
  narration: z.string().optional()
});

export const captionJobSchema = z.object({
  context: z.record(z.any()),
  channel: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'])
});

export const bufferScheduleJobSchema = z.object({
  posts: z
    .array(
      z.object({
        text: z.string(),
        profileIds: z.array(z.string()).min(1),
        scheduledAt: z.string().optional(),
        media: z
          .object({
            link: z.string().url().optional(),
            mediaUrls: z.array(z.string().url()).optional()
          })
          .partial()
          .optional()
      })
    )
    .min(1)
});

export type HashJobData = z.infer<typeof hashJobSchema>;
export type ScoreJobData = z.infer<typeof scoreJobSchema>;
export type EnhanceJobData = z.infer<typeof enhanceJobSchema>;
export type PrivacyBlurJobData = z.infer<typeof privacyBlurJobSchema>;
export type BackgroundCleanupJobData = z.infer<typeof backgroundCleanupJobSchema>;
export type ReelJobData = z.infer<typeof reelJobSchema>;
export type LinkedinJobData = z.infer<typeof linkedinJobSchema>;
export type CaptionJobData = z.infer<typeof captionJobSchema>;
export type BufferScheduleJobData = z.infer<typeof bufferScheduleJobSchema>;

export type MediaJobData =
  | ({ kind: 'hash' } & HashJobData)
  | ({ kind: 'score' } & ScoreJobData)
  | ({ kind: 'enhance' } & EnhanceJobData)
  | ({ kind: 'privacyBlur' } & PrivacyBlurJobData)
  | ({ kind: 'backgroundCleanup' } & BackgroundCleanupJobData)
  | ({ kind: 'videoReel' } & ReelJobData)
  | ({ kind: 'videoLinkedin' } & LinkedinJobData)
  | ({ kind: 'caption' } & CaptionJobData)
  | ({ kind: 'bufferSchedule' } & BufferScheduleJobData);

export type MediaJobResult =
  | { kind: 'hash'; hash: string }
  | { kind: 'score'; score: number; isCandidate: boolean }
  | { kind: 'enhance'; url: string; metadata: { provider: string; scale: number; ms: number } }
  | { kind: 'privacyBlur'; url: string }
  | { kind: 'backgroundCleanup'; url: string }
  | { kind: 'videoReel'; mp4Url: string; thumbUrl: string }
  | { kind: 'videoLinkedin'; mp4Url: string; thumbUrl: string }
  | { kind: 'caption'; caption: string; hashtags: string[] }
  | { kind: 'bufferSchedule'; bufferIds: string[] };
