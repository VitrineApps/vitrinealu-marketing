import { z } from 'zod';
import * as path from 'path';
import { readFileSync } from 'fs';
import * as YAML from 'yaml';
import { PlanningService, TimeSlot } from './plan.js';
import { Repository, Post } from './repository.js';
import { config } from './config.js';

// Schedule configuration schema
const ScheduleSlotSchema = z.object({
  time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM format
  content_type: z.enum(['carousel', 'single']),
  platforms: z.array(z.enum(['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'facebook'])),
  priority: z.enum(['high', 'medium', 'low']).default('medium')
});

const WeeklyScheduleSchema = z.record(z.string(), z.array(ScheduleSlotSchema));

const PlatformRulesSchema = z.object({
  carousel_support: z.boolean(),
  max_carousel_images: z.number().min(0),
  min_carousel_images: z.number().min(0),
  optimal_carousel_frequency: z.string(),
  carousel_types: z.array(z.string())
});

const ContentTypeSchema = z.object({
  description: z.string(),
  requires_multiple_assets: z.boolean(),
  min_assets: z.number().min(1),
  max_assets: z.number().min(1),
  platforms: z.array(z.enum(['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'facebook']))
});

const DuplicatePreventionSchema = z.object({
  monthly_carousel_rotation: z.boolean(),
  track_carousel_themes: z.boolean(),
  min_days_between_similar: z.number().min(0),
  max_carousel_reuse_per_quarter: z.number().min(0)
});

const ConstraintsSchema = z.object({
  max_posts_per_day_per_platform: z.number().min(1),
  max_carousels_per_week_per_platform: z.number().min(0),
  respect_quiet_hours: z.boolean(),
  buffer_between_posts: z.number().min(0)
});

const ScheduleConfigSchema = z.object({
  weekly_schedule: WeeklyScheduleSchema,
  platform_rules: z.record(PlatformRulesSchema),
  content_types: z.record(ContentTypeSchema),
  duplicate_prevention: DuplicatePreventionSchema,
  constraints: ConstraintsSchema
});

export type ScheduleSlot = z.infer<typeof ScheduleSlotSchema>;
export type WeeklySchedule = z.infer<typeof WeeklyScheduleSchema>;
export type PlatformRules = z.infer<typeof PlatformRulesSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;
export type DuplicatePrevention = z.infer<typeof DuplicatePreventionSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

// Weekly plan result
export interface WeeklyPlan {
  weekStart: Date;
  weekEnd: Date;
  slots: WeeklySlot[];
}

export interface WeeklySlot {
  date: Date;
  time: string;
  contentType: 'carousel' | 'single';
  platforms: string[];
  priority: 'high' | 'medium' | 'low';
  available: boolean;
  reason?: string;
}

// Carousel usage tracking
interface CarouselUsage {
  carouselId: string;
  theme: string;
  lastUsed: Date;
  usageCount: number;
}

export class WeeklyPlanner {
  private planningService: PlanningService;
  private repository: Repository;
  private scheduleConfig: ScheduleConfig;

  constructor(
    planningService: PlanningService,
    repository: Repository,
    scheduleConfigPath: string = './config/schedule.yml'
  ) {
    this.planningService = planningService;
    this.repository = repository;
    this.scheduleConfig = this.loadScheduleConfig(scheduleConfigPath);
  }

  /**
   * Load schedule configuration from YAML file
   */
  private loadScheduleConfig(configPath: string): ScheduleConfig {
    try {
      const fullPath = path.resolve(configPath);
      const configContent = readFileSync(fullPath, 'utf-8');
      return ScheduleConfigSchema.parse(YAML.parse(configContent));
    } catch (error) {
      throw new Error(`Failed to load schedule configuration: ${error}`);
    }
  }

  /**
   * Generate weekly plan for a given week
   */
  generateWeeklyPlan(weekStart: Date): WeeklyPlan {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const slots: WeeklySlot[] = [];

    // Get day names in English
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + i);
      const dayName = daysOfWeek[currentDate.getDay()];

      const daySchedule = this.scheduleConfig.weekly_schedule[dayName];
      if (!daySchedule) continue;

      for (const slot of daySchedule) {
        const slotDateTime = this.parseSlotTime(currentDate, slot.time);
        const availability = this.checkSlotAvailability(slot, slotDateTime);

        slots.push({
          date: slotDateTime,
          time: slot.time,
          contentType: slot.content_type,
          platforms: slot.platforms,
          priority: slot.priority,
          available: availability.available,
          reason: availability.reason
        });
      }
    }

    return {
      weekStart,
      weekEnd,
      slots: slots.sort((a, b) => a.date.getTime() - b.date.getTime())
    };
  }

  /**
   * Check if a slot is available based on constraints and duplicate prevention
   */
  private checkSlotAvailability(slot: ScheduleSlot, slotDateTime: Date): { available: boolean; reason?: string } {
    // Check if slot is in the past
    if (slotDateTime <= new Date()) {
      return { available: false, reason: 'Slot is in the past' };
    }

    // Check quiet hours if configured
    if (this.scheduleConfig.constraints.respect_quiet_hours && this.isQuietHour(slotDateTime)) {
      return { available: false, reason: 'Slot falls within quiet hours' };
    }

    // Check platform carousel support
    if (slot.content_type === 'carousel') {
      for (const platform of slot.platforms) {
        const rules = this.scheduleConfig.platform_rules[platform];
        if (!rules?.carousel_support) {
          return { available: false, reason: `Platform ${platform} does not support carousels` };
        }
      }
    }

    // Check weekly carousel limits per platform
    if (slot.content_type === 'carousel') {
      const weekStart = this.getWeekStart(slotDateTime);
      for (const platform of slot.platforms) {
        const carouselCount = this.countCarouselsInWeek(platform, weekStart);
        const maxCarousels = this.scheduleConfig.constraints.max_carousels_per_week_per_platform;
        if (carouselCount >= maxCarousels) {
          return { available: false, reason: `Maximum carousels per week reached for ${platform}` };
        }
      }
    }

    // Check daily post limits per platform
    const dayStart = new Date(slotDateTime);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(slotDateTime);
    dayEnd.setHours(23, 59, 59, 999);

    for (const platform of slot.platforms) {
      const postCount = this.countPostsInPeriod(platform, dayStart, dayEnd);
      const maxPosts = this.scheduleConfig.constraints.max_posts_per_day_per_platform;
      if (postCount >= maxPosts) {
        return { available: false, reason: `Maximum posts per day reached for ${platform}` };
      }
    }

    return { available: true };
  }

  /**
   * Select appropriate carousel for a slot based on availability and duplicate prevention
   */
  async selectCarouselForSlot(slot: WeeklySlot): Promise<string | null> {
    if (slot.contentType !== 'carousel') {
      return null;
    }

    // Get available carousels from the orchestrator/carousel service
    // This would typically call the carousel builder API
    const availableCarousels = await this.getAvailableCarousels();

    if (availableCarousels.length === 0) {
      return null;
    }

    // Get recently used carousels to avoid duplicates
    const recentlyUsed = await this.getRecentlyUsedCarousels(
      this.scheduleConfig.duplicate_prevention.min_days_between_similar
    );

    // Filter out recently used carousels
    const eligibleCarousels = availableCarousels.filter(carousel =>
      !recentlyUsed.some(used => used.carouselId === carousel.id)
    );

    if (eligibleCarousels.length === 0) {
      return null;
    }

    // For now, return the first eligible carousel
    // In a more sophisticated implementation, this could consider themes, performance, etc.
    return eligibleCarousels[0].id;
  }

  /**
   * Schedule posts for available slots in a week
   */
  async scheduleWeeklyPosts(weekStart: Date): Promise<Post[]> {
    const plan = this.generateWeeklyPlan(weekStart);
    const scheduledPosts: Post[] = [];

    for (const slot of plan.slots) {
      if (!slot.available) continue;

      // Select content based on slot type
      let contentHash: string;
      let mediaUrls: string[];
      let caption: string;
      let hashtags: string[];

      if (slot.contentType === 'carousel') {
        const carouselId = await this.selectCarouselForSlot(slot);
        if (!carouselId) continue;

        // Get carousel details from carousel service
        const carouselDetails = await this.getCarouselDetails(carouselId);
        contentHash = carouselDetails.contentHash;
        mediaUrls = carouselDetails.mediaUrls;
        caption = carouselDetails.caption;
        hashtags = carouselDetails.hashtags;
      } else {
        // For single posts, this would integrate with single post selection logic
        // For now, skip single posts
        continue;
      }

      // Create posts for each platform
      for (const platform of slot.platforms) {
        const post: Omit<Post, 'id' | 'createdAt' | 'updatedAt'> = {
          contentHash,
          platform: platform as Post['platform'],
          caption,
          hashtags,
          mediaUrls,
          scheduledAt: slot.date,
          status: 'draft',
          contentType: slot.contentType
        };

        const createdPost = this.repository.createPost(post);
        scheduledPosts.push(createdPost);

        // Track carousel usage
        if (slot.contentType === 'carousel') {
          this.repository.trackCarouselUsage(contentHash, 'unknown', platform as Post['platform']);
        }
      }
    }

    return scheduledPosts;
  }

  /**
   * Get the start of the week for a given date
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Parse slot time string into Date object
   */
  private parseSlotTime(date: Date, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  /**
   * Check if a time falls within quiet hours
   */
  private isQuietHour(date: Date): boolean {
    const quietHours = config.brandConfig.quietHours;
    if (!quietHours) return false;

    const hour = date.getHours();
    const day = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    if (!quietHours.days.includes(day as any)) return false;

    const quietStart = this.parseTime(quietHours.start);
    const quietEnd = this.parseTime(quietHours.end);

    if (quietStart <= quietEnd) {
      return hour >= quietStart && hour < quietEnd;
    } else {
      return hour >= quietStart || hour < quietEnd;
    }
  }

  /**
   * Parse HH:MM time string to hour number
   */
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
  }

  /**
   * Count carousels scheduled in a given week for a platform
   */
  private countCarouselsInWeek(platform: string, weekStart: Date): number {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const carouselsUsed = this.repository.getCarouselsUsedInPeriod(weekStart, weekEnd, platform as Post['platform']);
    return carouselsUsed.length;
  }

  /**
   * Count posts in a given period for a platform
   */
  private countPostsInPeriod(platform: string, startDate: Date, endDate: Date): number {
    // This would query the database for posts in the period
    // For now, return 0 (simplified implementation)
    // TODO: Implement actual post counting
    return 0;
  }

  /**
   * Get available carousels from carousel service
   */
  private async getAvailableCarousels(): Promise<Array<{ id: string; contentHash: string; theme: string }>> {
    // This would call the carousel builder API
    // For now, return empty array (would be implemented with actual API call)
    return [];
  }

  /**
   * Get details for a specific carousel
   */
  private async getCarouselDetails(carouselId: string): Promise<{
    contentHash: string;
    mediaUrls: string[];
    caption: string;
    hashtags: string[];
  }> {
    // This would call the carousel builder API
    // For now, return mock data (would be implemented with actual API call)
    return {
      contentHash: `carousel_${carouselId}`,
      mediaUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      caption: 'Sample carousel caption',
      hashtags: ['#example', '#carousel']
    };
  }

  /**
   * Get recently used carousels
   */
  private async getRecentlyUsedCarousels(minDays: number): Promise<CarouselUsage[]> {
    return this.repository.getRecentlyUsedCarousels(minDays);
  }

  /**
   * Track carousel usage for duplicate prevention
   */
  private async trackCarouselUsage(carouselId: string, theme: string, usedAt: Date): Promise<void> {
    // Track usage for each platform that will use this carousel
    // This will be called when scheduling posts
    this.repository.trackCarouselUsage(carouselId, theme, 'instagram'); // Default to instagram for now
  }

  /**
   * Get schedule configuration
   */
  getScheduleConfig(): ScheduleConfig {
    return this.scheduleConfig;
  }

  /**
   * Validate schedule configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check that carousel slots only use platforms that support carousels
    for (const [day, slots] of Object.entries(this.scheduleConfig.weekly_schedule)) {
      for (const slot of slots) {
        if (slot.content_type === 'carousel') {
          for (const platform of slot.platforms) {
            const rules = this.scheduleConfig.platform_rules[platform];
            if (!rules?.carousel_support) {
              errors.push(`Day ${day}: Platform ${platform} does not support carousels but is used in carousel slot`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}