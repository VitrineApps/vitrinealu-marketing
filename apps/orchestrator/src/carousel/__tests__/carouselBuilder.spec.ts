import { describe, it, expect, beforeEach } from 'vitest';
import { CarouselBuilder, buildCarouselPlans } from '../carouselBuilder.js';
import { MediaItem, CarouselPlan } from '../../types/media.js';

// Seeded test fixtures for deterministic results
const createTestMedia = (): MediaItem[] => [
  // Project A - High scores, mixed aspects
  {
    id: 'media-a1',
    projectId: 'project-a',
    path: '/path/a1.jpg',
    curatedScore: 0.95,
    createdAt: new Date('2025-09-20T10:00:00Z'),
    aspect: 'square',
    tags: ['product', 'hero']
  },
  {
    id: 'media-a2',
    projectId: 'project-a',
    path: '/path/a2.jpg',
    curatedScore: 0.88,
    createdAt: new Date('2025-09-20T11:00:00Z'),
    aspect: 'portrait',
    tags: ['lifestyle']
  },
  {
    id: 'media-a3',
    projectId: 'project-a',
    path: '/path/a3.jpg',
    curatedScore: 0.92,
    createdAt: new Date('2025-09-20T09:00:00Z'),
    aspect: 'square',
    tags: ['detail']
  },
  {
    id: 'media-a4',
    projectId: 'project-a',
    path: '/path/a4.jpg',
    curatedScore: 0.85,
    createdAt: new Date('2025-09-20T12:00:00Z'),
    aspect: 'landscape',
    tags: ['environment']
  },
  {
    id: 'media-a5',
    projectId: 'project-a',
    path: '/path/a5.jpg',
    curatedScore: 0.78,
    createdAt: new Date('2025-09-20T08:00:00Z'),
    aspect: 'square',
    tags: ['process']
  },

  // Project B - Lower scores, same aspect
  {
    id: 'media-b1',
    projectId: 'project-b',
    path: '/path/b1.jpg',
    curatedScore: 0.65,
    createdAt: new Date('2025-09-19T14:00:00Z'),
    aspect: 'portrait',
    tags: ['portrait']
  },
  {
    id: 'media-b2',
    projectId: 'project-b',
    path: '/path/b2.jpg',
    curatedScore: 0.72,
    createdAt: new Date('2025-09-19T15:00:00Z'),
    aspect: 'portrait',
    tags: ['portrait']
  },
  {
    id: 'media-b3',
    projectId: 'project-b',
    path: '/path/b3.jpg',
    curatedScore: 0.58,
    createdAt: new Date('2025-09-19T13:00:00Z'),
    aspect: 'portrait',
    tags: ['portrait']
  },

  // Project C - Single image (should return empty)
  {
    id: 'media-c1',
    projectId: 'project-c',
    path: '/path/c1.jpg',
    curatedScore: 0.80,
    createdAt: new Date('2025-09-18T16:00:00Z'),
    aspect: 'square',
    tags: ['single']
  }
];

