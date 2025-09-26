import { config } from '../config.js';
import { Repository, Post } from '../repository.js';
import pino from 'pino';
import pRetry from 'p-retry';

const logger = pino();

export interface PostMetrics {
  postId: string;
  bufferId: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  impressions: number;
  reach: number;
  engagementRate: number;
  clickThroughRate: number;
  collectedAt: Date;
}

export interface WeeklyMetricsReport {
  weekStart: Date;
  weekEnd: Date;
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalClicks: number;
  totalImpressions: number;
  totalReach: number;
  avgEngagementRate: number;
  avgClickThroughRate: number;
  topPosts: Array<{
    postId: string;
    platform: string;
    caption: string;
    metrics: PostMetrics;
    performanceScore: number;
  }>;
  platformBreakdown: Array<{
    platform: string;
    postCount: number;
    avgEngagement: number;
    topPost: string;
  }>;
  insights: string[];
  generatedAt: Date;
}

/**
 * Harvests metrics from Buffer API and social media platforms
 * Stores performance data for weekly reporting and analytics
 */
export class MetricsHarvester {
  private repository: Repository;
  private baseUrl: string;
  private accessToken: string;

  constructor() {
    this.repository = new Repository();
    this.baseUrl = 'https://api.bufferapp.com/1';
    this.accessToken = config.config.BUFFER_ACCESS_TOKEN;
  }

  /**
   * Collect metrics for all published posts in the last week
   */
  async harvestWeeklyMetrics(): Promise<WeeklyMetricsReport> {
    logger.info('Starting weekly metrics harvest');

    const weekEnd = new Date();
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 7);

    // Get published posts from the last week
    const publishedPosts = this.repository.getPublishedPostsInRange(weekStart, weekEnd);
    logger.info(`Found ${publishedPosts.length} published posts to analyze`);

    if (publishedPosts.length === 0) {
      return this.createEmptyReport(weekStart, weekEnd);
    }

    // Collect metrics for each post
    const postMetrics: PostMetrics[] = [];
    for (const post of publishedPosts) {
      try {
        const metrics = await this.collectPostMetrics(post);
        if (metrics) {
          postMetrics.push(metrics);
          // Store metrics in database for historical tracking
          this.repository.storePostMetrics(metrics);
        }
      } catch (error) {
        logger.error(`Failed to collect metrics for post ${post.id}:`, error);
      }
    }

    // Generate comprehensive weekly report
    const report = this.generateWeeklyReport(postMetrics, weekStart, weekEnd);
    
    // Store the weekly report
    this.repository.storeWeeklyReport(report);
    
