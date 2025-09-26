import { Repository, Post, PostStatus } from '../repository.js';
import { PlanningService } from '../plan.js';
import { config } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as YAML from 'yaml';
import pino from 'pino';

const logger = pino({ level: 'info' });

// Asset grouping configuration from schedule.yaml
interface AssetGroup {
  id: string;
  assetPaths: string[];
  projectHash: string;
  sessionId?: string;
  theme?: string;
  createdAt: Date;
}

interface CarouselPlanningConfig {
  minImages: number;
  maxImages: number;
  supportedPlatforms: string[];
  groupingStrategy: 'project' | 'session' | 'theme';
  stableOrdering: boolean;
}

interface GroupedAssets {
  groups: AssetGroup[];
  ungrouped: string[];
}

/**
 * Carousel Asset Planner - Groups assets into carousel posts for Instagram/Facebook
 * Implements Task 4 requirements: group assets (2-5) by project/session, stable ordering
 */
export class CarouselAssetPlanner {
  private repository: Repository;
  private planningService: PlanningService;
  private config: CarouselPlanningConfig;

  constructor(repository: Repository, planningService: PlanningService) {
    this.repository = repository;
    this.planningService = planningService;
    this.config = this.loadCarouselConfig();
  }

  /**
   * Load carousel configuration from schedule.yaml
   */
  private loadCarouselConfig(): CarouselPlanningConfig {
    try {
      const scheduleConfigPath = path.resolve(process.cwd(), '../../config/schedule.yaml');
      const configContent = fs.readFileSync(scheduleConfigPath, 'utf-8');
      const scheduleConfig = YAML.parse(configContent);
      
      // Extract carousel slot configuration
      const carouselSlots = Object.values(scheduleConfig.slots || {})
        .filter((slot: any) => slot.format === 'carousel');
        
      if (carouselSlots.length === 0) {
        throw new Error('No carousel slots found in schedule.yaml');
      }

      const carouselSlot = carouselSlots[0] as any;
      
      return {
        minImages: 2,
        maxImages: Math.min(carouselSlot.images || 5, 10), // Buffer limit is 10
        supportedPlatforms: carouselSlot.platforms || ['instagram', 'facebook'],
        groupingStrategy: 'project', // Group by project/session
        stableOrdering: true
      };
    } catch (error) {
      logger.warn({ msg: 'Failed to load carousel config, using defaults', error: error.message });
      return {
        minImages: 2,
        maxImages: 5,
        supportedPlatforms: ['instagram', 'facebook'],
        groupingStrategy: 'project',
        stableOrdering: true
      };
    }
  }

