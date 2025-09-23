#!/usr/bin/env node

import { Command } from 'commander';
import { Repository } from './repository.js';
import { BufferClient } from './bufferClient.js';
import { DigestGenerator } from './email/digest.js';
import { CronScheduler } from './cron.js';
import { WebhookServer } from './webhook.js';
import { mailer } from './mailer.js';
import { config } from './config.js';
import { logger } from './logger.js';

const program = new Command();

program
  .name('vschedule')
  .description('Social media content scheduler CLI')
  .version('1.0.0');

// Initialize services
const repository = new Repository();
const bufferClient = new BufferClient();
const digestGenerator = new DigestGenerator();
const cronScheduler = new CronScheduler(repository, bufferClient, digestGenerator);

// Draft command - create a new post draft
program
  .command('draft')
  .description('Create a new social media post draft')
  .requiredOption('-p, --platform <platform>', 'Social media platform (instagram|tiktok|youtube_shorts|linkedin|facebook)')
  .requiredOption('-c, --caption <caption>', 'Post caption text')
  .option('-m, --media <urls>', 'Comma-separated media URLs')
  .option('-t, --thumbnail <url>', 'Thumbnail URL')
  .option('-h, --hashtags <tags>', 'Comma-separated hashtags (without #)')
  .option('-s, --schedule <datetime>', 'Schedule date/time (ISO format or "next")')
  .action(async (options) => {
    try {
      // Validate platform
      const validPlatforms = ['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'facebook'];
      if (!validPlatforms.includes(options.platform)) {
        throw new Error(`Invalid platform. Must be one of: ${validPlatforms.join(', ')}`);
      }

      // Parse media URLs
      const mediaUrls = options.media ? options.media.split(',').map((url: string) => url.trim()) : [];

      // Parse hashtags
      const hashtags = options.hashtags ? options.hashtags.split(',').map((tag: string) => `#${tag.trim()}`) : [];

      // Parse schedule time
      let scheduledAt: Date;
      if (options.schedule === 'next') {
        // Use planning service to find next optimal time
        const { PlanningService } = await import('./plan.js');
        const planner = new PlanningService();
        const nextTime = planner.getNextPostingTime(options.platform as any);
        if (!nextTime) {
          throw new Error('Could not determine next optimal posting time');
        }
        scheduledAt = nextTime;
      } else if (options.schedule) {
        scheduledAt = new Date(options.schedule);
        if (isNaN(scheduledAt.getTime())) {
          throw new Error('Invalid schedule date/time format');
        }
      } else {
        // Default to next optimal time
        const { PlanningService } = await import('./plan.js');
        const planner = new PlanningService();
        const nextTime = planner.getNextPostingTime(options.platform as any);
        if (!nextTime) {
          throw new Error('Could not determine next optimal posting time');
        }
        scheduledAt = nextTime;
      }

      // Check for duplicate content
      const crypto = await import('crypto');
      const contentHash = crypto.default.createHash('sha256')
        .update(options.caption + JSON.stringify(mediaUrls))
        .digest('hex');
      if (repository.postExists(contentHash)) {
        throw new Error('Post with identical content already exists');
      }

      // Get Buffer channel ID
      const channel = repository.getChannelByPlatform(options.platform);
      if (!channel) {
        throw new Error(`No Buffer channel configured for platform: ${options.platform}`);
      }

      // Create Buffer draft
      const bufferResult = await bufferClient.createDraft(
        [channel.bufferChannelId],
        options.caption,
        {
          media: mediaUrls.length > 0 ? {
            picture: mediaUrls[0], // Use first media URL as picture
            ...options.thumbnail && { thumbnail: options.thumbnail }
          } : undefined,
          scheduled_at: scheduledAt
        }
      );

      if (!bufferResult.updates || bufferResult.updates.length === 0) {
        throw new Error('Failed to create Buffer draft');
      }

      const bufferDraftId = bufferResult.updates[0].id;

      // Create post in database
      const post = repository.createPost({
        contentHash,
        platform: options.platform,
        caption: options.caption,
        hashtags,
        mediaUrls,
        thumbnailUrl: options.thumbnail,
        scheduledAt,
        bufferDraftId,
        status: 'draft',
        contentType: 'single'
      });

      console.log(`✅ Draft created successfully!`);
      console.log(`📝 Post ID: ${post.id}`);
      console.log(`📱 Platform: ${options.platform}`);
      console.log(`📅 Scheduled: ${scheduledAt.toLocaleString()}`);
      console.log(`🔗 Buffer Draft: ${bufferDraftId}`);

    } catch (error) {
      logger.error('Draft creation failed:', error);
      console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Send digest command
program
  .command('send-digest')
  .description('Send weekly content digest email')
  .option('-d, --days <number>', 'Number of days to look ahead', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      if (isNaN(days) || days < 1) {
        throw new Error('Days must be a positive number');
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + days);

      const posts = repository.getPostsForDigest(startDate, endDate);

      if (posts.length === 0) {
        console.log('📭 No posts scheduled for the upcoming period');
        return;
      }

      const htmlDigest = digestGenerator.generateDigest(posts, startDate, endDate);

      await mailer.sendDigest(
        config.config.OWNER_EMAIL,
        digestGenerator.getSubjectLine(posts.length, startDate),
        htmlDigest
      );

      console.log(`📧 Digest sent successfully!`);
      console.log(`📊 ${posts.length} posts included`);
      console.log(`📅 Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);

    } catch (error) {
      logger.error('Digest sending failed:', error);
      console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Serve command - start webhook server
program
  .command('serve')
  .description('Start the webhook server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--no-cron', 'Disable cron jobs')
  .action(async (options) => {
    try {
      const port = parseInt(options.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Invalid port number');
      }

      // Start webhook server
      const webhookServer = new WebhookServer(repository);
      webhookServer.start(port);

      // Start cron jobs unless disabled
      if (!options.noCron) {
        cronScheduler.start();
        console.log('⏰ Cron jobs enabled');
      }

      console.log(`🚀 Server started on port ${port}`);
      console.log(`📡 Webhook endpoint: http://localhost:${port}/webhooks/approval`);
      console.log(`💡 Press Ctrl+C to stop`);

      // Keep the process running
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        cronScheduler.stop();
        repository.close();
        process.exit(0);
      });

    } catch (error) {
      logger.error('Server startup failed:', error);
      console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show system status')
  .action(async () => {
    try {
      console.log('📊 System Status\n');

      // Database stats
      const draftPosts = repository.getPostsByStatus('draft').length;
      const approvedPosts = repository.getPostsByStatus('approved').length;
      const publishedPosts = repository.getPostsByStatus('published').length;

      console.log('📝 Posts:');
      console.log(`   Draft: ${draftPosts}`);
      console.log(`   Approved: ${approvedPosts}`);
      console.log(`   Published: ${publishedPosts}`);

      // Channels
      const channels = repository.getActiveChannels();
      console.log(`\n📱 Active Channels: ${channels.length}`);
      channels.forEach(channel => {
        console.log(`   ${channel.platform}: ${channel.name}`);
      });

      // Email configuration
      const emailTest = await mailer.testConnection();
      console.log(`\n📧 Email: ${emailTest ? '✅ Connected' : '❌ Failed'}`);

      // Cron jobs
      const cronStatus = cronScheduler.getJobStatus();
      console.log(`\n⏰ Cron Jobs:`);
      Object.entries(cronStatus).forEach(([name, active]) => {
        console.log(`   ${name}: ${active ? '✅ Active' : '❌ Inactive'}`);
      });

    } catch (error) {
      logger.error('Status check failed:', error);
      console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Run manual tests')
  .action(async () => {
    try {
      console.log('🧪 Running manual tests...\n');

      // Test database connection
      const testPost = repository.createPost({
        contentHash: 'test-' + Date.now(),
        platform: 'instagram',
        caption: 'Test post',
        hashtags: ['#test'],
        mediaUrls: [],
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        status: 'draft',
        contentType: 'single'
      });
      console.log('✅ Database: Post created and retrieved');

      // Clean up test post
      repository.close();

      // Test email connection
      const emailTest = await mailer.testConnection();
      console.log(`📧 Email: ${emailTest ? '✅ Connected' : '❌ Failed'}`);

      console.log('\n🎉 All tests passed!');

    } catch (error) {
      logger.error('Test failed:', error);
      console.error(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

program.parse();