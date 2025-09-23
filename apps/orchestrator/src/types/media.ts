import { z } from 'zod';

// Media item aspect ratios
export type MediaAspect = 'square' | 'portrait' | 'landscape';

// Media item with curation metadata
export const MediaItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  path: z.string(),
  curatedScore: z.number().min(0).max(1),
  createdAt: z.date(),
  aspect: z.enum(['square', 'portrait', 'landscape']),
  tags: z.array(z.string()).default([])
});

export type MediaItem = z.infer<typeof MediaItemSchema>;

// Carousel plan for grouped media
export const CarouselPlanSchema = z.object({
  projectId: z.string(),
  mediaIds: z.array(z.string()).min(1),
  coverId: z.string(), // First/highest-scored media ID
  aspect: z.enum(['square', 'portrait', 'landscape'])
});

export type CarouselPlan = z.infer<typeof CarouselPlanSchema>;

// Platform constraints for carousel building
export interface PlatformConstraints {
  maxAssets: number;
  minAssets: number;
  supportsCarousel: boolean;
  prefersSameAspect: boolean;
}

// Network constraints loaded from config
export const networkConstraints: Record<string, PlatformConstraints> = {
  instagram: {
    maxAssets: 10,
    minAssets: 2,
    supportsCarousel: true,
    prefersSameAspect: true
  },
  facebook: {
    maxAssets: 10,
    minAssets: 2,
    supportsCarousel: true,
    prefersSameAspect: false
  },
  twitter: {
    maxAssets: 4,
    minAssets: 2,
    supportsCarousel: true,
    prefersSameAspect: false
  },
  linkedin: {
    maxAssets: 9,
    minAssets: 2,
    supportsCarousel: true,
    prefersSameAspect: false
  }
};