// Slot type for carousel planning
export interface CarouselSlot {
  platform: keyof typeof PLATFORM_OPTIMALS;
  scheduledAt: Date;
}

/**
 * Plan carousel slots for a platform, respecting quiet hours and platform rules
 */
export function planCarouselSlots({ platform, count }: { platform: keyof typeof PLATFORM_OPTIMALS; count: number }): CarouselSlot[] {
  const planner = new PlanningService();
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + 14); // Plan up to 2 weeks ahead
  const allSlots = planner.generatePlatformSchedule(platform, planner.getOptimalTimes(platform), now, end);
  // Filter out slots in quiet hours (already handled by generatePlatformSchedule)
  // Distribute evenly
  const slots: CarouselSlot[] = [];
  if (allSlots.length === 0 || count === 0) return slots;
  const step = Math.floor(allSlots.length / count);
  for (let i = 0; i < count; i++) {
    const idx = Math.min(i * step, allSlots.length - 1);
    slots.push({ platform, scheduledAt: allSlots[idx] });
  }
  return slots;
}
import { z } from 'zod';
import { config } from './config.js';

// Time slot schema
const TimeSlotSchema = z.object({
  hour: z.number().min(0).max(23),
  minute: z.number().min(0).max(59),
  score: z.number().min(0).max(1) // Engagement score 0-1
});

export type TimeSlot = z.infer<typeof TimeSlotSchema>;

// Platform-specific optimal posting times (based on general social media best practices)
const PLATFORM_OPTIMALS = {
  instagram: [
    { hour: 11, minute: 0, score: 0.9 }, // Morning peak
    { hour: 13, minute: 0, score: 0.8 }, // Lunch time
    { hour: 17, minute: 0, score: 0.9 }, // Evening peak
    { hour: 19, minute: 0, score: 0.8 }  // Dinner time
  ],
  tiktok: [
    { hour: 9, minute: 0, score: 0.8 },  // Morning
    { hour: 12, minute: 0, score: 0.9 }, // Noon
    { hour: 19, minute: 0, score: 0.9 }, // Evening
    { hour: 21, minute: 0, score: 0.8 }  // Night
  ],
  youtube_shorts: [
    { hour: 14, minute: 0, score: 0.8 }, // Afternoon
    { hour: 16, minute: 0, score: 0.9 }, // Late afternoon
    { hour: 18, minute: 0, score: 0.8 }, // Evening
    { hour: 20, minute: 0, score: 0.7 }  // Night
  ],
  linkedin: [
    { hour: 8, minute: 0, score: 0.9 },  // Business morning
    { hour: 12, minute: 0, score: 0.8 }, // Lunch
    { hour: 17, minute: 0, score: 0.9 }, // End of workday
    { hour: 19, minute: 0, score: 0.7 }  // Evening
  ],
  facebook: [
    { hour: 13, minute: 0, score: 0.8 }, // Lunch
    { hour: 15, minute: 0, score: 0.9 }, // Afternoon
    { hour: 19, minute: 0, score: 0.8 }, // Evening
    { hour: 20, minute: 0, score: 0.7 }  // Night
  ]
};

export class PlanningService {
  private timezone: string;

  constructor(timezone: string = config.config.TIMEZONE) {
    this.timezone = timezone;
  }

  /**
   * Get optimal posting times for a platform
   */
  getOptimalTimes(platform: keyof typeof PLATFORM_OPTIMALS): TimeSlot[] {
    return PLATFORM_OPTIMALS[platform] || [];
  }

  /**
   * Plan posting schedule for multiple platforms over a date range
   */
  planSchedule(platforms: (keyof typeof PLATFORM_OPTIMALS)[], startDate: Date, endDate: Date): Map<string, Date[]> {
    const schedule = new Map<string, Date[]>();

    for (const platform of platforms) {
      const optimalTimes = this.getOptimalTimes(platform);
      const platformSchedule = this.generatePlatformSchedule(platform, optimalTimes, startDate, endDate);
      schedule.set(platform, platformSchedule);
    }

    return schedule;
  }

