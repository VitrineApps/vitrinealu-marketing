import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { logger } from '@vitrinealu/shared/logger';

// Schema definitions
const MetricsCollectionRequest = z.object({
  posts: z.array(z.object({
    id: z.string(),
    platform: z.string(),
    bufferId: z.string().optional(),
    externalId: z.string().optional()
  }))
});

const MetricsAnalysisRequest = z.object({
  metrics: z.array(z.object({
    postId: z.string(),
    platform: z.string(),
    views: z.number().optional(),
    likes: z.number().optional(),
    comments: z.number().optional(),
    shares: z.number().optional(),
    saves: z.number().optional(),
    clicks: z.number().optional(),
    ctr: z.number().optional()
  }))
});

// Mock platform API clients for demonstration
interface PlatformMetrics {
  clicks?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}

class BufferMetricsClient {
  async getPostMetrics(bufferId: string): Promise<PlatformMetrics> {
    // Mock implementation - would call Buffer API
    return {
      clicks: Math.floor(Math.random() * 100),
      views: Math.floor(Math.random() * 1000),
      shares: Math.floor(Math.random() * 20),
      comments: Math.floor(Math.random() * 15)
    };
  }
}

class InstagramMetricsClient {
  async getPostMetrics(postId: string): Promise<PlatformMetrics> {
    // Mock implementation - would call Instagram Basic Display API
    return {
      likes: Math.floor(Math.random() * 200),
      comments: Math.floor(Math.random() * 30),
      saves: Math.floor(Math.random() * 50),
      views: Math.floor(Math.random() * 2000)
    };
  }
}

// Performance analysis functions
function calculateCTR(clicks: number, views: number): number {
  return views > 0 ? (clicks / views) * 100 : 0;
}

function categorizePerformance(metric: number, platform: string, metricType: string): string {
  // Simple performance categorization - would be more sophisticated in practice
  const thresholds = {
    instagram: { views: { good: 1000, excellent: 5000 }, likes: { good: 50, excellent: 200 } },
    tiktok: { views: { good: 2000, excellent: 10000 }, likes: { good: 100, excellent: 500 } },
    linkedin: { views: { good: 500, excellent: 2000 }, likes: { good: 20, excellent: 100 } }
  };

  const platformThresholds = thresholds[platform as keyof typeof thresholds];
  if (!platformThresholds || !platformThresholds[metricType as keyof typeof platformThresholds]) {
    return 'average';
  }

  const threshold = platformThresholds[metricType as keyof typeof platformThresholds];
  if (metric >= threshold.excellent) return 'excellent';
  if (metric >= threshold.good) return 'good';
  return 'needs-improvement';
}

