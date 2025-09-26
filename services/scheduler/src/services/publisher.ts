import { BufferClient } from '../integrations/bufferClient.js';
import { Repository } from '../repository.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

export interface PublishRequest {
  postId: string;
  approvedBy: string;
  notes?: string;
}

export interface CreateDraftsRequest {
  posts: Array<{
    id: string;
    text: string;
    mediaUrls: string[];
    scheduledAt?: Date;
    platforms: string[];
  }>;
}

export interface PublishResult {
  success: boolean;
  bufferId?: string;
  error?: string;
}

export interface CreateDraftsResult {
  success: boolean;
  createdDrafts: Record<string, Record<string, string>>; // postId -> profileId -> bufferId
  errors: Array<{ postId: string; error: string }>;
}

/**
 * Publisher service responsible for creating Buffer drafts and publishing approved posts
 */
export class Publisher {
  private bufferClient: BufferClient;

  constructor(
    private readonly repository: Repository,
    bufferAccessToken?: string
  ) {
    if (!bufferAccessToken) {
      throw new Error('Buffer access token is required for Publisher');
    }

    this.bufferClient = new BufferClient(bufferAccessToken, {
      retryConfig: {
        maxRetries: 3,
        baseDelay: 2000,
        maxDelay: 30000,
        jitter: true,
      },
    });
  }

  /**
   * Create Buffer drafts for multiple posts
   */
  async createDrafts(request: CreateDraftsRequest): Promise<CreateDraftsResult> {
    const result: CreateDraftsResult = {
      success: false,
      createdDrafts: {},
      errors: [],
    };

    // Get Buffer profiles
    let profiles;
    try {
      profiles = await this.bufferClient.getProfiles();
      logger.info({ profileCount: profiles.length }, 'Retrieved Buffer profiles');
    } catch (error) {
      const errorMessage = `Failed to get Buffer profiles: ${error instanceof Error ? error.message : error}`;
      logger.error({ error }, 'Failed to get Buffer profiles');
      
      // Mark all posts as failed
      for (const post of request.posts) {
        result.errors.push({ postId: post.id, error: errorMessage });
      }
      return result;
    }

    // Create profile mapping for platforms
    const profileMap = this.createProfileMapping(profiles);

    let successCount = 0;

    // Process each post
    for (const post of request.posts) {
      try {
        // Get profiles for requested platforms
        const requiredProfileIds = this.getProfilesForPlatforms(post.platforms, profileMap);
        
        if (requiredProfileIds.length === 0) {
          result.errors.push({ 
            postId: post.id, 
            error: `No Buffer profiles found for platforms: ${post.platforms.join(', ')}` 
          });
          continue;
        }

        // Prepare media
        const media = post.mediaUrls.map(url => ({ url, description: '' }));

        // Create drafts
        const draftIds = await this.bufferClient.createDraft(
          { text: post.text, scheduledAt: post.scheduledAt },
          media,
          requiredProfileIds
        );

        // Store results
        result.createdDrafts[post.id] = draftIds;

        // Update database
        await this.updatePostWithBufferIds(post.id, draftIds);

        successCount++;
        logger.info({ 
          postId: post.id, 
          draftCount: Object.keys(draftIds).length,
          platforms: post.platforms,
        }, 'Buffer drafts created successfully');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({ postId: post.id, error: errorMessage });
        
        logger.error({ 
          postId: post.id, 
          error: errorMessage,
          platforms: post.platforms,
        }, 'Failed to create Buffer drafts');
      }
    }

    result.success = successCount > 0;
    
    logger.info({ 
      totalPosts: request.posts.length,
      successCount,
      errorCount: result.errors.length,
    }, 'Batch draft creation completed');

    return result;
  }

