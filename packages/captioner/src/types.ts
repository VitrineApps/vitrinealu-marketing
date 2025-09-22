import { z } from 'zod';

// Platform types
export type Platform = 'instagram' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'facebook';

export const PlatformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube_shorts',
  'linkedin',
  'facebook'
]);

// Caption JSON schema
export const CaptionJSONSchema = z.object({
  platform: PlatformSchema,
  caption: z.string().min(1, 'Caption cannot be empty'),
  hashtags: z.array(z.string()).min(1, 'At least one hashtag required'),
  call_to_action: z.string().min(1, 'Call to action cannot be empty'),
  compliance_notes: z.string().optional()
});

export type CaptionJSON = z.infer<typeof CaptionJSONSchema>;

// BrandKit type
export type BrandKit = {
  toneWords: string[];
  bannedHashtags: string[];
  locale: string;
};