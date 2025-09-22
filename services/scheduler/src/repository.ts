import Database from 'better-sqlite3';
import { z } from 'zod';
import { config } from './config.js';

// Database schemas
const PostSchema = z.object({
  id: z.string(),
  contentHash: z.string(),
  platform: z.enum(['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'facebook']),
  caption: z.string(),
  hashtags: z.array(z.string()),
  mediaUrls: z.array(z.string()),
  thumbnailUrl: z.string().optional(),
  scheduledAt: z.date(),
  bufferDraftId: z.string().optional(),
  status: z.enum(['draft', 'approved', 'published', 'rejected']),
  createdAt: z.date(),
  updatedAt: z.date()
});

const ApprovalSchema = z.object({
  id: z.string(),
  postId: z.string(),
  action: z.enum(['approved', 'rejected']),
  approvedAt: z.date(),
  approvedBy: z.string().optional(),
  notes: z.string().optional()
});

const ChannelSchema = z.object({
  id: z.string(),
  platform: z.enum(['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'facebook']),
  bufferChannelId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.date()
});

export type Post = z.infer<typeof PostSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type Channel = z.infer<typeof ChannelSchema>;

export class Repository {
  private db: Database.Database;

  constructor(databaseUrl: string = config.config.DATABASE_URL) {
    // For now, we'll use SQLite. PostgreSQL support can be added later
    const dbPath = databaseUrl.replace('sqlite:', '');
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    // Posts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        platform TEXT NOT NULL,
        caption TEXT NOT NULL,
        hashtags TEXT NOT NULL, -- JSON array
        media_urls TEXT NOT NULL, -- JSON array
        thumbnail_url TEXT,
        scheduled_at DATETIME NOT NULL,
        buffer_draft_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Approvals table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        action TEXT NOT NULL,
        approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        notes TEXT,
        FOREIGN KEY (post_id) REFERENCES posts (id)
      )
    `);

    // Channels table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        buffer_channel_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
      CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_posts_content_hash ON posts(content_hash);
      CREATE INDEX IF NOT EXISTS idx_approvals_post_id ON approvals(post_id);
      CREATE INDEX IF NOT EXISTS idx_channels_platform ON channels(platform);
    `);
  }

  // Post operations
  createPost(post: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>): Post {
    const id = crypto.randomUUID();
    const now = new Date();

    const stmt = this.db.prepare(`
      INSERT INTO posts (id, content_hash, platform, caption, hashtags, media_urls, thumbnail_url, scheduled_at, buffer_draft_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      post.contentHash,
      post.platform,
      post.caption,
      JSON.stringify(post.hashtags),
      JSON.stringify(post.mediaUrls),
      post.thumbnailUrl,
      post.scheduledAt.toISOString(),
      post.bufferDraftId,
      post.status,
      now.toISOString(),
      now.toISOString()
    );

    return {
      ...post,
      id,
      createdAt: now,
      updatedAt: now
    };
  }

  getPost(id: string): Post | null {
    const stmt = this.db.prepare('SELECT * FROM posts WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      contentHash: row.content_hash,
      platform: row.platform,
      caption: row.caption,
      hashtags: JSON.parse(row.hashtags),
      mediaUrls: JSON.parse(row.media_urls),
      thumbnailUrl: row.thumbnail_url || undefined,
      scheduledAt: new Date(row.scheduled_at),
      bufferDraftId: row.buffer_draft_id || undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  updatePost(id: string, updates: Partial<Post>): Post | null {
    const existing = this.getPost(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    const stmt = this.db.prepare(`
      UPDATE posts SET
        content_hash = ?,
        platform = ?,
        caption = ?,
        media_urls = ?,
        thumbnail_url = ?,
        scheduled_at = ?,
        buffer_draft_id = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.contentHash,
      updated.platform,
      updated.caption,
      JSON.stringify(updated.mediaUrls),
      updated.thumbnailUrl,
      updated.scheduledAt.toISOString(),
      updated.bufferDraftId,
      updated.status,
      updated.updatedAt.toISOString(),
      id
    );

    return updated;
  }

  getPostsByStatus(status: Post['status'], limit: number = 50): Post[] {
    const stmt = this.db.prepare('SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(status, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      contentHash: row.content_hash,
      platform: row.platform,
      caption: row.caption,
      hashtags: JSON.parse(row.hashtags),
      mediaUrls: JSON.parse(row.media_urls),
      thumbnailUrl: row.thumbnail_url || undefined,
      scheduledAt: new Date(row.scheduled_at),
      bufferDraftId: row.buffer_draft_id || undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  getPostsForDigest(startDate: Date, endDate: Date): Post[] {
    const stmt = this.db.prepare(`
      SELECT * FROM posts
      WHERE status = 'draft'
      AND scheduled_at >= ?
      AND scheduled_at < ?
      ORDER BY scheduled_at ASC
    `);

    const rows = stmt.all(startDate.toISOString(), endDate.toISOString()) as any[];

    return rows.map(row => ({
      id: row.id,
      contentHash: row.content_hash,
      platform: row.platform,
      caption: row.caption,
      hashtags: JSON.parse(row.hashtags),
      mediaUrls: JSON.parse(row.media_urls),
      thumbnailUrl: row.thumbnail_url || undefined,
      scheduledAt: new Date(row.scheduled_at),
      bufferDraftId: row.buffer_draft_id || undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  // Approval operations
  createApproval(approval: Omit<Approval, 'id' | 'approvedAt'>): Approval {
    const id = crypto.randomUUID();
    const now = new Date();

    const stmt = this.db.prepare(`
      INSERT INTO approvals (id, post_id, action, approved_at, approved_by, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      approval.postId,
      approval.action,
      now.toISOString(),
      approval.approvedBy,
      approval.notes
    );

    return {
      ...approval,
      id,
      approvedAt: now
    };
  }

  getApprovalsForPost(postId: string): Approval[] {
    const stmt = this.db.prepare('SELECT * FROM approvals WHERE post_id = ? ORDER BY approved_at DESC');
    const rows = stmt.all(postId) as any[];

    return rows.map(row => ({
      id: row.id,
      postId: row.post_id,
      action: row.action,
      approvedAt: new Date(row.approved_at),
      approvedBy: row.approved_by,
      notes: row.notes
    }));
  }

  // Channel operations
  createChannel(channel: Omit<Channel, 'id' | 'createdAt'>): Channel {
    const id = crypto.randomUUID();
    const now = new Date();

    const stmt = this.db.prepare(`
      INSERT INTO channels (id, platform, buffer_channel_id, name, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      channel.platform,
      channel.bufferChannelId,
      channel.name,
      channel.isActive ? 1 : 0,
      now.toISOString()
    );

    return {
      ...channel,
      id,
      createdAt: now
    };
  }

  getActiveChannels(): Channel[] {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE is_active = 1');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      platform: row.platform,
      bufferChannelId: row.buffer_channel_id,
      name: row.name,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at)
    }));
  }

  getChannelByPlatform(platform: Channel['platform']): Channel | null {
    const stmt = this.db.prepare('SELECT * FROM channels WHERE platform = ? AND is_active = 1');
    const row = stmt.get(platform) as any;

    if (!row) return null;

    return {
      id: row.id,
      platform: row.platform,
      bufferChannelId: row.buffer_channel_id,
      name: row.name,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at)
    };
  }

  updatePostStatus(id: string, status: Post['status']): boolean {
    const stmt = this.db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?');
    const result = stmt.run(status, new Date().toISOString(), id);
    return result.changes > 0;
  }

  // Check if content hash exists (for idempotency)
  postExists(contentHash: string): boolean {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM posts WHERE content_hash = ?');
    const result = stmt.get(contentHash) as { count: number };
    return result.count > 0;
  }

  // Close database connection
  close(): void {
    this.db.close();
  }
}