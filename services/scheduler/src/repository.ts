import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'path';

export type PostStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'draft' | 'approved' | 'rejected' | 'published' | 'pending_approval';

export interface Post {
  id: string;
  assetId?: string | null;
  contentHash?: string | null;
  contentType?: 'carousel' | 'single' | null;
  platform: string;
  status: PostStatus;
  bufferDraftId?: string | null;
  buffer_draft_ids?: any; // JSONB field for new format
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  thumbnailUrl?: string | null;
  scheduledAt: Date;
  approved_at?: Date | null;
  approved_by?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalRecord {
  id: string;
  postId: string;
  action: 'approve' | 'reject';
  actor?: string | null;
  comment?: string | null;
  createdAt: Date;
}

export interface CarouselUsageRecord {
  carouselId: string;
  theme: string;
  platform: string;
  lastUsed: Date;
  usageCount: number;
}

type NewPost = {
  id: string;
  assetId?: string | null;
  contentHash?: string | null;
  contentType?: 'carousel' | 'single' | null;
  platform: string;
  status: PostStatus;
  bufferDraftId?: string | null;
  caption: string;
  hashtags: string[];
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  scheduledAt: Date;
};

type CreatePostInput = {
  contentHash: string;
  platform: string;
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  thumbnailUrl?: string | null;
  scheduledAt: Date;
  status: PostStatus;
  contentType?: 'carousel' | 'single' | null;
  assetId?: string | null;
  bufferDraftId?: string | null;
};

export class Repository {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const resolved = this.resolveDbPath(dbPath);
    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  close(): void {
    this.db.close();
  }

  insertPost(post: NewPost): Post {
    if (post.assetId) {
      this.ensureAsset(post.assetId);
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO posts (id, asset_id, content_hash, content_type, platform, status, buffer_draft_id, caption, hashtags, media_urls, thumbnail_url, scheduled_at, created_at, updated_at) ' +
          'VALUES (@id, @assetId, @contentHash, @contentType, @platform, @status, @bufferDraftId, @caption, @hashtags, @mediaUrls, @thumbnailUrl, @scheduledAt, @createdAt, @updatedAt)'
      )
      .run({
        id: post.id,
        assetId: post.assetId ?? null,
        contentHash: post.contentHash ?? null,
        contentType: post.contentType ?? null,
        platform: post.platform,
        status: post.status,
        bufferDraftId: post.bufferDraftId ?? null,
        caption: post.caption,
        hashtags: JSON.stringify(post.hashtags ?? []),
        mediaUrls: JSON.stringify(post.mediaUrls ?? []),
        thumbnailUrl: post.thumbnailUrl ?? null,
        scheduledAt: post.scheduledAt.toISOString(),
        createdAt: now,
        updatedAt: now,
      });

    return {
      ...post,
      mediaUrls: post.mediaUrls ?? [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  createPost(input: CreatePostInput): Post {
    const id = randomUUID();
    return this.insertPost({
      id,
      assetId: input.assetId ?? null,
      contentHash: input.contentHash,
      contentType: input.contentType ?? null,
      platform: input.platform,
      status: input.status,
      bufferDraftId: input.bufferDraftId ?? null,
      caption: input.caption,
      hashtags: input.hashtags,
      mediaUrls: input.mediaUrls,
      thumbnailUrl: input.thumbnailUrl ?? null,
      scheduledAt: input.scheduledAt,
    });
  }

  getPostById(id: string): Post | undefined {
    const row = this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    return row ? this.mapPost(row) : undefined;
  }

  getPost(id: string): Post | undefined {
    return this.getPostById(id);
  }

  listPostsByStatus(status: PostStatus, limit = 50): Post[] {
    const rows = this.db
      .prepare('SELECT * FROM posts WHERE status = @status ORDER BY scheduled_at ASC LIMIT @limit')
      .all({ status, limit });
    return rows.map((row) => this.mapPost(row));
  }

  getPostsByStatus(status: PostStatus, limit = 50): Post[] {
    return this.listPostsByStatus(status, limit);
  }

  postExists(contentHash: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM posts WHERE content_hash = ? LIMIT 1')
      .get(contentHash);
    return Boolean(row);
  }

  updatePostStatus(id: string, status: PostStatus, bufferDraftId?: string | null): boolean {
    const result = this.db
      .prepare(
        'UPDATE posts SET status = @status, buffer_draft_id = COALESCE(@bufferDraftId, buffer_draft_id), updated_at = CURRENT_TIMESTAMP WHERE id = @id'
      )
      .run({ id, status, bufferDraftId: bufferDraftId ?? null });
    return result.changes > 0;
  }

  attachBufferDraft(id: string, bufferDraftId: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE posts SET buffer_draft_id = @bufferDraftId, status = 'pending_approval', updated_at = CURRENT_TIMESTAMP WHERE id = @id"
      )
      .run({ id, bufferDraftId });
    return result.changes > 0;
  }

  getPostsForDigest(start: Date, end: Date): Post[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM posts WHERE status = 'DRAFT' AND scheduled_at BETWEEN @start AND @end ORDER BY scheduled_at ASC"
      )
      .all({ start: start.toISOString(), end: end.toISOString() });
    return rows.map((row) => this.mapPost(row));
  }

  updatePost(id: string, updates: Partial<Pick<Post, 'buffer_draft_ids' | 'approved_at' | 'approved_by' | 'status'>>): boolean {
    const setClauses: string[] = [];
    const params: Record<string, any> = { id };

    if (updates.buffer_draft_ids !== undefined) {
      setClauses.push('buffer_draft_ids = @buffer_draft_ids');
      params.buffer_draft_ids = typeof updates.buffer_draft_ids === 'string' 
        ? updates.buffer_draft_ids 
        : JSON.stringify(updates.buffer_draft_ids);
    }

    if (updates.approved_at !== undefined) {
      setClauses.push('approved_at = @approved_at');
      params.approved_at = updates.approved_at ? updates.approved_at.toISOString() : null;
    }

    if (updates.approved_by !== undefined) {
      setClauses.push('approved_by = @approved_by');
      params.approved_by = updates.approved_by;
    }

    if (updates.status !== undefined) {
      setClauses.push('status = @status');
      params.status = updates.status;
    }

    if (setClauses.length === 0) {
      return false;
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `UPDATE posts SET ${setClauses.join(', ')} WHERE id = @id`;
    const result = this.db.prepare(sql).run(params);
    return result.changes > 0;
  }

  createApproval(data: {
    postId: string;
    action: string;
    approvedBy: string;
    notes?: string;
  }): ApprovalRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO approvals (id, post_id, action, actor, comment, created_at) VALUES (@id, @postId, @action, @actor, @comment, @createdAt)'
      )
      .run({
        id,
        postId: data.postId,
        action: data.action,
        actor: data.approvedBy,
        comment: data.notes ?? null,
        createdAt: now,
      });
    return {
      id,
      postId: data.postId,
      action: data.action as 'approve' | 'reject',
      actor: data.approvedBy,
      comment: data.notes ?? null,
      createdAt: new Date(now),
    };
  }

