import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { Repository } from '../src/repository.js';

describe('Repository', () => {
  let db: Database.Database;
  let repository: Repository;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    repository = new Repository(':memory:');
  });

  afterEach(() => {
    repository.close();
  });

  describe('Post operations', () => {
    it('should create and retrieve a post', () => {
      const postData = {
        contentHash: 'test-hash',
        platform: 'instagram' as const,
        caption: 'Test caption',
        hashtags: ['#test', '#jest'],
        mediaUrls: ['https://example.com/image.jpg'],
        thumbnailUrl: 'https://example.com/thumb.jpg',
        scheduledAt: new Date('2024-01-01T10:00:00Z'),
        status: 'draft' as const
      };

      const created = repository.createPost(postData);
      expect(created.id).toBeDefined();
      expect(created.contentHash).toBe(postData.contentHash);
      expect(created.platform).toBe(postData.platform);
      expect(created.caption).toBe(postData.caption);
      expect(created.hashtags).toEqual(postData.hashtags);
      expect(created.mediaUrls).toEqual(postData.mediaUrls);
      expect(created.thumbnailUrl).toBe(postData.thumbnailUrl);
      expect(created.scheduledAt).toEqual(postData.scheduledAt);
      expect(created.status).toBe(postData.status);
      expect(created.bufferDraftId).toBeUndefined(); // Not provided in input

      const retrieved = repository.getPost(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should update post status', () => {
      const post = repository.createPost({
        contentHash: 'test-hash',
        platform: 'instagram',
        caption: 'Test caption',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
        status: 'draft'
      });

      const updated = repository.updatePostStatus(post.id, 'approved');
      expect(updated).toBe(true);

      const retrieved = repository.getPost(post.id);
      expect(retrieved?.status).toBe('approved');
    });

    it('should check if post exists by content hash', () => {
      const contentHash = 'unique-hash';
      expect(repository.postExists(contentHash)).toBe(false);

      repository.createPost({
        contentHash,
        platform: 'instagram',
        caption: 'Test',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
        status: 'draft'
      });

      expect(repository.postExists(contentHash)).toBe(true);
    });

    it('should get posts by status', () => {
      // Create posts with different statuses
      repository.createPost({
        contentHash: 'draft-1',
        platform: 'instagram',
        caption: 'Draft post 1',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
        status: 'draft'
      });

      repository.createPost({
        contentHash: 'approved-1',
        platform: 'tiktok',
        caption: 'Approved post 1',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
        status: 'approved'
      });

      repository.createPost({
        contentHash: 'draft-2',
        platform: 'facebook',
        caption: 'Draft post 2',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
        status: 'draft'
      });

      const drafts = repository.getPostsByStatus('draft');
      expect(drafts).toHaveLength(2);
      expect(drafts.every((p: any) => p.status === 'draft')).toBe(true);

      const approved = repository.getPostsByStatus('approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].status).toBe('approved');
    });

    it('should get posts for digest within date range', () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date(now);
      dayAfter.setDate(dayAfter.getDate() + 2);

      // Create posts with different dates
      repository.createPost({
        contentHash: 'past',
        platform: 'instagram',
        caption: 'Past post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
        status: 'draft'
      });

      repository.createPost({
        contentHash: 'today',
        platform: 'tiktok',
        caption: 'Today post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: now,
        status: 'draft'
      });

      repository.createPost({
        contentHash: 'tomorrow',
        platform: 'facebook',
        caption: 'Tomorrow post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: tomorrow,
        status: 'draft'
      });

      repository.createPost({
        contentHash: 'future',
        platform: 'linkedin',
        caption: 'Future post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: dayAfter,
        status: 'draft'
      });

      const digestPosts = repository.getPostsForDigest(now, dayAfter);
      expect(digestPosts).toHaveLength(2);
      expect(digestPosts.map((p: any) => p.contentHash)).toEqual(['today', 'tomorrow']);
    });
  });

  describe('Approval operations', () => {
    it('should create and retrieve approvals', () => {
      const post = repository.createPost({
        contentHash: 'test-post',
        platform: 'instagram',
        caption: 'Test post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
        status: 'draft'
      });

      const approval = repository.createApproval({
        postId: post.id,
        action: 'approved',
        approvedBy: 'test@example.com',
        notes: 'Looks good!'
      });

      expect(approval.id).toBeDefined();
      expect(approval.postId).toBe(post.id);
      expect(approval.action).toBe('approved');
      expect(approval.approvedBy).toBe('test@example.com');
      expect(approval.notes).toBe('Looks good!');

      const approvals = repository.getApprovalsForPost(post.id);
      expect(approvals).toHaveLength(1);
      expect(approvals[0]).toEqual(approval);
    });
  });

  describe('Channel operations', () => {
    it('should create and retrieve channels', () => {
      const channel = repository.createChannel({
        platform: 'instagram',
        bufferChannelId: 'buffer-123',
        name: 'Test Instagram',
        isActive: true
      });

      expect(channel.id).toBeDefined();
      expect(channel.platform).toBe('instagram');
      expect(channel.bufferChannelId).toBe('buffer-123');
      expect(channel.name).toBe('Test Instagram');
      expect(channel.isActive).toBe(true);

      const retrieved = repository.getChannelByPlatform('instagram');
      expect(retrieved).toEqual(channel);

      const activeChannels = repository.getActiveChannels();
      expect(activeChannels).toHaveLength(1);
      expect(activeChannels[0]).toEqual(channel);
    });

    it('should not return inactive channels', () => {
      repository.createChannel({
        platform: 'instagram',
        bufferChannelId: 'buffer-123',
        name: 'Test Instagram',
        isActive: false
      });

      const activeChannels = repository.getActiveChannels();
      expect(activeChannels).toHaveLength(0);

      const retrieved = repository.getChannelByPlatform('instagram');
      expect(retrieved).toBeNull();
    });
  });
});