  /**
   * Generate schedule for a single platform
   * (now public for use in planCarouselSlots)
   */
  public generatePlatformSchedule(
    platform: string,
    optimalTimes: TimeSlot[],
    startDate: Date,
    endDate: Date
  ): Date[] {
    const schedule: Date[] = [];
    const current = new Date(startDate);

    // Skip quiet hours if configured
    const quietHours = config.brandConfig.quietHours;
    const isQuietHour = (date: Date): boolean => {
      if (!quietHours) return false;

      const hour = date.getHours();
      const day = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      // Check if current day is in quiet days
      if (!quietHours.days.includes(day as any)) return false;

      // Check if current time is in quiet hours range
      const quietStart = this.parseTime(quietHours.start);
      const quietEnd = this.parseTime(quietHours.end);

      if (quietStart <= quietEnd) {
        // Same day range
        return hour >= quietStart && hour < quietEnd;
      } else {
        // Overnight range
        return hour >= quietStart || hour < quietEnd;
      }
    };

    while (current <= endDate) {
      // Skip weekends if configured
      const currentDay = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      if (quietHours?.days.includes(currentDay as any)) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      for (const timeSlot of optimalTimes) {
        const postTime = new Date(current);
        postTime.setHours(timeSlot.hour, timeSlot.minute, 0, 0);

        // Skip if in quiet hours
        if (isQuietHour(postTime)) continue;

        // Only schedule future times
        if (postTime > new Date()) {
          schedule.push(new Date(postTime));
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return schedule.sort((a, b) => a.getTime() - b.getTime());
  }

  /**
   * Find best time slot for a specific date
   */
  findBestTime(platform: keyof typeof PLATFORM_OPTIMALS, date: Date): Date | null {
    const optimalTimes = this.getOptimalTimes(platform);
    if (optimalTimes.length === 0) return null;

    // Find the best available time for the given date
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    let bestTime: Date | null = null;
    let bestScore = 0;

    for (const timeSlot of optimalTimes) {
      const candidate = new Date(targetDate);
      candidate.setHours(timeSlot.hour, timeSlot.minute, 0, 0);

      // Skip past times
      if (candidate <= new Date()) continue;

      // Check quiet hours
      if (this.isQuietHour(candidate)) continue;

      if (timeSlot.score > bestScore) {
        bestScore = timeSlot.score;
        bestTime = candidate;
      }
    }

    return bestTime;
  }

  /**
   * Get next available posting time for a platform
   */
  getNextPostingTime(platform: keyof typeof PLATFORM_OPTIMALS): Date | null {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // Try today first, then tomorrow
    let nextTime = this.findBestTime(platform, now);
    if (!nextTime) {
      nextTime = this.findBestTime(platform, tomorrow);
    }

    return nextTime;
  }

  /**
   * Distribute posts evenly across available time slots
   */
  distributePosts(
    platform: keyof typeof PLATFORM_OPTIMALS,
    postCount: number,
    startDate: Date,
    endDate: Date
  ): Date[] {
    const allSlots = this.generatePlatformSchedule(platform, this.getOptimalTimes(platform), startDate, endDate);

    if (allSlots.length === 0 || postCount === 0) return [];

    // If we have fewer slots than posts, use all available slots
    if (allSlots.length <= postCount) {
      return allSlots;
    }

    // Distribute evenly across available slots
    const step = Math.floor(allSlots.length / postCount);
    const distributed: Date[] = [];

    for (let i = 0; i < postCount; i++) {
      const index = Math.min(i * step, allSlots.length - 1);
      distributed.push(allSlots[index]);
    }

    return distributed;
  }

  /**
   * Check if a time falls within quiet hours
   */
  private isQuietHour(date: Date): boolean {
    const quietHours = config.brandConfig.quietHours;
    if (!quietHours) return false;

    const hour = date.getHours();
    const day = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Check if current day is in quiet days
    if (!quietHours.days.includes(day as any)) return false;

    // Check if current time is in quiet hours range
    const quietStart = this.parseTime(quietHours.start);
    const quietEnd = this.parseTime(quietHours.end);

    if (quietStart <= quietEnd) {
      // Same day range
      return hour >= quietStart && hour < quietEnd;
    } else {
      // Overnight range
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
   * Get platform-specific posting frequency recommendations
   */
  getRecommendedFrequency(platform: keyof typeof PLATFORM_OPTIMALS): {
    postsPerWeek: number;
    postsPerDay: number;
    description: string;
  } {
    const recommendations = {
      instagram: { postsPerWeek: 3, postsPerDay: 1, description: '3-5 posts per week' },
      tiktok: { postsPerWeek: 4, postsPerDay: 1, description: '4-7 posts per week' },
      youtube_shorts: { postsPerWeek: 3, postsPerDay: 1, description: '3-5 shorts per week' },
      linkedin: { postsPerWeek: 2, postsPerDay: 1, description: '2-3 posts per week' },
      facebook: { postsPerWeek: 2, postsPerDay: 1, description: '2-3 posts per week' }
    };

    return recommendations[platform] || { postsPerWeek: 1, postsPerDay: 1, description: '1 post per week' };
  }
}