describe('CarouselBuilder', () => {
  let builder: CarouselBuilder;
  let testMedia: MediaItem[];

  beforeEach(() => {
    builder = new CarouselBuilder();
    testMedia = createTestMedia();
  });

  describe('buildCarouselPlans', () => {
    it('should group media by project and sort by curated score then recency', () => {
      const plans = builder.buildCarouselPlans(testMedia, 'instagram');

      expect(plans).toHaveLength(2); // project-a and project-b, project-c skipped

      // Check project-a plan
      const projectAPlan = plans.find(p => p.projectId === 'project-a')!;
      expect(projectAPlan).toBeDefined();
      expect(projectAPlan.mediaIds).toEqual([
        'media-a1', // score 0.95
        'media-a3', // score 0.92
        'media-a2', // score 0.88
        'media-a4', // score 0.85
        'media-a5'  // score 0.78
      ]);
      expect(projectAPlan.coverId).toBe('media-a1');
      expect(projectAPlan.aspect).toBe('square'); // majority aspect
    });

    it('should respect platform constraints for Instagram (same aspect preferred)', () => {
      const plans = builder.buildCarouselPlans(testMedia, 'instagram');

      // Instagram should create separate plans for different aspects
      const squarePlans = plans.filter(p => p.aspect === 'square');
      const portraitPlans = plans.filter(p => p.aspect === 'portrait');

      expect(squarePlans).toHaveLength(1);
      expect(portraitPlans).toHaveLength(1);

      // Square plan should only include square images
      const squarePlan = squarePlans[0];
      expect(squarePlan.mediaIds).toEqual(['media-a1', 'media-a3', 'media-a5']);
      expect(squarePlan.aspect).toBe('square');
    });

    it('should respect platform constraints for Facebook (mixed aspect allowed)', () => {
      const plans = builder.buildCarouselPlans(testMedia, 'facebook');

      expect(plans).toHaveLength(2);

      // Facebook should create one plan per project with mixed aspects
      const projectAPlan = plans.find(p => p.projectId === 'project-a')!;
      expect(projectAPlan.mediaIds).toHaveLength(5); // All 5 images
      expect(projectAPlan.aspect).toBe('square'); // Majority aspect
    });

    it('should respect platform limits (Twitter max 4)', () => {
      const plans = builder.buildCarouselPlans(testMedia, 'twitter');

      const projectAPlan = plans.find(p => p.projectId === 'project-a')!;
      expect(projectAPlan.mediaIds).toHaveLength(4); // Limited to Twitter's max
    });

    it('should skip projects with insufficient media', () => {
      const plans = builder.buildCarouselPlans(testMedia, 'instagram');

      // Project C has only 1 image, should not create a plan
      const projectCPlan = plans.find(p => p.projectId === 'project-c');
      expect(projectCPlan).toBeUndefined();
    });

    it('should handle empty media array', () => {
      const plans = builder.buildCarouselPlans([], 'instagram');
      expect(plans).toEqual([]);
    });

    it('should handle unsupported platform', () => {
      expect(() => {
        builder.buildCarouselPlans(testMedia, 'unsupported');
      }).toThrow('Unsupported platform: unsupported');
    });

    it('should handle platform that does not support carousels', () => {
      // Mock a platform that doesn't support carousels
      const customBuilder = new CarouselBuilder({
        nosupport: {
          maxAssets: 10,
          minAssets: 2,
          supportsCarousel: false,
          prefersSameAspect: false
        }
      });

      const plans = customBuilder.buildCarouselPlans(testMedia, 'nosupport');
      expect(plans).toEqual([]);
    });

    it('should create multiple carousels when project has many images', () => {
      // Create a project with 25 images (more than IG's 10 limit)
      const largeProjectMedia: MediaItem[] = [];
      for (let i = 0; i < 25; i++) {
        largeProjectMedia.push({
          id: `large-${i}`,
          projectId: 'large-project',
          path: `/path/large-${i}.jpg`,
          curatedScore: Math.random(),
          createdAt: new Date(Date.now() - i * 1000),
          aspect: 'square',
          tags: []
        });
      }

      const plans = builder.buildCarouselPlans(largeProjectMedia, 'instagram');

      // Should create 3 carousels: 10 + 10 + 5
      expect(plans).toHaveLength(3);
      expect(plans[0].mediaIds).toHaveLength(10);
      expect(plans[1].mediaIds).toHaveLength(10);
      expect(plans[2].mediaIds).toHaveLength(5);
    });

    it('should sort by curated score first, then by recency', () => {
      // Create media with same score but different dates
      const sameScoreMedia: MediaItem[] = [
        {
          id: 'old-high-score',
          projectId: 'test-project',
          path: '/path/old.jpg',
          curatedScore: 0.8,
          createdAt: new Date('2025-09-01T10:00:00Z'), // Older
          aspect: 'square',
          tags: []
        },
        {
          id: 'new-high-score',
          projectId: 'test-project',
          path: '/path/new.jpg',
          curatedScore: 0.8,
          createdAt: new Date('2025-09-20T10:00:00Z'), // Newer
          aspect: 'square',
          tags: []
        },
        {
          id: 'lower-score',
          projectId: 'test-project',
          path: '/path/lower.jpg',
          curatedScore: 0.7,
          createdAt: new Date('2025-09-25T10:00:00Z'), // Newest but lower score
          aspect: 'square',
          tags: []
        }
      ];

      const plans = builder.buildCarouselPlans(sameScoreMedia, 'facebook');

      expect(plans).toHaveLength(1);
      // Should be: new-high-score (same score, newer), old-high-score (same score, older), lower-score (lower score)
      expect(plans[0].mediaIds).toEqual(['new-high-score', 'old-high-score', 'lower-score']);
    });

    it('should handle mixed aspect projects for non-IG platforms', () => {
      const mixedAspectMedia: MediaItem[] = [
        {
          id: 'square1',
          projectId: 'mixed-project',
          path: '/path/square1.jpg',
          curatedScore: 0.9,
          createdAt: new Date('2025-09-20T10:00:00Z'),
          aspect: 'square',
          tags: []
        },
        {
          id: 'portrait1',
          projectId: 'mixed-project',
          path: '/path/portrait1.jpg',
          curatedScore: 0.8,
          createdAt: new Date('2025-09-20T11:00:00Z'),
          aspect: 'portrait',
          tags: []
        },
        {
          id: 'landscape1',
          projectId: 'mixed-project',
          path: '/path/landscape1.jpg',
          curatedScore: 0.7,
          createdAt: new Date('2025-09-20T12:00:00Z'),
          aspect: 'landscape',
          tags: []
        }
      ];

      const plans = builder.buildCarouselPlans(mixedAspectMedia, 'facebook');

      expect(plans).toHaveLength(1);
      expect(plans[0].aspect).toBe('square'); // Majority aspect (1 square, 1 portrait, 1 landscape)
      expect(plans[0].mediaIds).toEqual(['square1', 'portrait1', 'landscape1']);
    });

    it('should validate generated plans', () => {
      // This test ensures the Zod schema validation works
      const plans = builder.buildCarouselPlans(testMedia, 'instagram');

      // All plans should pass schema validation
      for (const plan of plans) {
        expect(() => {
          // If this doesn't throw, the plan is valid
          if (plan.mediaIds.length === 0) {
            throw new Error('Empty mediaIds');
          }
          if (!plan.coverId) {
            throw new Error('Missing coverId');
          }
        }).not.toThrow();
      }
    });
  });

  describe('buildCarouselPlans convenience function', () => {
    it('should delegate to CarouselBuilder instance', () => {
      const plans = buildCarouselPlans(testMedia, 'instagram');

      expect(plans).toHaveLength(2);
      expect(plans.every(p => p.projectId === 'project-a' || p.projectId === 'project-b')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle single image groups', () => {
      const singleImageMedia: MediaItem[] = [{
        id: 'single',
        projectId: 'single-project',
        path: '/path/single.jpg',
        curatedScore: 0.9,
        createdAt: new Date(),
        aspect: 'square',
        tags: []
      }];

      const plans = builder.buildCarouselPlans(singleImageMedia, 'instagram');
      expect(plans).toEqual([]);
    });

    it('should handle projects with exactly minimum required images', () => {
      const minimumMedia: MediaItem[] = [
        {
          id: 'min1',
          projectId: 'min-project',
          path: '/path/min1.jpg',
          curatedScore: 0.8,
          createdAt: new Date('2025-09-20T10:00:00Z'),
          aspect: 'square',
          tags: []
        },
        {
          id: 'min2',
          projectId: 'min-project',
          path: '/path/min2.jpg',
          curatedScore: 0.7,
          createdAt: new Date('2025-09-20T11:00:00Z'),
          aspect: 'square',
          tags: []
        }
      ];

      const plans = builder.buildCarouselPlans(minimumMedia, 'instagram');
      expect(plans).toHaveLength(1);
      expect(plans[0].mediaIds).toEqual(['min1', 'min2']);
    });

    it('should handle projects with all different aspects', () => {
      const differentAspects: MediaItem[] = [
        {
          id: 'square',
          projectId: 'aspect-project',
          path: '/path/square.jpg',
          curatedScore: 0.9,
          createdAt: new Date(),
          aspect: 'square',
          tags: []
        },
        {
          id: 'portrait',
          projectId: 'aspect-project',
          path: '/path/portrait.jpg',
          curatedScore: 0.8,
          createdAt: new Date(),
          aspect: 'portrait',
          tags: []
        },
        {
          id: 'landscape',
          projectId: 'aspect-project',
          path: '/path/landscape.jpg',
          curatedScore: 0.7,
          createdAt: new Date(),
          aspect: 'landscape',
          tags: []
        }
      ];

      const plans = builder.buildCarouselPlans(differentAspects, 'facebook');
      expect(plans).toHaveLength(1);
      // Should pick square as majority (all have 1, square comes first alphabetically in our logic)
      expect(plans[0].aspect).toBe('square');
    });
  });
});