  /**
   * Group assets by project/session for carousel creation
   * Implements stable ordering and respects 2-5 image limits
   */
  async groupAssetsForCarousels(assetPaths: string[]): Promise<GroupedAssets> {
    if (assetPaths.length === 0) {
      return { groups: [], ungrouped: [] };
    }

    // Validate image count limits
    if (assetPaths.length > this.config.maxImages * 5) {
      logger.warn({ 
        msg: 'Too many assets for carousel planning', 
        assetCount: assetPaths.length, 
        maxRecommended: this.config.maxImages * 5 
      });
    }

    // Group assets by project/session
    const projectGroups = await this.groupAssetsByProject(assetPaths);
    
    // Filter and validate groups
    const validGroups: AssetGroup[] = [];
    const ungrouped: string[] = [];

    for (const [projectHash, assets] of projectGroups.entries()) {
      // Reject groups with > 10 images (Buffer limit)
      if (assets.length > 10) {
        logger.warn({ 
          msg: 'Asset group exceeds Buffer limit, breaking into smaller groups', 
          projectHash, 
          assetCount: assets.length 
        });
        
        // Break large group into smaller valid groups
        for (let i = 0; i < assets.length; i += this.config.maxImages) {
          const subGroup = assets.slice(i, i + this.config.maxImages);
          if (subGroup.length >= this.config.minImages) {
            validGroups.push({
              id: `${projectHash}_${Math.floor(i / this.config.maxImages)}`,
              assetPaths: this.ensureStableOrder(subGroup),
              projectHash,
              sessionId: this.extractSessionId(subGroup[0]),
              theme: this.extractTheme(subGroup[0]),
              createdAt: new Date()
            });
          } else {
            ungrouped.push(...subGroup);
          }
        }
        continue;
      }

      // Groups with 2-5 images are valid for carousel
      if (assets.length >= this.config.minImages && assets.length <= this.config.maxImages) {
        validGroups.push({
          id: crypto.createHash('sha256').update(projectHash).digest('hex').substring(0, 16),
          assetPaths: this.ensureStableOrder(assets),
          projectHash,
          sessionId: this.extractSessionId(assets[0]),
          theme: this.extractTheme(assets[0]),
          createdAt: new Date()
        });
      } else if (assets.length === 1) {
        // Single assets go to ungrouped for single posts
        ungrouped.push(...assets);
      } else {
        // Groups with 6-10 images - try to split optimally
        const optimalGroups = this.splitLargeGroup(assets, projectHash);
        validGroups.push(...optimalGroups);
      }
    }

    logger.info({
      msg: 'Asset grouping completed',
      totalAssets: assetPaths.length,
      carouselGroups: validGroups.length,
      ungroupedAssets: ungrouped.length,
      avgGroupSize: validGroups.length > 0 ? (validGroups.reduce((sum, g) => sum + g.assetPaths.length, 0) / validGroups.length).toFixed(1) : 0
    });

    return {
      groups: validGroups,
      ungrouped
    };
  }

  /**
   * Create carousel posts from asset groups
   * Implements Buffer payload with multiple image URLs and merged captions
   */
  async createCarouselPosts(
    assetGroups: AssetGroup[],
    scheduledTimes: Date[]
  ): Promise<Post[]> {
    const posts: Post[] = [];
    
    for (let i = 0; i < Math.min(assetGroups.length, scheduledTimes.length); i++) {
      const group = assetGroups[i];
      const scheduledAt = scheduledTimes[i];
      
      // Generate caption for first image (leads the carousel)
      const leadCaption = await this.generateCarouselCaption(group);
      
      // Create posts for each supported platform
      for (const platform of this.config.supportedPlatforms) {
        if (!this.isPlatformCarouselSupported(platform)) {
          logger.warn({ msg: 'Platform does not support carousels', platform });
          continue;
        }

        const contentHash = this.generateContentHash(group, platform);
        
        // Avoid duplicates
        if (this.repository.postExists(contentHash)) {
          logger.info({ msg: 'Carousel post already exists, skipping', contentHash, platform });
          continue;
        }

        const post = this.repository.createPost({
          contentHash,
          platform,
          caption: leadCaption.caption,
          hashtags: leadCaption.hashtags,
          mediaUrls: this.convertPathsToUrls(group.assetPaths),
          scheduledAt,
          status: 'DRAFT' as PostStatus,
          contentType: 'carousel',
          assetId: group.id
        });

        // Track carousel usage for analytics
        this.repository.trackCarouselUsage(
          contentHash,
          group.theme || 'unknown',
          platform
        );

        posts.push(post);
        
        logger.info({
          msg: 'Carousel post created',
          postId: post.id,
          platform,
          imageCount: group.assetPaths.length,
          scheduledAt: scheduledAt.toISOString(),
          theme: group.theme
        });
      }
    }

    return posts;
  }

  /**
   * Group assets by project using directory structure and metadata
   */
  private async groupAssetsByProject(assetPaths: string[]): Promise<Map<string, string[]>> {
    const projectGroups = new Map<string, string[]>();

    for (const assetPath of assetPaths) {
      const projectHash = this.extractProjectHash(assetPath);
      
      if (!projectGroups.has(projectHash)) {
        projectGroups.set(projectHash, []);
      }
      
      projectGroups.get(projectHash)!.push(assetPath);
    }

    return projectGroups;
  }

