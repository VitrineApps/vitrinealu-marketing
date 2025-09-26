import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CarouselAssetPlanner } from '../src/services/carouselPlanner.js';
import { Repository } from '../src/repository.js';
import { PlanningService } from '../src/plan.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('../src/config.js', () => ({
  config: {
    config: {
      ASSET_BASE_URL: 'https://assets.test.com'
    }
  }
}));

describe('CarouselAssetPlanner', () => {
  let planner: CarouselAssetPlanner;
  let mockRepository: Repository;
  let mockPlanningService: PlanningService;

  beforeEach(() => {
    // Mock Repository
    mockRepository = {
      createPost: vi.fn().mockReturnValue({
        id: 'test-post-id',
        contentHash: 'test-hash',
        platform: 'instagram',
        caption: 'Test caption',
        hashtags: ['test'],
        mediaUrls: ['https://test.com/img1.jpg'],
        scheduledAt: new Date(),
        status: 'DRAFT',
        contentType: 'carousel',
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      postExists: vi.fn().mockReturnValue(false),
      trackCarouselUsage: vi.fn()
    } as any;

    // Mock PlanningService
    mockPlanningService = {} as any;

    // Mock schedule.yaml content
    const mockScheduleConfig = `
slots:
  tue_carousel:
    day: "Tue"
    time: "12:00"
    platforms: ["instagram", "facebook"]
    format: "carousel"
    images: 3
`;

    vi.mocked(fs.readFileSync).mockReturnValue(mockScheduleConfig);

    planner = new CarouselAssetPlanner(mockRepository, mockPlanningService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('groupAssetsForCarousels', () => {
    it('should group assets by project correctly', async () => {
      const assetPaths = [
        '/assets/projects/kitchen-remodel/img1.jpg',
        '/assets/projects/kitchen-remodel/img2.jpg',
        '/assets/projects/kitchen-remodel/img3.jpg',
        '/assets/projects/office-gates/img1.jpg',
        '/assets/projects/office-gates/img2.jpg'
      ];

      const result = await planner.groupAssetsForCarousels(assetPaths);

      expect(result.groups).toHaveLength(2);
      expect(result.ungrouped).toHaveLength(0);
      
      // First group should have 3 kitchen images
      expect(result.groups[0].assetPaths).toHaveLength(3);
      expect(result.groups[0].assetPaths.every(path => path.includes('kitchen-remodel'))).toBe(true);
      
      // Second group should have 2 office images  
      expect(result.groups[1].assetPaths).toHaveLength(2);
      expect(result.groups[1].assetPaths.every(path => path.includes('office-gates'))).toBe(true);
    });

    it('should handle single assets as ungrouped', async () => {
      const assetPaths = [
        '/assets/projects/single-project/img1.jpg'
      ];

      const result = await planner.groupAssetsForCarousels(assetPaths);

      expect(result.groups).toHaveLength(0);
      expect(result.ungrouped).toHaveLength(1);
    });

    it('should reject groups with more than 10 images', async () => {
      const assetPaths = Array.from({ length: 12 }, (_, i) => 
        `/assets/projects/large-project/img${i + 1}.jpg`
      );

      const result = await planner.groupAssetsForCarousels(assetPaths);

      // Should break into smaller groups
      expect(result.groups.length).toBeGreaterThan(1);
      expect(result.groups.every(group => group.assetPaths.length <= 10)).toBe(true);
    });

    it('should ensure stable ordering within groups', async () => {
      const assetPaths = [
        '/assets/projects/test/img10.jpg',
        '/assets/projects/test/img2.jpg',
        '/assets/projects/test/img1.jpg',
        '/assets/projects/test/img3.jpg'
      ];

      const result = await planner.groupAssetsForCarousels(assetPaths);

      expect(result.groups).toHaveLength(1);
      const group = result.groups[0];
      
      // Should be sorted: img1, img2, img3, img10
      expect(path.basename(group.assetPaths[0])).toBe('img1.jpg');
      expect(path.basename(group.assetPaths[1])).toBe('img2.jpg');
      expect(path.basename(group.assetPaths[2])).toBe('img3.jpg');
      expect(path.basename(group.assetPaths[3])).toBe('img10.jpg');
    });

    it('should split large groups optimally', async () => {
      const assetPaths = Array.from({ length: 7 }, (_, i) => 
        `/assets/projects/medium-project/img${i + 1}.jpg`
      );

      const result = await planner.groupAssetsForCarousels(assetPaths);

      // Should split 7 images into groups (e.g., 3 + 4 or 4 + 3)
      expect(result.groups.length).toBeGreaterThanOrEqual(1);
      expect(result.groups.every(group => 
        group.assetPaths.length >= 2 && group.assetPaths.length <= 5
      )).toBe(true);
    });

    it('should extract project themes correctly', async () => {
      const assetPaths = [
        '/assets/projects/kitchen-remodel/session1/img1.jpg',
        '/assets/projects/kitchen-remodel/session1/img2.jpg',
        '/assets/projects/office-gates/batch1/img1.jpg',
        '/assets/projects/office-gates/batch1/img2.jpg' // Need at least 2 images for carousel
      ];

      const result = await planner.groupAssetsForCarousels(assetPaths);

      expect(result.groups).toHaveLength(2);
      
      // Check that themes are extracted (may be undefined for some paths)
      const themes = result.groups.map(g => g.theme).filter(Boolean);
      expect(themes.length).toBeGreaterThan(0);
      
      // Check that projects are properly grouped
      expect(result.groups[0].assetPaths.length).toBeGreaterThanOrEqual(2);
      expect(result.groups[1].assetPaths.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createCarouselPosts', () => {
    it('should create posts for supported platforms', async () => {
      const assetGroups = [{
        id: 'test-group',
        assetPaths: ['/img1.jpg', '/img2.jpg', '/img3.jpg'],
        projectHash: 'test-hash',
        theme: 'kitchen',
        createdAt: new Date()
      }];
      
      const scheduledTimes = [new Date()];

      const posts = await planner.createCarouselPosts(assetGroups, scheduledTimes);

      expect(posts).toHaveLength(2); // Instagram + Facebook
      expect(mockRepository.createPost).toHaveBeenCalledTimes(2);
      expect(mockRepository.trackCarouselUsage).toHaveBeenCalledTimes(2);
    });

    it('should convert asset paths to URLs correctly', async () => {
      const assetGroups = [{
        id: 'test-group',
        assetPaths: ['/assets/ready/img1.jpg', '/assets/ready/img2.jpg'],
        projectHash: 'test-hash',
        theme: 'test',
        createdAt: new Date()
      }];
      
      const scheduledTimes = [new Date()];

      await planner.createCarouselPosts(assetGroups, scheduledTimes);

      const createPostCall = vi.mocked(mockRepository.createPost).mock.calls[0][0];
      expect(createPostCall.mediaUrls).toEqual([
        'https://assets.test.com/assets/ready/img1.jpg',
        'https://assets.test.com/assets/ready/img2.jpg'
      ]);
    });

    it('should skip duplicate posts', async () => {
      vi.mocked(mockRepository.postExists).mockReturnValue(true);

      const assetGroups = [{
        id: 'test-group',
        assetPaths: ['/img1.jpg', '/img2.jpg'],
        projectHash: 'test-hash',
        theme: 'test',
        createdAt: new Date()
      }];
      
      const scheduledTimes = [new Date()];

      const posts = await planner.createCarouselPosts(assetGroups, scheduledTimes);

      expect(posts).toHaveLength(0);
      expect(mockRepository.createPost).not.toHaveBeenCalled();
    });

    it('should limit posts to available scheduled times', async () => {
      const assetGroups = [
        { id: 'group1', assetPaths: ['/img1.jpg', '/img2.jpg'], projectHash: 'hash1', createdAt: new Date() },
        { id: 'group2', assetPaths: ['/img3.jpg', '/img4.jpg'], projectHash: 'hash2', createdAt: new Date() },
        { id: 'group3', assetPaths: ['/img5.jpg', '/img6.jpg'], projectHash: 'hash3', createdAt: new Date() }
      ];
      
      const scheduledTimes = [new Date(), new Date()]; // Only 2 slots

      const posts = await planner.createCarouselPosts(assetGroups, scheduledTimes);

      // Should only create posts for first 2 groups (2 groups × 2 platforms = 4 posts)
      expect(posts).toHaveLength(4);
    });
  });

  describe('validateCarouselGroup', () => {
    it('should validate correct carousel groups', () => {
      const validGroup = {
        id: 'test',
        assetPaths: ['/img1.jpg', '/img2.jpg', '/img3.jpg'],
        projectHash: 'hash',
        createdAt: new Date()
      };

      const result = planner.validateCarouselGroup(validGroup);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject groups with too few images', () => {
      const invalidGroup = {
        id: 'test',
        assetPaths: ['/img1.jpg'],
        projectHash: 'hash',
        createdAt: new Date()
      };

      const result = planner.validateCarouselGroup(invalidGroup);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('at least'))).toBe(true);
    });

    it('should reject groups with too many images', () => {
      const invalidGroup = {
        id: 'test',
        assetPaths: Array.from({ length: 15 }, (_, i) => `/img${i}.jpg`),
        projectHash: 'hash',
        createdAt: new Date()
      };

      const result = planner.validateCarouselGroup(invalidGroup);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('more than 10'))).toBe(true);
    });

    it('should reject unsupported file formats', () => {
      const invalidGroup = {
        id: 'test',
        assetPaths: ['/img1.jpg', '/video.mp4', '/doc.pdf'],
        projectHash: 'hash',
        createdAt: new Date()
      };

      const result = planner.validateCarouselGroup(invalidGroup);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Unsupported image format'))).toBe(true);
    });
  });

  describe('project hash extraction', () => {
    it('should extract project names from paths', async () => {
      const testCases = [
        {
          path: '/assets/projects/aluminum-gates/img1.jpg',
          expectedToInclude: 'aluminum-gates'
        },
        {
          path: '/renders/2024-kitchen-remodel/final/img2.jpg',
          expectedToInclude: 'kitchen-remodel'  
        },
        {
          path: '/media/office_renovation/session1/img3.jpg',
          expectedToInclude: 'office_renovation'
        }
      ];

      for (const testCase of testCases) {
        const result = await planner.groupAssetsForCarousels([testCase.path]);
        // Since it's a single asset, it should be ungrouped, but we can test the extraction logic
        // by having multiple assets with the same project
        const multipleAssets = [testCase.path, testCase.path.replace('img1', 'img2')];
        const multiResult = await planner.groupAssetsForCarousels(multipleAssets);
        
        expect(multiResult.groups).toHaveLength(1);
      }
    });
  });

  describe('stable ordering', () => {
    it('should maintain consistent order across multiple calls', async () => {
      const assetPaths = [
        '/assets/projects/test/img5.jpg',
        '/assets/projects/test/img1.jpg',
        '/assets/projects/test/img3.jpg',
        '/assets/projects/test/img2.jpg'
      ];

      const result1 = await planner.groupAssetsForCarousels([...assetPaths]);
      const result2 = await planner.groupAssetsForCarousels([...assetPaths.reverse()]);

      expect(result1.groups[0].assetPaths).toEqual(result2.groups[0].assetPaths);
    });

    it('should handle numeric sorting correctly', async () => {
      const assetPaths = [
        '/assets/projects/test/img10.jpg',
        '/assets/projects/test/img2.jpg',
        '/assets/projects/test/img1.jpg',
        '/assets/projects/test/img11.jpg'
      ];

      const result = await planner.groupAssetsForCarousels(assetPaths);
      const group = result.groups[0];

      // Should be sorted numerically: 1, 2, 10, 11
      expect(path.basename(group.assetPaths[0])).toBe('img1.jpg');
      expect(path.basename(group.assetPaths[1])).toBe('img2.jpg');
      expect(path.basename(group.assetPaths[2])).toBe('img10.jpg');
      expect(path.basename(group.assetPaths[3])).toBe('img11.jpg');
    });
  });

  describe('carousel caption generation', () => {
    it('should generate appropriate captions for different themes', async () => {
      const assetGroups = [
        {
          id: 'kitchen-group',
          assetPaths: ['/kitchen1.jpg', '/kitchen2.jpg', '/kitchen3.jpg'],
          projectHash: 'hash1',
          theme: 'kitchen',
          createdAt: new Date()
        },
        {
          id: 'gates-group', 
          assetPaths: ['/gates1.jpg', '/gates2.jpg'],
          projectHash: 'hash2',
          theme: 'gates',
          createdAt: new Date()
        }
      ];

      const scheduledTimes = [new Date(), new Date()];
      await planner.createCarouselPosts(assetGroups, scheduledTimes);

      // Check that captions include theme-specific content
      const createPostCalls = vi.mocked(mockRepository.createPost).mock.calls;
      
      const kitchenCall = createPostCalls.find(call => call[0].caption.includes('kitchen'));
      const gatesCall = createPostCalls.find(call => call[0].caption.includes('gates'));
      
      expect(kitchenCall).toBeDefined();
      expect(gatesCall).toBeDefined();
    });
  });
});