  /**
   * Publish an approved post
   */
  async publishPost(request: PublishRequest): Promise<PublishResult> {
    try {
      // Get post from database
      const post = this.repository.getPost(request.postId);
      if (!post) {
        return { success: false, error: 'Post not found' };
      }

      if (post.status !== 'APPROVED') {
        return { success: false, error: `Post status is ${post.status}, expected APPROVED` };
      }

      // Parse Buffer draft IDs
      const bufferDraftIds = this.parseBufferDraftIds(post.buffer_draft_ids);
      if (Object.keys(bufferDraftIds).length === 0) {
        return { success: false, error: 'No Buffer draft IDs found for post' };
      }

      // Publish all drafts
      const publishResults = await Promise.allSettled(
        Object.entries(bufferDraftIds).map(async ([profileId, bufferId]) => {
          try {
            await this.bufferClient.publish(bufferId);
            return { profileId, bufferId, success: true };
          } catch (error) {
            logger.error({ 
              profileId, 
              bufferId, 
              error: error instanceof Error ? error.message : error 
            }, 'Failed to publish Buffer draft');
            return { 
              profileId, 
              bufferId, 
              success: false, 
              error: error instanceof Error ? error.message : String(error) 
            };
          }
        })
      );

      // Check results
      const successful = publishResults.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;

      const failed = publishResults.length - successful;

      if (successful === 0) {
        return { success: false, error: 'All Buffer publishes failed' };
      }

      // Update post status
      this.repository.updatePostStatus(request.postId, 'PUBLISHED');
      
      // Record approval
      this.repository.createApproval({
        postId: request.postId,
        action: 'published',
        approvedBy: request.approvedBy,
        notes: request.notes,
      });

      logger.info({ 
        postId: request.postId,
        successful,
        failed,
        approvedBy: request.approvedBy,
      }, 'Post published to Buffer');

      return { 
        success: true, 
        bufferId: Object.values(bufferDraftIds)[0] // Return first buffer ID for reference
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        postId: request.postId, 
        error: errorMessage 
      }, 'Failed to publish post');
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Reject a post and clean up Buffer drafts
   */
  async rejectPost(postId: string, rejectedBy: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get post from database
      const post = this.repository.getPost(postId);
      if (!post) {
        return { success: false, error: 'Post not found' };
      }

      // Parse Buffer draft IDs
      const bufferDraftIds = this.parseBufferDraftIds(post.buffer_draft_ids);

      // Delete Buffer drafts (best effort)
      if (Object.keys(bufferDraftIds).length > 0) {
        await Promise.allSettled(
          Object.entries(bufferDraftIds).map(async ([profileId, bufferId]) => {
            try {
              await this.bufferClient.deletePost(bufferId);
              logger.debug({ profileId, bufferId }, 'Buffer draft deleted');
            } catch (error) {
              logger.warn({ 
                profileId, 
                bufferId, 
                error: error instanceof Error ? error.message : error 
              }, 'Failed to delete Buffer draft (non-critical)');
            }
          })
        );
      }

      // Update post status
      this.repository.updatePostStatus(postId, 'REJECTED');
      
      // Record rejection
      this.repository.createApproval({
        postId,
        action: 'rejected',
        approvedBy: rejectedBy,
        notes,
      });

      logger.info({ 
        postId,
        rejectedBy,
        draftCount: Object.keys(bufferDraftIds).length,
      }, 'Post rejected and Buffer drafts cleaned up');

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ postId, error: errorMessage }, 'Failed to reject post');
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get metrics for published posts
   */
  async getPostMetrics(postId: string): Promise<Record<string, any> | null> {
    try {
      const post = this.repository.getPost(postId);
      if (!post || post.status !== 'PUBLISHED') {
        return null;
      }

      const bufferDraftIds = this.parseBufferDraftIds(post.buffer_draft_ids);
      const metrics: Record<string, any> = {};

      // Fetch metrics for each Buffer post
      await Promise.allSettled(
        Object.entries(bufferDraftIds).map(async ([profileId, bufferId]) => {
          try {
            const bufferPost = await this.bufferClient.getPost(bufferId);
            if (bufferPost.statistics) {
              metrics[profileId] = {
                platform: bufferPost.profile_service,
                statistics: bufferPost.statistics,
                sent_at: bufferPost.sent_at,
              };
            }
          } catch (error) {
            logger.warn({ 
              profileId, 
              bufferId, 
              error: error instanceof Error ? error.message : error 
            }, 'Failed to fetch Buffer post metrics');
          }
        })
      );

      return Object.keys(metrics).length > 0 ? metrics : null;

    } catch (error) {
      logger.error({ 
        postId, 
        error: error instanceof Error ? error.message : error 
      }, 'Failed to get post metrics');
      return null;
    }
  }

