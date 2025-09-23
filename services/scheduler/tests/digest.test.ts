import { describe, it, expect, beforeEach } from '@jest/globals';
import { DigestGenerator } from '../src/email/digest.js';
import { Post } from '../src/repository.js';

let counter = 0;
const makePost = (overrides: Partial<Post>): Post => ({
  id: overrides.id ?? 'post-' + String(counter++),
  assetId: overrides.assetId ?? 'asset-1',
  contentHash: overrides.contentHash ?? 'hash-' + String(counter),
  contentType: overrides.contentType ?? 'carousel',
  platform: overrides.platform ?? 'instagram',
  status: overrides.status ?? 'pending_approval',
  bufferDraftId: overrides.bufferDraftId ?? 'draft-1',
  caption: overrides.caption ?? 'Default caption',
  hashtags: overrides.hashtags ?? ['#default'],
  mediaUrls: overrides.mediaUrls ?? ['https://example.com/default.jpg'],
  thumbnailUrl: overrides.thumbnailUrl === undefined ? 'https://example.com/thumb.jpg' : overrides.thumbnailUrl,
  scheduledAt: overrides.scheduledAt ?? new Date('2024-01-15T10:00:00Z'),
  createdAt: overrides.createdAt ?? new Date('2024-01-10T10:00:00Z'),
  updatedAt: overrides.updatedAt ?? new Date('2024-01-10T10:00:00Z'),
});

describe('DigestGenerator', () => {
  let generator: DigestGenerator;

  beforeEach(() => {
    generator = new DigestGenerator();
  });

  describe('generateDigest', () => {
    it('should generate HTML digest with posts', () => {
      const posts: Post[] = [
        makePost({
          id: 'post-1',
          platform: 'instagram',
          caption: 'Beautiful sunset photo',
          hashtags: ['#sunset', '#photography'],
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          scheduledAt: new Date('2024-01-15T18:00:00Z'),
        }),
        makePost({
          id: 'post-2',
          platform: 'tiktok',
          caption: 'Quick dance tutorial',
          hashtags: ['#dance', '#tutorial'],
          thumbnailUrl: 'https://example.com/thumb2.jpg',
          scheduledAt: new Date('2024-01-16T14:30:00Z'),
        }),
      ];

      const startDate = new Date('2024-01-14T00:00:00Z');
      const endDate = new Date('2024-01-20T23:59:59Z');

      const html = generator.generateDigest(posts, startDate, endDate);

      // Check basic HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Weekly Digest');
      expect(html).toContain('Beautiful sunset photo');
      expect(html).toContain('Quick dance tutorial');
      expect(html).toContain('#sunset');
      expect(html).toContain('#dance');
      expect(html).toContain('Instagram');
      expect(html).toContain('TikTok');

      // Check approval/reject links are present
      expect(html).toContain('Approve');
      expect(html).toContain('Reject');
    });

    it('should handle posts without thumbnails', () => {
      const posts: Post[] = [
        makePost({
          id: 'post-1',
          platform: 'linkedin',
          caption: 'Professional article about tech trends',
          hashtags: ['#technology', '#trends'],
          thumbnailUrl: null,
        }),
      ];

      const startDate = new Date('2024-01-14T00:00:00Z');
      const endDate = new Date('2024-01-16T23:59:59Z');

      const html = generator.generateDigest(posts, startDate, endDate);

      expect(html).toContain('Professional article about tech trends');
      expect(html).toContain('#technology');
      expect(html).not.toContain('<img'); // No thumbnail image tag
    });

    it('should escape HTML characters in captions', () => {
      const posts: Post[] = [
        makePost({
          id: 'post-1',
          caption: 'Check out this <script>alert("xss")</script> photo!',
          hashtags: [],
          thumbnailUrl: null,
          mediaUrls: [],
        }),
      ];

      const startDate = new Date('2024-01-14T00:00:00Z');
      const endDate = new Date('2024-01-16T23:59:59Z');

      const html = generator.generateDigest(posts, startDate, endDate);

      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(html).not.toContain('<script>alert("xss")</script>');
    });
  });

  describe('generateTextDigest', () => {
    it('should generate plain text digest', () => {
      const posts: Post[] = [
        makePost({
          id: 'post-1',
          platform: 'instagram',
          caption: 'Beautiful sunset photo',
          hashtags: ['#sunset', '#photography'],
          thumbnailUrl: 'https://example.com/thumb.jpg',
        }),
      ];

      const startDate = new Date('2024-01-14T00:00:00Z');
      const endDate = new Date('2024-01-16T23:59:59Z');

      const text = generator.generateTextDigest(posts, startDate, endDate);

      expect(text).toContain('Test Brand Weekly Digest');
      expect(text).toContain('Beautiful sunset photo');
      expect(text).toContain('#sunset');
      expect(text).toContain('#photography');
      expect(text).toContain('Instagram');
      expect(text).toContain('Approve:');
      expect(text).toContain('Reject:');
    });
  });

  describe('getSubjectLine', () => {
    it('should generate appropriate subject lines', () => {
      const date = new Date('2024-01-15T10:00:00Z');

      expect(generator.getSubjectLine(1, date)).toContain('1 post');
      expect(generator.getSubjectLine(5, date)).toContain('5 posts');
      expect(generator.getSubjectLine(5, date)).toContain('15 Jan');
    });
  });
});
