import {
  MediaItem,
  CarouselPlan,
  CarouselPlanSchema,
  networkConstraints,
  PlatformConstraints,
  MediaAspect
} from '../types/media.js';

/**
 * Groups media items by project and builds optimized carousel plans
 */
export class CarouselBuilder {
  private constraints: Record<string, PlatformConstraints>;

  constructor(customConstraints?: Record<string, PlatformConstraints>) {
    this.constraints = customConstraints || networkConstraints;
  }

  /**
   * Build carousel plans for a platform from curated media items
   */
  buildCarouselPlans(media: MediaItem[], platform: string): CarouselPlan[] {
    const platformConstraints = this.constraints[platform];
    if (!platformConstraints) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    if (!platformConstraints.supportsCarousel) {
      return [];
    }

    // Group media by project
    const projectGroups = this.groupByProject(media);

    const plans: CarouselPlan[] = [];

    // Process each project group
    for (const projectId of Array.from(projectGroups.keys())) {
      const projectMedia = projectGroups.get(projectId)!;
      const projectPlans = this.buildPlansForProject(
        projectId,
        projectMedia,
        platformConstraints
      );
      plans.push(...projectPlans);
    }

    return plans;
  }

  /**
   * Group media items by project ID
   */
  private groupByProject(media: MediaItem[]): Map<string, MediaItem[]> {
    const groups = new Map<string, MediaItem[]>();

    for (const item of media) {
      if (!groups.has(item.projectId)) {
        groups.set(item.projectId, []);
      }
      groups.get(item.projectId)!.push(item);
    }

    return groups;
  }

  /**
   * Build carousel plans for a single project
   */
  private buildPlansForProject(
    projectId: string,
    media: MediaItem[],
    constraints: PlatformConstraints
  ): CarouselPlan[] {
    // Skip if not enough media for a carousel
    if (media.length < constraints.minAssets) {
      return [];
    }

    // Sort media by curated score (desc) then by recency (desc)
    const sortedMedia = [...media].sort((a, b) => {
      // First by curated score descending
      if (a.curatedScore !== b.curatedScore) {
        return b.curatedScore - a.curatedScore;
      }
      // Then by created date descending (most recent first)
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // For platforms that prefer same aspect, group by aspect first
    if (constraints.prefersSameAspect) {
      return this.buildSameAspectPlans(projectId, sortedMedia, constraints);
    } else {
      return this.buildMixedAspectPlans(projectId, sortedMedia, constraints);
    }
  }

  /**
   * Build plans preferring same-aspect sequences (Instagram-style)
   */
  private buildSameAspectPlans(
    projectId: string,
    sortedMedia: MediaItem[],
    constraints: PlatformConstraints
  ): CarouselPlan[] {
    const plans: CarouselPlan[] = [];

    // Group by aspect
    const aspectGroups = this.groupByAspect(sortedMedia);

    // Process each aspect group
    for (const aspect of Array.from(aspectGroups.keys())) {
      const media = aspectGroups.get(aspect)!;
      if (media.length >= constraints.minAssets) {
        const aspectPlans = this.chunkMediaIntoPlans(
          projectId,
          media,
          constraints.maxAssets,
          aspect
        );
        plans.push(...aspectPlans);
      }
    }

    return plans;
  }

  /**
   * Build plans allowing mixed aspects
   */
  private buildMixedAspectPlans(
    projectId: string,
    sortedMedia: MediaItem[],
    constraints: PlatformConstraints
  ): CarouselPlan[] {
    // For mixed aspect platforms, determine majority aspect for the plan
    const majorityAspect = this.determineMajorityAspect(sortedMedia);

    return this.chunkMediaIntoPlans(
      projectId,
      sortedMedia,
      constraints.maxAssets,
      majorityAspect
    );
  }

  /**
   * Group media by aspect ratio
   */
  private groupByAspect(media: MediaItem[]): Map<MediaAspect, MediaItem[]> {
    const groups = new Map<MediaAspect, MediaItem[]>();

    for (const item of media) {
      if (!groups.has(item.aspect)) {
        groups.set(item.aspect, []);
      }
      groups.get(item.aspect)!.push(item);
    }

    return groups;
  }

  /**
   * Determine the majority aspect in a media collection
   */
  private determineMajorityAspect(media: MediaItem[]): MediaAspect {
    const aspectCounts = new Map<MediaAspect, number>();

    for (const item of media) {
      aspectCounts.set(item.aspect, (aspectCounts.get(item.aspect) || 0) + 1);
    }

    let majorityAspect: MediaAspect = 'square';
    let maxCount = 0;

    for (const aspect of Array.from(aspectCounts.keys())) {
      const count = aspectCounts.get(aspect)!;
      if (count > maxCount) {
        maxCount = count;
        majorityAspect = aspect;
      }
    }

    return majorityAspect;
  }

  /**
   * Chunk media into carousel plans respecting max assets per carousel
   */
  private chunkMediaIntoPlans(
    projectId: string,
    media: MediaItem[],
    maxAssets: number,
    aspect: MediaAspect
  ): CarouselPlan[] {
    const plans: CarouselPlan[] = [];

    for (let i = 0; i < media.length; i += maxAssets) {
      const chunk = media.slice(i, i + maxAssets);

      // Skip chunks that are too small (except for the first chunk which might be a remainder)
      if (chunk.length < 2 && plans.length > 0) {
        continue;
      }

      const plan: CarouselPlan = {
        projectId,
        mediaIds: chunk.map(item => item.id),
        coverId: chunk[0].id, // Highest scored/first in sorted order
        aspect
      };

      // Validate the plan
      const validation = CarouselPlanSchema.safeParse(plan);
      if (validation.success) {
        plans.push(plan);
      } else {
        console.warn(`Invalid carousel plan generated:`, validation.error);
      }
    }

    return plans;
  }
}

/**
 * Convenience function to build carousel plans
 */
export function buildCarouselPlans(media: MediaItem[], platform: string): CarouselPlan[] {
  const builder = new CarouselBuilder();
  return builder.buildCarouselPlans(media, platform);
}