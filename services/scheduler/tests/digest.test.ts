import { describe, it, expect } from '@jest/globals';
import { DigestGenerator } from '../src/email/digest.js';
import { Post } from '../src/repository.js';

describe('DigestGenerator', () => {
  let generator: DigestGenerator;

  beforeEach(() => {
    generator = new DigestGenerator();
  });

  describe('generateDigest', () => {
    it('should generate HTML digest with posts', () => {
      const posts: Post[] = [
        {
          id: 'post-1',
          contentHash: 'hash-1',
          platform: 'instagram',
          caption: 'Beautiful sunset photo',
          hashtags: ['#sunset', '#photography'],
          mediaUrls: ['https://example.com/image1.jpg'],
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          scheduledAt: new Date('2024-01-15T18:00:00Z'),
          status: 'draft',
          createdAt: new Date('2024-01-10T10:00:00Z'),
          updatedAt: new Date('2024-01-10T10:00:00Z')
        },
        {
          id: 'post-2',
          contentHash: 'hash-2',
          platform: 'tiktok',
          caption: 'Quick dance tutorial',
          hashtags: ['#dance', '#tutorial'],
          mediaUrls: ['https://example.com/video1.mp4'],
          thumbnailUrl: 'https://example.com/thumb2.jpg',
          scheduledAt: new Date('2024-01-16T14:30:00Z'),
          status: 'draft',
          createdAt: new Date('2024-01-11T09:00:00Z'),
          updatedAt: new Date('2024-01-11T09:00:00Z')
        }
      ];

      const startDate = new Date('2024-01-14T00:00:00Z');
      const endDate = new Date('2024-01-20T23:59:59Z');

      const html = generator.generateDigest(posts, startDate, endDate);

      // Check basic HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Social Media Content Digest');
      expect(html).toContain('Beautiful sunset photo');
      expect(html).toContain('Quick dance tutorial');
      expect(html).toContain('#sunset');
      expect(html).toContain('#dance');
      expect(html).toContain('Instagram');
      expect(html).toContain('TikTok');

      // Check approval/reject links are present
      expect(html).toContain('approve');
      expect(html).toContain('reject');
    });

    it('should handle posts without thumbnails', () => {
      const posts: Post[] = [
        {
          id: 'post-1',
          contentHash: 'hash-1',
          platform: 'linkedin',
          caption: 'Professional article about tech trends',
          hashtags: ['#technology', '#trends'],
          mediaUrls: [],
          scheduledAt: new Date('2024-01-15T10:00:00Z'),
          status: 'draft',
          createdAt: new Date('2024-01-10T10:00:00Z'),
          updatedAt: new Date('2024-01-10T10:00:00Z')
        }
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
        {
          id: 'post-1',
          contentHash: 'hash-1',
          platform: 'instagram',
          caption: 'Check out this <script>alert("xss")</script> photo!',
          hashtags: [],
          mediaUrls: [],
          scheduledAt: new Date('2024-01-15T10:00:00Z'),
          status: 'draft',
          createdAt: new Date('2024-01-10T10:00:00Z'),
          updatedAt: new Date('2024-01-10T10:00:00Z')
        }
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
        {
          id: 'post-1',
          contentHash: 'hash-1',
          platform: 'instagram',
          caption: 'Beautiful sunset photo',
          hashtags: ['#sunset', '#photography'],
          mediaUrls: ['https://example.com/image1.jpg'],
          scheduledAt: new Date('2024-01-15T18:00:00Z'),
          status: 'draft',
          createdAt: new Date('2024-01-10T10:00:00Z'),
          updatedAt: new Date('2024-01-10T10:00:00Z')
        }
      ];

      const startDate = new Date('2024-01-14T00:00:00Z');
      const endDate = new Date('2024-01-16T23:59:59Z');

      const text = generator.generateTextDigest(posts, startDate, endDate);

      expect(text).toContain('Test Brand Content Digest');
      expect(text).toContain('Beautiful sunset photo');
      expect(text).toContain('#sunset');
      expect(text).toContain('#photography');
      expect(text).toContain('Instagram');
      expect(text).toContain('approve');
      expect(text).toContain('reject');
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

  describe('formatPlatformName', () => {
    it('should format platform names correctly', () => {
      expect(generator['formatPlatformName']('instagram')).toBe('Instagram');
      expect(generator['formatPlatformName']('tiktok')).toBe('TikTok');
      expect(generator['formatPlatformName']('youtube_shorts')).toBe('YouTube Shorts');
      expect(generator['formatPlatformName']('linkedin')).toBe('LinkedIn');
      expect(generator['formatPlatformName']('facebook')).toBe('Facebook');
      expect(generator['formatPlatformName']('unknown')).toBe('unknown');
    });
  });
});