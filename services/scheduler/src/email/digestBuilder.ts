import type { BrandConfig } from '../config.js';
import type { Post } from '../repository.js';
import type { WeeklyMetricsReport } from '../metrics/harvester.js';
import { config } from '../config.js';

export interface DigestContext {
  weekStart: Date;
  weekEnd: Date;
}

export class DigestBuilder {
  constructor(private readonly brand: BrandConfig) {}

  buildHtml(posts: Post[], context: DigestContext): string {
    const timezone = this.brand.timezone ?? config.config.TIMEZONE;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const statsSection = this.renderStats(posts, context, dateFormatter);
    const postsHtml = posts
      .map((post) => this.renderPost(post, formatter))
      .join('');

    const brandName = this.brand.name ?? 'VitrineAlu';

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<title>' + this.escapeHtml(brandName) + ' Digest</title>',
      '<style>' + this.styles() + '</style>',
      '</head>',
      '<body>',
      '<div class="container">',
      '<header class="header">',
      '<h1>' + this.escapeHtml(brandName) + ' Weekly Digest</h1>',
      '<p>Review and approve the upcoming posts</p>',
      '</header>',
      statsSection,
      postsHtml,
      '<footer class="footer">',
      '<p>Sent from the VitrineAlu scheduler</p>',
      '</footer>',
      '</div>',
      '</body>',
      '</html>',
    ].join('');
  }

  buildHtmlWithMetrics(posts: Post[], context: DigestContext, metrics?: WeeklyMetricsReport): string {
    const timezone = this.brand.timezone ?? config.config.TIMEZONE;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const statsSection = this.renderStats(posts, context, dateFormatter);
    const metricsSection = metrics ? this.renderMetrics(metrics) : '';
    const postsHtml = posts
      .map((post) => this.renderPost(post, formatter))
      .join('');

    const brandName = this.brand.name ?? 'VitrineAlu';

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<title>' + this.escapeHtml(brandName) + ' Digest</title>',
      '<style>' + this.styles() + '</style>',
      '</head>',
      '<body>',
      '<div class="container">',
      '<header class="header">',
      '<h1>' + this.escapeHtml(brandName) + ' Weekly Digest</h1>',
      '<p>Review and approve the upcoming posts</p>',
      '</header>',
      statsSection,
      metricsSection,
      postsHtml,
      '<footer class="footer">',
      '<p>Sent from the VitrineAlu scheduler</p>',
      '</footer>',
      '</div>',
      '</body>',
      '</html>',
    ].join('');
  }

  buildText(posts: Post[], context: DigestContext): string {
    const timezone = this.brand.timezone ?? config.config.TIMEZONE;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    const lines: string[] = [];
    const brandName = this.brand.name ?? 'VitrineAlu';
    lines.push(brandName + ' Weekly Digest');
    lines.push('Week of ' + context.weekStart.toDateString() + ' - ' + context.weekEnd.toDateString());
    lines.push('');
    posts.forEach((post, index) => {
      lines.push(String(index + 1) + '. ' + this.platformLabel(post.platform));
      lines.push('   Scheduled: ' + formatter.format(post.scheduledAt));
      lines.push('   Caption: ' + post.caption);
      if (post.hashtags.length) {
        lines.push('   Hashtags: ' + post.hashtags.join(' '));
      }
      lines.push('   Approve: ' + config.getApprovalLink(post.id, 'approve', post.assetId ?? undefined));
      lines.push('   Reject: ' + config.getApprovalLink(post.id, 'reject', post.assetId ?? undefined));
      lines.push('');
    });
    return lines.join('\n');
  }

  private renderStats(posts: Post[], context: DigestContext, formatter: Intl.DateTimeFormat): string {
    const weekStart = formatter.format(context.weekStart);
    const weekEnd = formatter.format(context.weekEnd);
    const platformCount = new Set(posts.map((post) => post.platform)).size;
    return [
      '<section class="stats">',
      '<h2>Schedule Overview</h2>',
      '<p><strong>' + posts.length + '</strong> posts across <strong>' + platformCount + '</strong> platforms.</p>',
      '<p>Week: ' + this.escapeHtml(weekStart) + ' - ' + this.escapeHtml(weekEnd) + '</p>',
      '</section>',
    ].join('');
  }

  private renderMetrics(metrics: WeeklyMetricsReport): string {
      const totalPosts = metrics.totalPosts;
      const totalViews = metrics.totalViews;
      const totalLikes = metrics.totalLikes;
      const avgEngagement = metrics.avgEngagementRate;
      const topPlatform = metrics.platformBreakdown[0];

    return [
      '<section class="metrics">',
        '<h2>📊 Last Week Performance</h2>',
        '<div class="metrics-grid">',
        '<div class="metric">',
        '<div class="metric-value">' + totalPosts + '</div>',
        '<div class="metric-label">Posts Published</div>',
        '</div>',
        '<div class="metric">',
        '<div class="metric-value">' + totalViews.toLocaleString() + '</div>',
        '<div class="metric-label">Total Views</div>',
        '</div>',
        '<div class="metric">',
        '<div class="metric-value">' + totalLikes.toLocaleString() + '</div>',
        '<div class="metric-label">Total Likes</div>',
        '</div>',
        '<div class="metric">',
        '<div class="metric-value">' + avgEngagement.toFixed(1) + '%</div>',
        '<div class="metric-label">Avg Engagement</div>',
        '</div>',
        '</div>',
        topPlatform ? '<p class="top-platform">🏆 Best performing platform: <strong>' + topPlatform.platform.toUpperCase() + '</strong> (' + topPlatform.avgEngagement.toFixed(1) + '% engagement)</p>' : '',
        metrics.insights.length > 0 ? '<div class="insights"><h3>💡 Key Insights</h3><ul>' + metrics.insights.slice(0, 3).map(insight => '<li>' + this.escapeHtml(insight) + '</li>').join('') + '</ul></div>' : '',
      '</section>',
    ].join('');
  }

  private renderPost(post: Post, formatter: Intl.DateTimeFormat): string {
    const approveUrl = config.getApprovalLink(post.id, 'approve', post.assetId ?? undefined);
    const rejectUrl = config.getApprovalLink(post.id, 'reject', post.assetId ?? undefined);
    const caption = this.escapeHtml(post.caption);
    const hashtags = this.escapeHtml(post.hashtags.join(' '));
    const scheduled = formatter.format(post.scheduledAt);
    const thumb = post.thumbnailUrl
      ? '<img src="' + this.escapeHtml(post.thumbnailUrl) + '" alt="thumbnail" class="thumbnail">'
      : '';

    return [
      '<article class="post">',
      '<div class="post-header">',
      '<span class="platform ' + this.escapeHtml(post.platform) + '">' + this.platformLabel(post.platform) + '</span>',
      '<span class="scheduled">' + this.escapeHtml(scheduled) + '</span>',
      '</div>',
      '<div class="post-body">',
      thumb,
      '<p class="caption">' + caption + '</p>',
      hashtags ? '<p class="hashtags">' + hashtags + '</p>' : '',
      '</div>',
      '<div class="post-actions">',
      '<a class="btn approve" href="' + this.escapeHtml(approveUrl) + '">Approve</a>',
      '<a class="btn reject" href="' + this.escapeHtml(rejectUrl) + '">Reject</a>',
      '</div>',
      '</article>',
    ].join('');
  }

  private platformLabel(platform: string): string {
    const names: Record<string, string> = {
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube_short: 'YouTube Shorts',
      youtube_shorts: 'YouTube Shorts',
      facebook: 'Facebook',
      linkedin: 'LinkedIn',
    };
    return names[platform] ?? platform;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"'\/]/g, (match) => {
      const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
      };
      return map[match];
    });
  }

  private styles(): string {
    return [
      'body{font-family:Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px;}',
      '.container{max-width:760px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;box-shadow:0 6px 24px rgba(15,23,42,0.1);}',
      '.header{text-align:center;margin-bottom:24px;}',
      '.header h1{margin:0;font-size:28px;color:#111827;}',
      '.header p{color:#6b7280;margin-top:8px;}',
      '.stats{background:#f8fafc;padding:16px;border-radius:10px;margin-bottom:24px;color:#1f2937;}',
    '.metrics{background:#f0f9ff;padding:20px;border-radius:10px;margin-bottom:24px;border-left:4px solid #0ea5e9;}',
    '.metrics h2{margin:0 0 16px 0;color:#0f172a;font-size:20px;}',
    '.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-bottom:16px;}',
    '.metric{text-align:center;background:#fff;padding:12px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}',
    '.metric-value{font-size:24px;font-weight:700;color:#0ea5e9;margin-bottom:4px;}',
    '.metric-label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;}',
    '.top-platform{margin:12px 0 0 0;color:#1f2937;font-size:14px;}',
    '.insights{margin-top:16px;}',
    '.insights h3{margin:0 0 8px 0;color:#1f2937;font-size:16px;}',
    '.insights ul{margin:0;padding-left:20px;color:#374151;}',
    '.insights li{margin-bottom:4px;font-size:14px;}',
      '.post{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;overflow:hidden;}',
      '.post-header{display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;padding:16px;}',
      '.platform{font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:0.08em;color:#2563eb;}',
      '.scheduled{color:#475569;font-size:14px;}',
      '.post-body{padding:16px;}',
      '.thumbnail{max-width:100%;border-radius:8px;margin-bottom:12px;}',
      '.caption{font-size:16px;line-height:1.6;color:#1f2937;}',
      '.hashtags{color:#2563eb;font-weight:500;}',
      '.post-actions{display:flex;gap:12px;justify-content:center;padding:16px;background:#f8fafc;}',
      '.btn{padding:10px 18px;text-decoration:none;border-radius:9999px;font-weight:600;letter-spacing:0.05em;}',
      '.btn.approve{background:#16a34a;color:#fff;}',
      '.btn.reject{background:#dc2626;color:#fff;}',
      '.footer{text-align:center;color:#94a3b8;margin-top:24px;font-size:14px;}',
    ].join('');
  }
}
