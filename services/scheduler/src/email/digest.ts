import { z } from 'zod';
import * as path from 'path';
import { readFileSync } from 'fs';
import { config } from '../config.js';
import { Post } from '../repository.js';

// HTML template for the digest email
const DIGEST_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Social Media Content Digest</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #007bff;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #007bff;
            margin: 0;
            font-size: 28px;
        }
        .header p {
            color: #666;
            margin: 10px 0 0 0;
        }
        .post {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            margin: 20px 0;
            overflow: hidden;
        }
        .post-header {
            background: #f8f9fa;
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
        }
        .platform {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .instagram { background: #E4405F; color: white; }
        .tiktok { background: #000000; color: white; }
        .youtube_shorts { background: #FF0000; color: white; }
        .linkedin { background: #0077B5; color: white; }
        .facebook { background: #1877F2; color: white; }
        .scheduled-time {
            float: right;
            color: #666;
            font-size: 14px;
        }
        .post-content {
            padding: 20px;
        }
        .caption {
            margin-bottom: 15px;
            font-size: 16px;
            line-height: 1.5;
        }
        .hashtags {
            color: #007bff;
            font-weight: 500;
            margin-bottom: 10px;
        }
        .thumbnail {
            width: 100%;
            max-width: 300px;
            height: auto;
            border-radius: 4px;
            margin: 10px 0;
        }
        .actions {
            padding: 15px 20px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
            text-align: center;
        }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            margin: 0 10px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 14px;
        }
        .btn-approve {
            background: #28a745;
            color: white;
        }
        .btn-reject {
            background: #dc3545;
            color: white;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #666;
            font-size: 14px;
        }
        .stats {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .stats h3 {
            margin-top: 0;
            color: #495057;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{brandName}} Content Digest</h1>
            <p>Review and approve your upcoming social media posts</p>
        </div>

        {{#stats}}
        <div class="stats">
            <h3>📊 This Week's Schedule</h3>
            <p><strong>{{totalPosts}}</strong> posts scheduled across <strong>{{platforms}}</strong> platforms</p>
            <p>Week of: {{weekStart}} - {{weekEnd}}</p>
        </div>
        {{/stats}}

        {{#posts}}
        <div class="post">
            <div class="post-header">
                <span class="platform {{platform}}">{{platformDisplay}}</span>
                <span class="scheduled-time">📅 {{scheduledTime}}</span>
            </div>
            <div class="post-content">
                {{#thumbnail}}
                <img src="{{thumbnail}}" alt="Post thumbnail" class="thumbnail">
                {{/thumbnail}}
                <div class="caption">{{caption}}</div>
                <div class="hashtags">{{hashtags}}</div>
            </div>
            <div class="actions">
                <a href="{{approveUrl}}" class="btn btn-approve">✅ Approve</a>
                <a href="{{rejectUrl}}" class="btn btn-reject">❌ Reject</a>
            </div>
        </div>
        {{/posts}}

        <div class="footer">
            <p>This digest was generated automatically by your social media scheduler.</p>
            <p>If you have any questions, please contact your marketing team.</p>
        </div>
    </div>
</body>
</html>
`;

export class DigestGenerator {
  /**
   * Generate HTML digest for a list of posts
   */
  generateDigest(posts: Post[], weekStart: Date, weekEnd: Date): string {
    const brandName = config.brandConfig.name;

    // Group posts by platform for stats
    const platformStats = posts.reduce((acc, post) => {
      acc[post.platform] = (acc[post.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stats = {
      totalPosts: posts.length,
      platforms: Object.keys(platformStats).length,
      weekStart: weekStart.toLocaleDateString(),
      weekEnd: weekEnd.toLocaleDateString()
    };

    // Format posts for template
    const formattedPosts = posts.map(post => ({
      platform: post.platform,
      platformDisplay: this.formatPlatformName(post.platform),
      scheduledTime: post.scheduledAt.toLocaleString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      caption: this.escapeHtml(post.caption),
      hashtags: post.hashtags.join(' '),
      thumbnail: post.thumbnailUrl,
      approveUrl: config.getWebhookUrl(post.id, 'approve'),
      rejectUrl: config.getWebhookUrl(post.id, 'reject')
    }));

    // Simple template rendering - replace all variables
    let html = DIGEST_TEMPLATE;

    // Replace simple variables
    html = html.replace(/\{\{brandName\}\}/g, brandName);
    html = html.replace(/\{\{totalPosts\}\}/g, stats.totalPosts.toString());
    html = html.replace(/\{\{platforms\}\}/g, stats.platforms.toString());
    html = html.replace(/\{\{weekStart\}\}/g, stats.weekStart);
    html = html.replace(/\{\{weekEnd\}\}/g, stats.weekEnd);

    // Replace conditional sections
    html = html.replace(/\{\{#stats\}\}([\s\S]*?)\{\{\/stats\}\}/g, '$1');

    // Generate posts HTML
    const postsHtml = formattedPosts.map(post => `
        <div class="post">
            <div class="post-header">
                <span class="platform ${post.platform}">${post.platformDisplay}</span>
                <span class="scheduled-time">📅 ${post.scheduledTime}</span>
            </div>
            <div class="post-content">
                ${post.thumbnail ? `<img src="${post.thumbnail}" alt="Post thumbnail" class="thumbnail">` : ''}
                <div class="caption">${post.caption}</div>
                <div class="hashtags">${post.hashtags}</div>
            </div>
            <div class="actions">
                <a href="${post.approveUrl}" class="btn btn-approve">✅ Approve</a>
                <a href="${post.rejectUrl}" class="btn btn-reject">❌ Reject</a>
            </div>
        </div>
    `).join('');

    html = html.replace(/\{\{#posts\}\}([\s\S]*?)\{\{\/posts\}\}/g, postsHtml);

    return html;
  }

  /**
   * Generate plain text version of the digest
   */
  generateTextDigest(posts: Post[], weekStart: Date, weekEnd: Date): string {
    const brandName = config.brandConfig.name;

    let text = `${brandName} Content Digest\n`;
    text += `Week of: ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}\n\n`;

    posts.forEach((post, index) => {
      text += `${index + 1}. ${this.formatPlatformName(post.platform)}\n`;
      text += `   Scheduled: ${post.scheduledAt.toLocaleString('en-GB')}\n`;
      text += `   Caption: ${post.caption}\n`;
      text += `   Hashtags: ${post.hashtags.join(' ')}\n`;
      text += `   Approve: ${config.getWebhookUrl(post.id, 'approve')}\n`;
      text += `   Reject: ${config.getWebhookUrl(post.id, 'reject')}\n\n`;
    });

    return text;
  }

  /**
   * Format platform name for display
   */
  private formatPlatformName(platform: string): string {
    const names = {
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube_shorts: 'YouTube Shorts',
      linkedin: 'LinkedIn',
      facebook: 'Facebook'
    };
    return names[platform as keyof typeof names] || platform;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };

    return text.replace(/[&<>"'/]/g, (match) => htmlEscapes[match]);
  }

  /**
   * Generate digest subject line
   */
  getSubjectLine(postCount: number, weekStart: Date): string {
    const brandName = config.brandConfig.name;
    const weekStr = weekStart.toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric'
    });

    return `${brandName} Content Digest: ${postCount} posts for week of ${weekStr}`;
  }
}