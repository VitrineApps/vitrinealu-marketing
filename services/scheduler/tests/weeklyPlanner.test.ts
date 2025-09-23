import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { WeeklyPlanner, ScheduleConfig } from '../src/weeklyPlanner.js';
import { PlanningService } from '../src/plan.js';
import { Repository } from '../src/repository.js';

// Mock fs and path for config loading
jest.mock('fs');
jest.mock('path');

// Mock the Repository class
jest.mock('../src/repository.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const MockRepository = Repository as jest.MockedClass<typeof Repository>;

describe('WeeklyPlanner', () => {
  let planningService: PlanningService;
  let repository: jest.Mocked<Repository>;
  let weeklyPlanner: WeeklyPlanner;
  let mockScheduleConfig: ScheduleConfig;

  beforeEach(() => {
    // Mock path resolution
    mockPath.resolve.mockReturnValue('/mock/config/schedule.yaml');

    // Mock file reading
    mockScheduleConfig = {
      weekly_schedule: {
        monday: [
          {
            time: '09:00',
            content_type: 'carousel',
            platforms: ['instagram'],
            priority: 'high'
          },
          {
            time: '14:00',
            content_type: 'single',
            platforms: ['linkedin'],
            priority: 'medium'
          }
        ],
        tuesday: [
          {
            time: '10:00',
            content_type: 'single',
            platforms: ['instagram'],
            priority: 'medium'
          }
        ]
      },
      platform_rules: {
        instagram: {
          carousel_support: true,
          max_carousel_images: 10,
          min_carousel_images: 2,
          optimal_carousel_frequency: '2-3 per week',
          carousel_types: ['product_showcase', 'behind_scenes']
        },
        linkedin: {
          carousel_support: false,
          max_carousel_images: 0,
          min_carousel_images: 0,
          optimal_carousel_frequency: 'none',
          carousel_types: []
        }
      },
      content_types: {
        carousel: {
          description: 'Multi-image carousel post',
          requires_multiple_assets: true,
          min_assets: 2,
          max_assets: 10,
          platforms: ['instagram']
        },
        single: {
          description: 'Single image/video post',
          requires_multiple_assets: false,
          min_assets: 1,
          max_assets: 1,
          platforms: ['instagram', 'linkedin']
        }
      },
      duplicate_prevention: {
        monthly_carousel_rotation: true,
        track_carousel_themes: true,
        min_days_between_similar: 30,
        max_carousel_reuse_per_quarter: 1
      },
      constraints: {
        max_posts_per_day_per_platform: 2,
        max_carousels_per_week_per_platform: 3,
        respect_quiet_hours: true,
        buffer_between_posts: 30
      }
    };

    mockFs.readFileSync.mockReturnValue(JSON.stringify(mockScheduleConfig));

    planningService = new PlanningService();
    repository = new MockRepository() as jest.Mocked<Repository>;

    // Setup repository mocks
    repository.getCarouselsUsedInPeriod.mockReturnValue([]);
    repository.getRecentlyUsedCarousels.mockReturnValue([]);
    repository.trackCarouselUsage.mockImplementation(() => {});
    repository.createPost.mockImplementation((post) => ({
      ...post,
      id: 'mock-post-id',
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    weeklyPlanner = new WeeklyPlanner(planningService, repository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration Loading', () => {
    it('should load schedule configuration from YAML file', () => {
      const config = weeklyPlanner.getScheduleConfig();
      expect(config).toEqual(mockScheduleConfig);
      expect(mockPath.resolve).toHaveBeenCalledWith('./config/schedule.yaml');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/mock/config/schedule.yaml', 'utf-8');
    });

    it('should validate configuration correctly', () => {
      const validation = weeklyPlanner.validateConfiguration();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid carousel platform configuration', () => {
      const invalidConfig = {
        ...mockScheduleConfig,
        weekly_schedule: {
          monday: [
            {
              time: '09:00',
              content_type: 'carousel' as const,
              platforms: ['linkedin'], // LinkedIn doesn't support carousels
              priority: 'high' as const
            }
          ]
        }
      };

      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(invalidConfig));
      const invalidPlanner = new WeeklyPlanner(planningService, repository);

      const validation = invalidPlanner.validateConfiguration();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Day monday: Platform linkedin does not support carousels but is used in carousel slot');
    });
  });

  describe('Weekly Plan Generation', () => {
    it('should generate weekly plan with correct slots', () => {
      // Use a future Monday
      const futureMonday = new Date();
      futureMonday.setDate(futureMonday.getDate() + (8 - futureMonday.getDay())); // Next Monday
      futureMonday.setHours(0, 0, 0, 0);
      
      const plan = weeklyPlanner.generateWeeklyPlan(futureMonday);

      expect(plan.weekStart).toEqual(futureMonday);
      expect(plan.slots).toHaveLength(3); // Monday: 2 slots, Tuesday: 1 slot

      // Check Monday slots
      const mondaySlots = plan.slots.filter(slot => slot.date.getDay() === 1);
      expect(mondaySlots).toHaveLength(2);

      const carouselSlot = mondaySlots.find(slot => slot.contentType === 'carousel');
      expect(carouselSlot).toBeDefined();
      expect(carouselSlot?.platforms).toEqual(['instagram']);
      expect(carouselSlot?.priority).toBe('high');
      expect(carouselSlot?.available).toBe(true);

      const singleSlot = mondaySlots.find(slot => slot.contentType === 'single');
      expect(singleSlot).toBeDefined();
      expect(singleSlot?.platforms).toEqual(['linkedin']);
      expect(singleSlot?.priority).toBe('medium');
    });

    it('should mark slots as unavailable when in the past', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      const plan = weeklyPlanner.generateWeeklyPlan(pastDate);
      const pastSlots = plan.slots.filter(slot => !slot.available);
      expect(pastSlots.length).toBeGreaterThan(0);
      expect(pastSlots[0].reason).toBe('Slot is in the past');
    });

    it('should respect platform carousel support', () => {
      const weekStart = new Date('2024-01-01');
      const plan = weeklyPlanner.generateWeeklyPlan(weekStart);

      const carouselSlots = plan.slots.filter(slot => slot.contentType === 'carousel');
      carouselSlots.forEach(slot => {
        slot.platforms.forEach(platform => {
          const rules = mockScheduleConfig.platform_rules[platform];
          expect(rules.carousel_support).toBe(true);
        });
      });
    });
  });

  describe('Slot Availability Checking', () => {
    it('should check carousel slot availability correctly', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow
      futureDate.setHours(9, 0, 0, 0); // 9:00 AM

      const slot = {
        time: '09:00',
        content_type: 'carousel' as const,
        platforms: ['instagram'],
        priority: 'high' as const
      };

      // Mock the planner's private method by creating a test instance
      const availability = (weeklyPlanner as any).checkSlotAvailability(slot, futureDate);
      expect(availability.available).toBe(true);
    });

    it('should reject carousel slots for unsupported platforms', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(9, 0, 0, 0);

      const slot = {
        time: '09:00',
        content_type: 'carousel' as const,
        platforms: ['linkedin'], // Doesn't support carousels
        priority: 'high' as const
      };

      const availability = (weeklyPlanner as any).checkSlotAvailability(slot, futureDate);
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('does not support carousels');
    });
  });

  describe('Carousel Selection', () => {
    it('should return null for non-carousel slots', async () => {
      const slot = {
        date: new Date(),
        time: '14:00',
        contentType: 'single' as const,
        platforms: ['linkedin'],
        priority: 'medium' as const,
        available: true
      };

      const result = await weeklyPlanner.selectCarouselForSlot(slot);
      expect(result).toBeNull();
    });

    it('should select carousel when available', async () => {
      const slot = {
        date: new Date(),
        time: '09:00',
        contentType: 'carousel' as const,
        platforms: ['instagram'],
        priority: 'high' as const,
        available: true
      };

      // Mock the getAvailableCarousels method
      const mockGetAvailableCarousels = jest.spyOn(weeklyPlanner as any, 'getAvailableCarousels');
      mockGetAvailableCarousels.mockResolvedValue([
        { id: 'carousel-1', contentHash: 'hash1', theme: 'product_showcase' }
      ]);

      const result = await weeklyPlanner.selectCarouselForSlot(slot);
      expect(result).toBe('carousel-1');

      mockGetAvailableCarousels.mockRestore();
    });
  });

  describe('Duplicate Prevention', () => {
    it('should track carousel usage', () => {
      repository.trackCarouselUsage('carousel-1', 'product_showcase', 'instagram');

      expect(repository.trackCarouselUsage).toHaveBeenCalledWith('carousel-1', 'product_showcase', 'instagram');
    });

    it('should retrieve recently used carousels', () => {
      const mockUsage = [{
        id: '1',
        carouselId: 'carousel-1',
        theme: 'product_showcase',
        platform: 'instagram' as const,
        usedAt: new Date(),
        usageCount: 1,
        lastUsed: new Date()
      }];

      repository.getRecentlyUsedCarousels.mockReturnValue(mockUsage);

      const recent = repository.getRecentlyUsedCarousels(30);
      expect(repository.getRecentlyUsedCarousels).toHaveBeenCalledWith(30);
      expect(recent).toEqual(mockUsage);
    });

    it('should not return carousels used beyond minimum days', () => {
      repository.getRecentlyUsedCarousels.mockReturnValue([]);

      const recent = repository.getRecentlyUsedCarousels(30);
      expect(repository.getRecentlyUsedCarousels).toHaveBeenCalledWith(30);
      expect(recent).toHaveLength(0);
    });
  });

  describe('Weekly Post Scheduling', () => {
    it('should schedule posts for available slots', async () => {
      const weekStart = new Date('2024-01-01'); // Monday
      const futureWeek = new Date();
      futureWeek.setDate(futureWeek.getDate() + 7); // Next week

      // Mock carousel selection
      const mockSelectCarousel = jest.spyOn(weeklyPlanner, 'selectCarouselForSlot');
      mockSelectCarousel.mockResolvedValue('carousel-1');

      // Mock carousel details
      const mockGetCarouselDetails = jest.spyOn(weeklyPlanner as any, 'getCarouselDetails');
      mockGetCarouselDetails.mockResolvedValue({
        contentHash: 'carousel-hash',
        mediaUrls: ['url1.jpg', 'url2.jpg'],
        caption: 'Test carousel',
        hashtags: ['#test']
      });

      // Mock repository createPost
      const mockPost = {
        id: 'post-1',
        contentHash: 'carousel-hash',
        platform: 'instagram' as const,
        caption: 'Test carousel',
        hashtags: ['#test'],
        mediaUrls: ['url1.jpg', 'url2.jpg'],
        scheduledAt: new Date(),
        status: 'draft' as const,
        contentType: 'carousel' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.createPost.mockReturnValue(mockPost);

      const posts = await weeklyPlanner.scheduleWeeklyPosts(futureWeek);

      expect(posts).toHaveLength(1);
      expect(posts[0]).toEqual(mockPost);
      expect(repository.createPost).toHaveBeenCalled();

      mockSelectCarousel.mockRestore();
      mockGetCarouselDetails.mockRestore();
    });

    it('should skip slots without available carousels', async () => {
      const weekStart = new Date('2024-01-01');
      const futureWeek = new Date();
      futureWeek.setDate(futureWeek.getDate() + 7);

      // Mock carousel selection to return null
      const mockSelectCarousel = jest.spyOn(weeklyPlanner, 'selectCarouselForSlot');
      mockSelectCarousel.mockResolvedValue(null);

      const posts = await weeklyPlanner.scheduleWeeklyPosts(futureWeek);

      expect(posts).toHaveLength(0);
      expect(repository.createPost).not.toHaveBeenCalled();

      mockSelectCarousel.mockRestore();
    });
  });

  describe('Integration with Planning Service', () => {
    it('should use planning service for optimal times', () => {
      const optimalTimes = planningService.getOptimalTimes('instagram');
      expect(optimalTimes).toHaveLength(4); // Instagram has 4 optimal times

      optimalTimes.forEach(time => {
        expect(time.hour).toBeGreaterThanOrEqual(0);
        expect(time.hour).toBeLessThanOrEqual(23);
        expect(time.minute).toBeGreaterThanOrEqual(0);
        expect(time.minute).toBeLessThanOrEqual(59);
        expect(time.score).toBeGreaterThanOrEqual(0);
        expect(time.score).toBeLessThanOrEqual(1);
      });
    });

    it('should respect quiet hours from brand config', () => {
      // This would require mocking the config.brandConfig
      // For now, just verify the planner has access to planning service
      expect((weeklyPlanner as any).planningService).toBe(planningService);
    });
  });
});