function generateInsights(metrics: any[]): string[] {
  const insights = [];
  
  // Platform performance comparison
  const platformStats = metrics.reduce((acc, metric) => {
    if (!acc[metric.platform]) acc[metric.platform] = { views: 0, engagement: 0, count: 0 };
    acc[metric.platform].views += metric.views || 0;
    acc[metric.platform].engagement += (metric.likes || 0) + (metric.comments || 0) + (metric.shares || 0);
    acc[metric.platform].count += 1;
    return acc;
  }, {});

  const bestPlatform = Object.entries(platformStats)
    .map(([platform, stats]: [string, any]) => ({
      platform,
      avgViews: stats.views / stats.count,
      avgEngagement: stats.engagement / stats.count
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)[0];

  if (bestPlatform) {
    insights.push(`${bestPlatform.platform} is your top performing platform with average ${Math.round(bestPlatform.avgEngagement)} engagements per post`);
  }

  // CTR insights
  const avgCTR = metrics.reduce((sum, m) => sum + (m.ctr || 0), 0) / metrics.length;
  if (avgCTR > 2) {
    insights.push('Excellent click-through rates indicate strong caption and visual appeal');
  } else if (avgCTR < 1) {
    insights.push('Consider optimizing captions and calls-to-action to improve click-through rates');
  }

  return insights;
}

function generateMetricsReportHTML(analysis: any): string {
  const { summary, topPosts, insights, weekEnd } = analysis;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>VitrineAlu Weekly Performance Report</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { background-color: #0C2436; color: white; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
        .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #1274B7; }
        .metric-value { font-size: 2em; font-weight: bold; color: #1274B7; }
        .metric-label { color: #666; text-transform: uppercase; font-size: 0.9em; }
        .top-post { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .insight { background: #e8f4f8; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #1274B7; }
        .performance-good { color: #28a745; }
        .performance-excellent { color: #007bff; font-weight: bold; }
        .performance-needs-improvement { color: #dc3545; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Weekly Performance Report</h1>
        <p>VitrineAlu Social Media Analytics</p>
        <p>Week ending ${new Date(weekEnd).toLocaleDateString()}</p>
      </div>

      <h2>📈 Summary Metrics</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
        <div class="metric-card">
          <div class="metric-value">${summary.totalViews.toLocaleString()}</div>
          <div class="metric-label">Total Views</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${summary.totalEngagement.toLocaleString()}</div>
          <div class="metric-label">Total Engagement</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${summary.avgCTR.toFixed(1)}%</div>
          <div class="metric-label">Avg CTR</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${summary.postsPublished}</div>
          <div class="metric-label">Posts Published</div>
        </div>
      </div>

      <h2>🏆 Top Performing Posts</h2>
      ${topPosts.map((post: any) => `
        <div class="top-post">
          <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 10px;">
            <h3>${post.platform.toUpperCase()}</h3>
            <span class="performance-${post.performance}">${post.performance.replace('-', ' ')}</span>
          </div>
          <p><strong>Caption:</strong> ${post.caption.substring(0, 100)}...</p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-top: 15px;">
            <div><strong>${post.views || 0}</strong><br><small>Views</small></div>
            <div><strong>${post.likes || 0}</strong><br><small>Likes</small></div>
            <div><strong>${post.comments || 0}</strong><br><small>Comments</small></div>
            <div><strong>${post.shares || 0}</strong><br><small>Shares</small></div>
          </div>
        </div>
      `).join('')}

      <h2>💡 Insights & Recommendations</h2>
      ${insights.map((insight: string) => `
        <div class="insight">
          ${insight}
        </div>
      `).join('')}

      <div style="margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
        <p><strong>VitrineAlu Marketing Automation</strong></p>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
      </div>
    </body>
    </html>
  `;
}

export const registerMetricsRoutes = async (app: FastifyInstance) => {
  const bufferClient = new BufferMetricsClient();
  const instagramClient = new InstagramMetricsClient();

  // Get published posts for metrics collection
  app.get('/metrics/published-posts', async (request, reply) => {
    try {
      const { days = 7 } = request.query as { days?: number };
      
      // In a real implementation, this would query the database for published posts
      // For now, return mock data
      const posts = [
        {
          id: 'post-1',
          platform: 'instagram',
          bufferId: 'buffer-123',
          externalId: 'ig-456',
          publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          caption: 'Beautiful aluminum installation bringing natural light into modern living spaces ✨'
        },
        {
          id: 'post-2', 
          platform: 'linkedin',
          bufferId: 'buffer-124',
          externalId: 'li-789',
          publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          caption: 'Transform your office space with premium aluminum glazing solutions'
        }
      ];

      return reply.send({ posts });
    } catch (error) {
      logger.error({ err: error }, 'Failed to get published posts');
      return reply.status(500).send({ error: 'Failed to get published posts' });
    }
  });

  // Collect metrics from platforms
  app.post('/metrics/collect', async (request, reply) => {
    try {
      const { posts } = MetricsCollectionRequest.parse(request.body);
      
      const metrics = [];
      
      for (const post of posts) {
        let platformMetrics: PlatformMetrics = {};
        
        // Collect metrics based on platform
        if (post.platform.includes('instagram') && post.externalId) {
          platformMetrics = await instagramClient.getPostMetrics(post.externalId);
        } else if (post.bufferId) {
          platformMetrics = await bufferClient.getPostMetrics(post.bufferId);
        }

        const metric = {
          postId: post.id,
          platform: post.platform,
          ...platformMetrics,
          ctr: calculateCTR(platformMetrics.clicks || 0, platformMetrics.views || 0),
          collectedAt: new Date().toISOString()
        };

        metrics.push(metric);
        
        // In a real implementation, save to database here
        logger.info({ postId: post.id, platform: post.platform }, 'Metrics collected for post');
      }

      return reply.send({ metrics, collected: metrics.length });
    } catch (error) {
      logger.error({ err: error }, 'Failed to collect metrics');
      return reply.status(500).send({ error: 'Failed to collect metrics' });
    }
  });

  // Analyze performance metrics
  app.post('/metrics/analyze', async (request, reply) => {
    try {
      const { metrics } = MetricsAnalysisRequest.parse(request.body);
      
      // Calculate summary statistics
      const summary = {
        totalViews: metrics.reduce((sum, m) => sum + (m.views || 0), 0),
        totalEngagement: metrics.reduce((sum, m) => sum + (m.likes || 0) + (m.comments || 0) + (m.shares || 0), 0),
        avgCTR: metrics.reduce((sum, m) => sum + (m.ctr || 0), 0) / metrics.length,
        postsPublished: metrics.length
      };

      // Identify top performing posts
      const topPosts = metrics
        .map(metric => ({
          ...metric,
          engagementScore: (metric.likes || 0) + (metric.comments || 0) * 2 + (metric.shares || 0) * 3,
          performance: categorizePerformance(metric.views || 0, metric.platform, 'views')
        }))
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, 3);

      // Generate insights
      const insights = generateInsights(metrics);

      const analysis = {
        summary,
        topPosts,
        insights,
        generatedAt: new Date().toISOString()
      };

      return reply.send({ analysis });
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze metrics');
      return reply.status(500).send({ error: 'Failed to analyze metrics' });
    }
  });

  // Generate HTML report
  app.post('/metrics/report', async (request, reply) => {
    try {
      const { analysis, weekEnd } = request.body as { analysis: any; weekEnd: string };
      
      const html = generateMetricsReportHTML({ ...analysis, weekEnd });
      const reportId = crypto.randomUUID();
      
      return reply.send({ 
        html, 
        reportId,
        weekEnd,
        summary: analysis.summary
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate report');
      return reply.status(500).send({ error: 'Failed to generate report' });
    }
  });

  // Log report activity
  app.post('/metrics/log-report', async (request, reply) => {
    try {
      const logData = request.body as any;
      
      // In a real implementation, this would save to database
      logger.info({ logData }, 'Metrics report activity logged');
      
      return reply.send({ logged: true });
    } catch (error) {
      logger.error({ err: error }, 'Failed to log report activity');
      return reply.status(500).send({ error: 'Failed to log report activity' });
    }
  });
};