  /**
   * Extract project identifier from asset path for grouping
   * Uses directory structure and naming patterns
   */
  private extractProjectHash(assetPath: string): string {
    // Extract project info from path structure
    const pathParts = assetPath.split('/').filter(Boolean);
    
    // Look for project indicators in path
    // Examples: /projects/aluminum-gates/session1/img1.jpg -> "aluminum-gates"
    //          /renders/2024-09-kitchen-remodel/final/img2.jpg -> "kitchen-remodel"
    
    let projectKey = '';
    
    // Find project directory (usually contains project name)
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      
      // Skip common directories
      if (['assets', 'media', 'images', 'renders', 'ready', 'source'].includes(part)) {
        continue;
      }
      
      // Look for project-like directory names
      if (part.length > 3 && (part.includes('-') || part.includes('_'))) {
        projectKey = part;
        break;
      }
    }
    
    // Fallback: use parent directory
    if (!projectKey && pathParts.length > 1) {
      projectKey = pathParts[pathParts.length - 2];
    }
    
    // Generate consistent hash for project
    return crypto
      .createHash('sha256')
      .update(projectKey || 'default')
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Extract session ID from asset path for sub-grouping
   */
  private extractSessionId(assetPath: string): string | undefined {
    const pathParts = assetPath.split('/');
    
    // Look for session indicators: session1, batch2, day1, etc.
    for (const part of pathParts) {
      if (/^(session|batch|day|set)\d+$/i.test(part)) {
        return part;
      }
    }
    
    return undefined;
  }

  /**
   * Extract theme from asset path for categorization
   */
  private extractTheme(assetPath: string): string | undefined {
    const filename = path.basename(assetPath, path.extname(assetPath));
    const pathParts = assetPath.split('/');
    
    // Look for theme indicators in path or filename
    const themeKeywords = [
      'kitchen', 'bathroom', 'office', 'residential', 'commercial',
      'gates', 'railings', 'windows', 'doors', 'fabrication',
      'welding', 'installation', 'design', 'custom'
    ];
    
    for (const keyword of themeKeywords) {
      if (filename.toLowerCase().includes(keyword) || 
          pathParts.some(part => part.toLowerCase().includes(keyword))) {
        return keyword;
      }
    }
    
    return undefined;
  }

  /**
   * Ensure stable ordering of assets within a group
   * Uses filename sorting to maintain consistency
   */
  private ensureStableOrder(assets: string[]): string[] {
    return assets.sort((a, b) => {
      // Sort by filename to ensure consistent ordering
      const filenameA = path.basename(a);
      const filenameB = path.basename(b);
      
      // Extract numbers from filenames for natural sorting
      const numA = this.extractNumber(filenameA);
      const numB = this.extractNumber(filenameB);
      
      if (numA !== null && numB !== null) {
        return numA - numB;
      }
      
      return filenameA.localeCompare(filenameB);
    });
  }