    logger.info(`Weekly metrics harvest completed - analyzed ${postMetrics.length} posts`);
    return report;
  }

  /**
   * Collect metrics for a specific post from Buffer and platform APIs
   */
  private async collectPostMetrics(post: Post): Promise<PostMetrics | null> {
    if (!post.bufferDraftId) {
      logger.warn(`Post ${post.id} has no Buffer draft ID, skipping metrics collection`);
      return null;
    }

    try {
      // Collect Buffer metrics with retry logic
      const bufferMetrics = await pRetry(
        () => this.fetchBufferMetrics(post.bufferDraftId!),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          onFailedAttempt: (error) => {
            logger.warn(`Buffer API attempt ${error.attemptNumber} failed for post ${post.id}:`, error.message);
          }
        }
      );

      // Combine metrics from Buffer (platform-specific metrics would need external IDs)
      const metrics = this.combineMetrics(post, bufferMetrics, null);
      
      logger.info(`Collected metrics for post ${post.id}`, {
        platform: post.platform,
        views: metrics.views,
        likes: metrics.likes,
        engagement: metrics.engagementRate
      });

      return metrics;

    } catch (error) {
      logger.error(`Failed to collect metrics for post ${post.id}:`, error);
      return null;
    }
  }

  /**
   * Fetch metrics from Buffer API
   */
  private async fetchBufferMetrics(bufferDraftId: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/updates/${bufferDraftId}.json?access_token=${this.accessToken}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'VitrineAlu-Scheduler/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Buffer API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.statistics || {};

    } catch (error) {
      clearTimeout(timeoutId);
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        throw new Error('Buffer API timeout');
      }
      throw error;
    }
  }

  /**
   * Combine metrics from different sources
   */
  private combineMetrics(post: Post, bufferMetrics: any, platformMetrics: any): PostMetrics {
    const views = bufferMetrics.views || platformMetrics?.views || 0;
    const likes = bufferMetrics.likes || platformMetrics?.likes || 0;
    const comments = bufferMetrics.comments || platformMetrics?.comments || 0;
    const shares = bufferMetrics.shares || platformMetrics?.shares || 0;
    const clicks = bufferMetrics.clicks || 0;
    const impressions = bufferMetrics.impressions || platformMetrics?.impressions || 0;
    const reach = bufferMetrics.reach || platformMetrics?.reach || 0;

    // Calculate engagement rate
    const totalEngagements = likes + comments + shares;
    const engagementRate = impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

    // Calculate click-through rate
    const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;

    return {
      postId: post.id,
      bufferId: post.bufferDraftId!,
      platform: post.platform,
      views,
      likes,
      comments,
      shares,
      clicks,
      impressions,
      reach,
      engagementRate: Math.round(engagementRate * 100) / 100,
      clickThroughRate: Math.round(clickThroughRate * 100) / 100,
      collectedAt: new Date()
    };
  }

  /**
   * Generate comprehensive weekly metrics report
   */
  private generateWeeklyReport(metrics: PostMetrics[], weekStart: Date, weekEnd: Date): WeeklyMetricsReport {
    if (metrics.length === 0) {
      return this.createEmptyReport(weekStart, weekEnd);
    }

    // Calculate totals
    const totalViews = metrics.reduce((sum, m) => sum + m.views, 0);
    const totalLikes = metrics.reduce((sum, m) => sum + m.likes, 0);
    const totalComments = metrics.reduce((sum, m) => sum + m.comments, 0);
    const totalShares = metrics.reduce((sum, m) => sum + m.shares, 0);
    const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const totalReach = metrics.reduce((sum, m) => sum + m.reach, 0);

    // Calculate averages
    const avgEngagementRate = metrics.reduce((sum, m) => sum + m.engagementRate, 0) / metrics.length;
    const avgClickThroughRate = metrics.reduce((sum, m) => sum + m.clickThroughRate, 0) / metrics.length;

    // Find top performing posts
    const topPosts = metrics
      .map(m => {
        const post = this.repository.getPostById(m.postId);
        const performanceScore = this.calculatePerformanceScore(m);
        return {
          postId: m.postId,
          platform: m.platform,
          caption: post?.caption || 'N/A',
          metrics: m,
          performanceScore
        };
      })
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 5);

    // Platform breakdown
    const platformBreakdown = this.generatePlatformBreakdown(metrics);

    // Generate insights
    const insights = this.generateInsights(metrics, totalImpressions, avgEngagementRate);

    return {
      weekStart,
      weekEnd,
      totalPosts: metrics.length,
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      totalClicks,
      totalImpressions,
      totalReach,
      avgEngagementRate: Math.round(avgEngagementRate * 100) / 100,
      avgClickThroughRate: Math.round(avgClickThroughRate * 100) / 100,
      topPosts,
      platformBreakdown,
      insights,
      generatedAt: new Date()
    };
  }

  /**
   * Calculate performance score for a post
   */
  private calculatePerformanceScore(metrics: PostMetrics): number {
    // Weighted performance score based on multiple factors
    const viewsScore = Math.min(metrics.views / 1000, 10); // Views (max 10 points)
    const engagementScore = Math.min(metrics.engagementRate, 10); // Engagement rate (max 10 points)
    const clickScore = Math.min(metrics.clickThroughRate * 2, 5); // CTR (max 5 points)
    
    return Math.round((viewsScore + engagementScore + clickScore) * 100) / 100;
  }

  /**
   * Generate platform-specific breakdown
   */
  private generatePlatformBreakdown(metrics: PostMetrics[]): Array<{
    platform: string;
    postCount: number;
    avgEngagement: number;
    topPost: string;
  }> {
  const platforms = Array.from(new Set(metrics.map(m => m.platform)));
    
    return platforms.map(platform => {
      const platformMetrics = metrics.filter(m => m.platform === platform);
      const avgEngagement = platformMetrics.reduce((sum, m) => sum + m.engagementRate, 0) / platformMetrics.length;
      const topPost = platformMetrics
        .sort((a, b) => this.calculatePerformanceScore(b) - this.calculatePerformanceScore(a))[0];

      return {
        platform,
        postCount: platformMetrics.length,
        avgEngagement: Math.round(avgEngagement * 100) / 100,
        topPost: topPost?.postId || 'N/A'
      };
    });
  }

  /**
   * Generate actionable insights based on metrics
   */
  private generateInsights(metrics: PostMetrics[], totalImpressions: number, avgEngagement: number): string[] {
    const insights: string[] = [];

    // Engagement rate insights
    if (avgEngagement > 3) {
      insights.push('🎉 Excellent engagement rate this week! Your content is resonating well with your audience.');
    } else if (avgEngagement > 1.5) {
      insights.push('👍 Good engagement rate. Consider experimenting with more interactive content to boost it further.');
    } else {
      insights.push('📈 Engagement could be improved. Try using more questions, polls, or calls-to-action in your posts.');
    }

    // Platform performance insights
    const platformBreakdown = this.generatePlatformBreakdown(metrics);
    const bestPlatform = platformBreakdown.sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
    if (bestPlatform) {
      insights.push(`🏆 ${bestPlatform.platform.toUpperCase()} performed best this week with ${bestPlatform.avgEngagement}% avg engagement.`);
    }

    // Content timing insights
    const posts = metrics.map(m => this.repository.getPostById(m.postId)).filter(Boolean);
    if (posts.length > 0) {
      const hourCounts = posts.reduce((acc, post) => {
        const hour = post!.scheduledAt.getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      
      const bestHour = Object.entries(hourCounts)
        .sort(([,a], [,b]) => b - a)[0];
      
      if (bestHour) {
        insights.push(`⏰ Most posts were scheduled for ${bestHour[0]}:00. Consider testing different posting times.`);
      }
    }

    // Volume insights
    if (metrics.length > 10) {
      insights.push('📊 High posting volume this week. Monitor engagement to ensure quality over quantity.');
    } else if (metrics.length < 3) {
      insights.push('📈 Consider increasing posting frequency to maintain audience engagement.');
    }

    return insights;
  }

  /**
   * Create empty metrics report for weeks with no published posts
   */
  private createEmptyReport(weekStart: Date, weekEnd: Date): WeeklyMetricsReport {
    return {
      weekStart,
      weekEnd,
      totalPosts: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalClicks: 0,
      totalImpressions: 0,
      totalReach: 0,
      avgEngagementRate: 0,
      avgClickThroughRate: 0,
      topPosts: [],
      platformBreakdown: [],
      insights: ['No posts were published this week. Consider scheduling more content to maintain audience engagement.'],
      generatedAt: new Date()
    };
  }

  /**
   * Collect metrics for a specific post by ID (for manual testing)
   */
  async harvestPostMetrics(postId: string): Promise<PostMetrics | null> {
    const post = this.repository.getPostById(postId);
    if (!post) {
      logger.error(`Post ${postId} not found`);
      return null;
    }

    return this.collectPostMetrics(post);
  }

  /**
   * Get historical metrics for analysis
   */
  getHistoricalMetrics(days: number = 30): PostMetrics[] {
    const metricsData = this.repository.getPostMetricsInRange(
      new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      new Date()
    );
    
    // Convert repository format to PostMetrics format
    return metricsData.map(data => ({
      postId: data.postId,
      bufferId: data.metrics.bufferId || 'unknown',
      platform: data.platform,
      views: data.metrics.views || 0,
      likes: data.metrics.likes || 0,
      comments: data.metrics.comments || 0,
      shares: data.metrics.shares || 0,
      clicks: data.metrics.clicks || 0,
      impressions: data.metrics.impressions || 0,
      reach: data.metrics.reach || 0,
      engagementRate: data.metrics.engagementRate || 0,
      clickThroughRate: data.metrics.clickThroughRate || 0,
      collectedAt: data.fetchedAt
    }));
  }

  /**
   * Close database connections
   */
  close(): void {
    this.repository.close();
  }
}