  /**
   * Create mapping from platforms to Buffer profile IDs
   */
  private createProfileMapping(profiles: any[]): Record<string, string[]> {
    const mapping: Record<string, string[]> = {};

    for (const profile of profiles) {
      const service = profile.service.toLowerCase();
      const profileId = profile.id;

      // Map Buffer service names to our platform names
      switch (service) {
        case 'instagram':
          mapping['instagram'] = mapping['instagram'] || [];
          mapping['instagram'].push(profileId);
          mapping['instagram_reel'] = mapping['instagram_reel'] || [];
          mapping['instagram_reel'].push(profileId);
          break;
        case 'facebook':
          mapping['facebook'] = mapping['facebook'] || [];
          mapping['facebook'].push(profileId);
          mapping['facebook_reel'] = mapping['facebook_reel'] || [];
          mapping['facebook_reel'].push(profileId);
          break;
        case 'twitter':
          mapping['twitter'] = mapping['twitter'] || [];
          mapping['twitter'].push(profileId);
          break;
        case 'linkedin':
          mapping['linkedin'] = mapping['linkedin'] || [];
          mapping['linkedin'].push(profileId);
          mapping['linkedin_company'] = mapping['linkedin_company'] || [];
          mapping['linkedin_company'].push(profileId);
          break;
        case 'tiktok':
          mapping['tiktok'] = mapping['tiktok'] || [];
          mapping['tiktok'].push(profileId);
          break;
        case 'youtube':
          mapping['youtube_short'] = mapping['youtube_short'] || [];
          mapping['youtube_short'].push(profileId);
          break;
        default:
          logger.debug({ service, profileId }, 'Unknown Buffer service, skipping');
      }
    }

    return mapping;
  }

  /**
   * Get Buffer profile IDs for requested platforms
   */
  private getProfilesForPlatforms(platforms: string[], profileMap: Record<string, string[]>): string[] {
    const profileIds = new Set<string>();

    for (const platform of platforms) {
      const profiles = profileMap[platform] || [];
      for (const profileId of profiles) {
        profileIds.add(profileId);
      }
    }

    return Array.from(profileIds);
  }

  /**
   * Update post with Buffer draft IDs
   */
  private async updatePostWithBufferIds(postId: string, draftIds: Record<string, string>): Promise<void> {
    try {
      // Convert to array format for database storage
      const bufferDraftIds = Object.entries(draftIds).map(([profileId, bufferId]) => ({
        profileId,
        bufferId,
        createdAt: new Date().toISOString(),
      }));

      this.repository.updatePost(postId, {
        buffer_draft_ids: JSON.stringify(bufferDraftIds),
        updated_at: new Date(),
      });

    } catch (error) {
      logger.error({ 
        postId, 
        draftIds, 
        error: error instanceof Error ? error.message : error 
      }, 'Failed to update post with Buffer IDs');
      throw error;
    }
  }

  /**
   * Parse Buffer draft IDs from database JSON
   */
  private parseBufferDraftIds(bufferDraftIds: any): Record<string, string> {
    try {
      if (!bufferDraftIds) return {};
      
      const parsed = typeof bufferDraftIds === 'string' 
        ? JSON.parse(bufferDraftIds) 
        : bufferDraftIds;

      if (Array.isArray(parsed)) {
        // New format: array of objects
        const result: Record<string, string> = {};
        for (const item of parsed) {
          if (item.profileId && item.bufferId) {
            result[item.profileId] = item.bufferId;
          }
        }
        return result;
      } else if (typeof parsed === 'object') {
        // Legacy format: direct object mapping
        return parsed;
      }

      return {};
    } catch (error) {
      logger.warn({ 
        bufferDraftIds, 
        error: error instanceof Error ? error.message : error 
      }, 'Failed to parse Buffer draft IDs');
      return {};
    }
  }
}