  // Post metrics methods
  insertPostMetrics(data: {
    postId: string;
    platform: string;
    metrics: Record<string, any>;
    fetchedAt?: Date;
  }): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO post_metrics (post_id, platform, metrics, fetched_at) VALUES (@postId, @platform, @metrics, @fetchedAt)'
      )
      .run({
        postId: data.postId,
        platform: data.platform,
        metrics: JSON.stringify(data.metrics),
        fetchedAt: (data.fetchedAt || new Date()).toISOString(),
      });
  }

  getPostMetrics(postId: string): Array<{
    platform: string;
    metrics: Record<string, any>;
    fetchedAt: Date;
  }> {
    const rows = this.db
      .prepare('SELECT platform, metrics, fetched_at FROM post_metrics WHERE post_id = @postId ORDER BY fetched_at DESC')
      .all({ postId });
    
    return (rows as any[]).map((row: any) => ({
      platform: row.platform,
      metrics: JSON.parse(row.metrics),
      fetchedAt: new Date(row.fetched_at),
    }));
  }

  getRecentPostsForMetrics(daysBack: number = 7): Post[] {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db
      .prepare("SELECT * FROM posts WHERE status = 'PUBLISHED' AND scheduled_at >= @since ORDER BY scheduled_at DESC")
      .all({ since });
    return rows.map((row) => this.mapPost(row));
  }

    // Get published posts in a date range for metrics harvesting
    getPublishedPostsInRange(start: Date, end: Date): Post[] {
      const rows = this.db
        .prepare("SELECT * FROM posts WHERE status = 'PUBLISHED' AND scheduled_at >= @start AND scheduled_at <= @end ORDER BY scheduled_at DESC")
        .all({ 
          start: start.toISOString(), 
          end: end.toISOString() 
        });
      return rows.map((row) => this.mapPost(row));
    }

    // Store post metrics using existing insertPostMetrics
    storePostMetrics(metrics: {
      postId: string;
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
    }): void {
      this.insertPostMetrics({
        postId: metrics.postId,
        platform: metrics.platform,
        metrics: {
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          reach: metrics.reach,
          engagementRate: metrics.engagementRate,
          clickThroughRate: metrics.clickThroughRate
        },
        fetchedAt: metrics.collectedAt
      });
    }

    // Store weekly metrics report
    storeWeeklyReport(report: {
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
      insights: string[];
      generatedAt: Date;
    }): void {
      const id = randomUUID();
      this.db
        .prepare(`
          INSERT OR REPLACE INTO weekly_reports 
          (id, week_start, week_end, total_posts, total_views, total_likes, 
           total_comments, total_shares, total_clicks, total_impressions, 
           total_reach, avg_engagement_rate, avg_click_through_rate, insights, generated_at)
          VALUES (@id, @weekStart, @weekEnd, @totalPosts, @totalViews, @totalLikes,
                  @totalComments, @totalShares, @totalClicks, @totalImpressions,
                  @totalReach, @avgEngagementRate, @avgClickThroughRate, @insights, @generatedAt)
        `)
        .run({
          id,
          weekStart: report.weekStart.toISOString(),
          weekEnd: report.weekEnd.toISOString(),
          totalPosts: report.totalPosts,
          totalViews: report.totalViews,
          totalLikes: report.totalLikes,
          totalComments: report.totalComments,
          totalShares: report.totalShares,
          totalClicks: report.totalClicks,
          totalImpressions: report.totalImpressions,
          totalReach: report.totalReach,
          avgEngagementRate: report.avgEngagementRate,
          avgClickThroughRate: report.avgClickThroughRate,
          insights: JSON.stringify(report.insights),
          generatedAt: report.generatedAt.toISOString()
        });
    }

    // Get post metrics in date range
    getPostMetricsInRange(start: Date, end: Date): Array<{
      postId: string;
      platform: string;
      metrics: Record<string, any>;
      fetchedAt: Date;
    }> {
      const rows = this.db
        .prepare(`
          SELECT post_id, platform, metrics, fetched_at 
          FROM post_metrics 
          WHERE fetched_at >= @start AND fetched_at <= @end 
          ORDER BY fetched_at DESC
        `)
        .all({ 
          start: start.toISOString(), 
          end: end.toISOString() 
        });
    
      return (rows as any[]).map((row: any) => ({
        postId: row.post_id,
        platform: row.platform,
        metrics: JSON.parse(row.metrics),
        fetchedAt: new Date(row.fetched_at),
      }));
    }

  recordApproval(postId: string, action: 'approve' | 'reject', actor?: string, comment?: string): ApprovalRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO approvals (id, post_id, action, actor, comment, created_at) VALUES (@id, @postId, @action, @actor, @comment, @createdAt)'
      )
      .run({
        id,
        postId,
        action,
        actor: actor ?? null,
        comment: comment ?? null,
        createdAt: now,
      });
    return {
      id,
      postId,
      action,
      actor: actor ?? null,
      comment: comment ?? null,
      createdAt: new Date(now),
    };
  }

  getApprovalsForPost(postId: string): ApprovalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM approvals WHERE post_id = @postId ORDER BY created_at DESC')
      .all({ postId });
    return rows.map((row) => ({
      id: row.id,
      postId: row.post_id,
      action: row.action,
      actor: row.actor ?? null,
      comment: row.comment ?? null,
      createdAt: new Date(row.created_at),
    }));
  }

  trackCarouselUsage(carouselHash: string, theme: string, platform: string): void {
    this.db
      .prepare(
        'INSERT INTO carousel_usage (id, carousel_hash, theme, platform, used_at) VALUES (@id, @carouselHash, @theme, @platform, CURRENT_TIMESTAMP)'
      )
      .run({
        id: randomUUID(),
        carouselHash,
        theme,
        platform,
      });
  }

  getCarouselsUsedInPeriod(start: Date, end: Date, platform: string): CarouselUsageRecord[] {
    const rows = this.db
      .prepare(
        'SELECT carousel_hash, theme, platform, MAX(used_at) AS last_used, COUNT(*) AS usage_count FROM carousel_usage WHERE platform = @platform AND used_at BETWEEN @start AND @end GROUP BY carousel_hash, theme, platform'
      )
      .all({
        platform,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    return rows.map((row) => ({
      carouselId: row.carousel_hash,
      theme: row.theme ?? 'unknown',
      platform: row.platform,
      lastUsed: new Date(row.last_used),
      usageCount: Number(row.usage_count ?? 0),
    }));
  }

  getRecentlyUsedCarousels(minDays: number): CarouselUsageRecord[] {
    const since = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db
      .prepare(
        'SELECT carousel_hash, theme, platform, MAX(used_at) AS last_used, COUNT(*) AS usage_count FROM carousel_usage WHERE used_at >= @since GROUP BY carousel_hash, theme, platform'
      )
      .all({ since });
    return rows.map((row) => ({
      carouselId: row.carousel_hash,
      theme: row.theme ?? 'unknown',
      platform: row.platform,
      lastUsed: new Date(row.last_used),
      usageCount: Number(row.usage_count ?? 0),
    }));
  }

  private resolveDbPath(dbPath?: string): string {
    if (dbPath) {
      return dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath);
    }
    const envPath = process.env.SCHEDULER_DB_PATH;
    if (envPath) {
      return envPath === ':memory:' ? ':memory:' : path.resolve(envPath);
    }
    return path.resolve(process.cwd(), 'scheduler.db');
  }

  private initializeSchema(): void {
    // First create the basic schema
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, source_path TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);' +
        'CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, asset_id TEXT, content_hash TEXT, content_type TEXT, platform TEXT NOT NULL, status TEXT NOT NULL, buffer_draft_id TEXT, caption TEXT, hashtags TEXT, media_urls TEXT, thumbnail_url TEXT, scheduled_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);' +
        'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);' +
        'CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);' +
        'CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT, comment TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);' +
        'CREATE TABLE IF NOT EXISTS carousel_usage (id TEXT PRIMARY KEY, carousel_hash TEXT NOT NULL, theme TEXT, platform TEXT NOT NULL, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);'
    );

    // Add new columns if they don't exist (for backwards compatibility)
    try {
      this.db.exec('ALTER TABLE posts ADD COLUMN buffer_draft_ids TEXT DEFAULT "[]";');
    } catch (e) {
      // Column already exists or other error - ignore
    }
    try {
      this.db.exec('ALTER TABLE posts ADD COLUMN approved_at TIMESTAMP;');
    } catch (e) {
      // Column already exists or other error - ignore
    }
    try {
      this.db.exec('ALTER TABLE posts ADD COLUMN approved_by TEXT;');
    } catch (e) {
      // Column already exists or other error - ignore
    }

    // Create metrics table
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS post_metrics (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
        'post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, ' +
        'platform TEXT NOT NULL, ' +
        'metrics TEXT NOT NULL DEFAULT "{}", ' +
        'fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        'UNIQUE(post_id, platform, fetched_at)' +
      ');'
    );
    
    // Create indexes for metrics
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics(post_id);' +
      'CREATE INDEX IF NOT EXISTS idx_post_metrics_platform ON post_metrics(platform);' +
      'CREATE INDEX IF NOT EXISTS idx_post_metrics_fetched_at ON post_metrics(fetched_at);'
    );

      // Create weekly reports table
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS weekly_reports (' +
          'id TEXT PRIMARY KEY, ' +
          'week_start DATE NOT NULL, ' +
          'week_end DATE NOT NULL, ' +
          'total_posts INTEGER NOT NULL DEFAULT 0, ' +
          'total_views INTEGER NOT NULL DEFAULT 0, ' +
          'total_likes INTEGER NOT NULL DEFAULT 0, ' +
          'total_comments INTEGER NOT NULL DEFAULT 0, ' +
          'total_shares INTEGER NOT NULL DEFAULT 0, ' +
          'total_clicks INTEGER NOT NULL DEFAULT 0, ' +
          'total_impressions INTEGER NOT NULL DEFAULT 0, ' +
          'total_reach INTEGER NOT NULL DEFAULT 0, ' +
          'avg_engagement_rate REAL NOT NULL DEFAULT 0.0, ' +
          'avg_click_through_rate REAL NOT NULL DEFAULT 0.0, ' +
          'insights TEXT NOT NULL DEFAULT "[]", ' +
          'generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
          'UNIQUE(week_start, week_end)' +
        ');'
      );
    
      // Create indexes for weekly reports
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_weekly_reports_week_start ON weekly_reports(week_start);' +
        'CREATE INDEX IF NOT EXISTS idx_weekly_reports_generated_at ON weekly_reports(generated_at);'
      );
  }

  private ensureAsset(assetId: string): void {
    const existing = this.db.prepare('SELECT 1 FROM assets WHERE id = ? LIMIT 1').get(assetId);
    if (!existing) {
      this.db.prepare('INSERT INTO assets (id, source_path) VALUES (@id, @sourcePath)').run({ id: assetId, sourcePath: null });
    }
  }

  private mapPost = (row: any): Post => ({
    id: row.id,
    assetId: row.asset_id ?? null,
    contentHash: row.content_hash ?? null,
    contentType: row.content_type ?? null,
    platform: row.platform,
    status: row.status,
    bufferDraftId: row.buffer_draft_id ?? null,
    buffer_draft_ids: row.buffer_draft_ids ? JSON.parse(row.buffer_draft_ids) : null,
    caption: row.caption ?? '',
    hashtags: row.hashtags ? JSON.parse(row.hashtags) : [],
    mediaUrls: row.media_urls ? JSON.parse(row.media_urls) : [],
    thumbnailUrl: row.thumbnail_url ?? null,
    scheduledAt: new Date(row.scheduled_at),
    approved_at: row.approved_at ? new Date(row.approved_at) : null,
    approved_by: row.approved_by ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