  /**
   * Extract number from filename for natural sorting
   */
  private extractNumber(filename: string): number | null {
    const match = filename.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Split large asset group into optimal carousel-sized groups
   */
  private splitLargeGroup(assets: string[], projectHash: string): AssetGroup[] {
    const groups: AssetGroup[] = [];
    const sortedAssets = this.ensureStableOrder(assets);
    
    // Try to create groups of optimal size (3-4 images)
    const optimalSize = 3;
    let currentIndex = 0;
    let groupIndex = 0;
    
    while (currentIndex < sortedAssets.length) {
      const remaining = sortedAssets.length - currentIndex;
      
      // If remaining assets would make a group too small, adjust current group size
      let groupSize = optimalSize;
      if (remaining <= optimalSize + 1 && remaining >= this.config.minImages) {
        groupSize = remaining; // Take all remaining
      } else if (remaining < this.config.minImages) {
        // Add remaining to previous group if it exists and won't exceed max
        if (groups.length > 0 && groups[groups.length - 1].assetPaths.length + remaining <= this.config.maxImages) {
          groups[groups.length - 1].assetPaths.push(...sortedAssets.slice(currentIndex));
          break;
        }
        // Otherwise skip remaining assets (too few for a group)
        break;
      }
      
      const groupAssets = sortedAssets.slice(currentIndex, currentIndex + groupSize);
      
      groups.push({
        id: `${projectHash}_${groupIndex}`,
        assetPaths: groupAssets,
        projectHash,
        sessionId: this.extractSessionId(groupAssets[0]),
        theme: this.extractTheme(groupAssets[0]),
        createdAt: new Date()
      });
      
      currentIndex += groupSize;
      groupIndex++;
    }
    
    return groups;
  }

  /**
   * Generate merged caption for carousel (first image leads)
   */
  private async generateCarouselCaption(group: AssetGroup): Promise<{ caption: string; hashtags: string[] }> {
    // For now, use project-based caption generation
    // In production, this would integrate with the caption service from Task 3
    
    const theme = group.theme || 'aluminum work';
    const imageCount = group.assetPaths.length;
    
    const caption = `Professional ${theme} showcase - ${imageCount} images revealing our precision and quality. Swipe to see the complete process! 👆`;
    
    const hashtags = [
      'AluminumWork',
      'QualityFirst',
      'Craftsmanship',
      theme.charAt(0).toUpperCase() + theme.slice(1),
      'BehindTheScenes'
    ].slice(0, 5); // Limit to 5 hashtags for Instagram
    
    return { caption, hashtags };
  }

  /**
   * Generate content hash for carousel group
   */
  private generateContentHash(group: AssetGroup, platform: string): string {
    const content = {
      assetPaths: group.assetPaths,
      platform,
      projectHash: group.projectHash,
      theme: group.theme
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex');
  }

  /**
   * Check if platform supports carousels
   */
  private isPlatformCarouselSupported(platform: string): boolean {
    const carouselSupportedPlatforms = ['instagram', 'facebook'];
    return carouselSupportedPlatforms.includes(platform);
  }

  /**
   * Convert local asset paths to accessible URLs
   */
  private convertPathsToUrls(assetPaths: string[]): string[] {
    const baseUrl = process.env.ASSET_BASE_URL || config.config.ASSET_BASE_URL || 'https://assets.example.com';
    
    return assetPaths.map(assetPath => {
      // Convert local path to URL
      // Remove leading slash and convert to web path
      const webPath = assetPath.replace(/^\/+/, '').replace(/\\/g, '/');
      return `${baseUrl}/${webPath}`;
    });
  }

  /**
   * Validate carousel group meets requirements
   */
  validateCarouselGroup(group: AssetGroup): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (group.assetPaths.length < this.config.minImages) {
      errors.push(`Carousel must have at least ${this.config.minImages} images`);
    }
    
    if (group.assetPaths.length > this.config.maxImages) {
      errors.push(`Carousel cannot have more than ${this.config.maxImages} images`);
    }
    
    if (group.assetPaths.length > 10) {
      errors.push('Carousel cannot have more than 10 images (Buffer limit)');
    }
    
    // Validate all paths are images
    for (const assetPath of group.assetPaths) {
      const ext = path.extname(assetPath).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        errors.push(`Unsupported image format: ${ext}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get carousel statistics for reporting
   */
  getCarouselStats(): {
    totalCarouselsCreated: number;
    avgImagesPerCarousel: number;
    topThemes: Array<{ theme: string; count: number }>;
  } {
    // This would query the database for carousel statistics
    // For now, return placeholder data
    return {
      totalCarouselsCreated: 0,
      avgImagesPerCarousel: 0,
      topThemes: []
    };
  }
}