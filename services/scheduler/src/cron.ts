import cron from 'node-cron';
import { Repository } from './repository.js';
import { BufferClient } from './bufferClient.js';
import { DigestGenerator } from './email/digest.js';
import { MetricsHarvester } from './metrics/harvester.js';
import { mailer } from './mailer.js';
import { config } from './config.js';
import { logger } from './logger.js';

export class CronScheduler {
  private repository: Repository;
  private bufferClient: BufferClient;
  private digestGenerator: DigestGenerator;
  private metricsHarvester: MetricsHarvester;
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(repository: Repository, bufferClient: BufferClient, digestGenerator: DigestGenerator) {
    this.repository = repository;
    this.bufferClient = bufferClient;
    this.digestGenerator = digestGenerator;
    this.metricsHarvester = new MetricsHarvester();
  }

  /**
   * Start all cron jobs
   */
  start(): void {
    this.scheduleWeeklyDigest();
    this.schedulePublishApproved();
    this.scheduleWeeklyMetricsHarvest();
    logger.info('Cron scheduler started');
  }

  /**
   * Stop all cron jobs
   */
  stop(): void {
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped cron job: ${name}`);
    }
    this.jobs.clear();
  }

  /**
   * Schedule weekly digest email (every Monday at 9 AM)
   */
  private scheduleWeeklyDigest(): void {
    const job = cron.schedule('0 9 * * 1', async () => {
      try {
        logger.info('Running weekly digest job');

        // Get posts for the upcoming week
        const now = new Date();
        const nextWeek = new Date(now);
        nextWeek.setDate(now.getDate() + 7);

        const posts = this.repository.getPostsForDigest(now, nextWeek);

        if (posts.length === 0) {
          logger.info('No posts scheduled for digest this week');
          return;
        }

        // Generate HTML digest
        const htmlDigest = this.digestGenerator.generateDigest(posts, now, nextWeek);

        // Send digest email
        await mailer.sendDigest(
          config.config.OWNER_EMAIL,
          `Social Media Digest - Week of ${now.toLocaleDateString()}`,
          htmlDigest
        );

        logger.info(`Weekly digest sent with ${posts.length} posts`);

      } catch (error) {
        logger.error('Weekly digest job failed:', error);
      }
    }, {
      timezone: config.brandConfig.timezone
    });

    this.jobs.set('weekly-digest', job);
    logger.info('Scheduled weekly digest job (Monday 9 AM)');
  }

  /**
   * Schedule publishing of approved posts (every 15 minutes)
   */
  private schedulePublishApproved(): void {
    const job = cron.schedule('*/15 * * * *', async () => {
      try {
        logger.info('Running publish approved job');

        // Get approved posts that are scheduled for publishing
        const approvedPosts = this.repository.listPostsByStatus('APPROVED', 10); // Limit to 10 at a time

        if (approvedPosts.length === 0) {
          return;
        }

        let publishedCount = 0;

        for (const post of approvedPosts) {
          try {
            // Check if it's time to publish
            const now = new Date();
            if (post.scheduledAt > now) {
              continue; // Not yet time to publish
            }

            // Check if we have a Buffer draft ID
            if (!post.bufferDraftId) {
              logger.warn(`Post ${post.id} has no Buffer draft ID, skipping`);
              continue;
            }

            // Publish to Buffer
            await this.bufferClient.scheduleDraft(post.bufferDraftId);

            // Update post status
            this.repository.updatePostStatus(post.id, 'PUBLISHED');

            publishedCount++;
            logger.info(`Published post ${post.id} to ${post.platform}`);

          } catch (error) {
            logger.error(`Failed to publish post ${post.id}:`, error);
            // Continue with other posts even if one fails
          }
        }

        if (publishedCount > 0) {
          logger.info(`Published ${publishedCount} posts`);
        }

      } catch (error) {
        logger.error('Publish approved job failed:', error);
      }
    }, {
      timezone: config.brandConfig.timezone
    });

    this.jobs.set('publish-approved', job);
    logger.info('Scheduled publish approved job (every 15 minutes)');
  }

  /**
   * Schedule weekly metrics harvest (every Sunday at 6 PM)
   */
  private scheduleWeeklyMetricsHarvest(): void {
    const job = cron.schedule('0 18 * * 0', async () => {
      try {
        logger.info('Running weekly metrics harvest job');

        // Harvest metrics for the past week
        const report = await this.metricsHarvester.harvestWeeklyMetrics();

        logger.info('Weekly metrics harvest completed', {
          totalPosts: report.totalPosts,
          avgEngagement: report.avgEngagementRate,
          topPlatform: report.platformBreakdown[0]?.platform || 'none'
        });

        // TODO: Optionally send metrics summary email
        // This could be integrated with the digest email

      } catch (error) {
        logger.error('Weekly metrics harvest job failed:', error);
      }
    }, {
      timezone: config.brandConfig.timezone
    });

    this.jobs.set('weekly-metrics', job);
    logger.info('Scheduled weekly metrics harvest job (Sunday 6 PM)');
  }

  /**
   * Manually trigger digest generation (for testing)
   */
  async triggerDigest(): Promise<void> {
    logger.info('Manually triggering digest generation');

    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);

    const posts = this.repository.getPostsForDigest(now, nextWeek);

    if (posts.length === 0) {
      logger.info('No posts scheduled for digest');
      return;
    }

    const htmlDigest = this.digestGenerator.generateDigest(posts, now, nextWeek);

    await mailer.sendDigest(
      config.config.OWNER_EMAIL,
      `Manual Social Media Digest - ${now.toLocaleDateString()}`,
      htmlDigest
    );

    logger.info(`Manual digest sent with ${posts.length} posts`);
  }

  /**
   * Manually trigger publishing of due posts (for testing)
   */
  async triggerPublish(): Promise<void> {
    logger.info('Manually triggering publish job');

    const approvedPosts = this.repository.listPostsByStatus('APPROVED', 10);
    let publishedCount = 0;

    for (const post of approvedPosts) {
      const now = new Date();
      if (post.scheduledAt > now) {
        continue;
      }

      if (!post.bufferDraftId) {
        logger.warn(`Post ${post.id} has no Buffer draft ID, skipping`);
        continue;
      }

      try {
        await this.bufferClient.scheduleDraft(post.bufferDraftId);
        this.repository.updatePostStatus(post.id, 'PUBLISHED');
        publishedCount++;
        logger.info(`Published post ${post.id} to ${post.platform}`);
      } catch (error) {
        logger.error(`Failed to publish post ${post.id}:`, error);
      }
    }

    logger.info(`Published ${publishedCount} posts`);
  }

  /**
   * Manually trigger metrics harvest (for testing)
   */
    async triggerMetricsHarvest(): Promise<any> {
    logger.info('Manually triggering metrics harvest');

    try {
      const report = await this.metricsHarvester.harvestWeeklyMetrics();
      
      logger.info('Manual metrics harvest completed', {
        totalPosts: report.totalPosts,
        avgEngagement: report.avgEngagementRate,
        insights: report.insights.length
      });

      return report;
    } catch (error) {
      logger.error('Manual metrics harvest failed:', error);
      throw error;
    }
  }

  /**
   * Get status of all jobs
   */
  getJobStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name] of this.jobs) {
      status[name] = true; // Jobs are scheduled if they exist
    }
    return status;
  }

  /**
   * Close resources
   */
  close(): void {
    this.stop();
    this.metricsHarvester.close();
  }
}
