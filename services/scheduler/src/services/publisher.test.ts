import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Publisher } from '../services/publisher.js';
import { Repository } from '../repository.js';

// Mock the BufferClient
const mockBufferClient = {
  getProfiles: vi.fn(),
  createDraft: vi.fn(),
  publish: vi.fn(),
  getPost: vi.fn(),
  deletePost: vi.fn(),
};

vi.mock('../integrations/bufferClient.js', () => ({
  BufferClient: vi.fn().mockImplementation(() => mockBufferClient),
}));

describe('Publisher', () => {
  let publisher: Publisher;
  let repository: Repository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new Repository(':memory:'); // Use in-memory SQLite for tests
    publisher = new Publisher(repository, 'test-buffer-token');
  });

  describe('constructor', () => {
    it('should throw error if no Buffer access token provided', () => {
      expect(() => new Publisher(repository)).toThrow('Buffer access token is required');
    });
  });

  describe('createDrafts', () => {
    const mockProfiles = [
      { id: 'profile1', service: 'instagram', service_username: 'test_ig' },
      { id: 'profile2', service: 'twitter', service_username: 'test_tw' },
      { id: 'profile3', service: 'linkedin', service_username: 'test_li' },
    ];

    beforeEach(() => {
      mockBufferClient.getProfiles.mockResolvedValue(mockProfiles);
    });

    it('should create drafts for multiple posts successfully', async () => {
      const posts = [
        {
          id: 'post1',
          text: 'Test post 1 #test',
          mediaUrls: ['https://example.com/image1.jpg'],
          platforms: ['instagram'],
        },
        {
          id: 'post2',
          text: 'Test post 2 #test',
          mediaUrls: ['https://example.com/image2.jpg'],
          platforms: ['twitter', 'linkedin'],
        },
      ];

      mockBufferClient.createDraft
        .mockResolvedValueOnce({ profile1: 'buffer1' }) // For post1
        .mockResolvedValueOnce({ profile2: 'buffer2', profile3: 'buffer3' }); // For post2

      const result = await publisher.createDrafts({ posts });

      expect(result.success).toBe(true);
      expect(result.createdDrafts).toEqual({
        post1: { profile1: 'buffer1' },
        post2: { profile2: 'buffer2', profile3: 'buffer3' },
      });
      expect(result.errors).toHaveLength(0);

      // Verify calls to Buffer client
      expect(mockBufferClient.createDraft).toHaveBeenCalledTimes(2);
      expect(mockBufferClient.createDraft).toHaveBeenCalledWith(
        { text: 'Test post 1 #test', scheduledAt: undefined },
        [{ url: 'https://example.com/image1.jpg', description: '' }],
        ['profile1']
      );
    });

    it('should handle posts with no matching profiles', async () => {
      const posts = [
        {
          id: 'post1',
          text: 'Test post 1',
          mediaUrls: [],
          platforms: ['youtube'], // No matching profile
        },
      ];

      const result = await publisher.createDrafts({ posts });

      expect(result.success).toBe(false);
      expect(result.createdDrafts).toEqual({});
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('No Buffer profiles found for platforms: youtube');
    });

    it('should handle Buffer API failures gracefully', async () => {
      const posts = [
        {
          id: 'post1',
          text: 'Test post 1',
          mediaUrls: [],
          platforms: ['instagram'],
        },
        {
          id: 'post2',
          text: 'Test post 2',
          mediaUrls: [],
          platforms: ['twitter'],
        },
      ];

      mockBufferClient.createDraft
        .mockResolvedValueOnce({ profile1: 'buffer1' }) // Success for post1
        .mockRejectedValueOnce(new Error('API Error')); // Failure for post2

      const result = await publisher.createDrafts({ posts });

      expect(result.success).toBe(true); // Success because at least one post succeeded
      expect(result.createdDrafts).toEqual({
        post1: { profile1: 'buffer1' },
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].postId).toBe('post2');
      expect(result.errors[0].error).toBe('API Error');
    });

    it('should fail when Buffer profile fetching fails', async () => {
      mockBufferClient.getProfiles.mockRejectedValue(new Error('Failed to fetch profiles'));

      const posts = [
        {
          id: 'post1',
          text: 'Test post 1',
          mediaUrls: [],
          platforms: ['instagram'],
        },
      ];

      const result = await publisher.createDrafts({ posts });

      expect(result.success).toBe(false);
      expect(result.createdDrafts).toEqual({});
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Failed to get Buffer profiles');
    });

    it('should handle scheduled posts correctly', async () => {
      const scheduledAt = new Date('2025-01-01T12:00:00Z');
      const posts = [
        {
          id: 'post1',
          text: 'Scheduled post',
          mediaUrls: [],
          platforms: ['instagram'],
          scheduledAt,
        },
      ];

      mockBufferClient.createDraft.mockResolvedValue({ profile1: 'buffer1' });

      await publisher.createDrafts({ posts });

      expect(mockBufferClient.createDraft).toHaveBeenCalledWith(
        { text: 'Scheduled post', scheduledAt },
        [],
        ['profile1']
      );
    });
  });

  describe('publishPost', () => {
    beforeEach(() => {
      // Create a test post in the database
      repository.insertPost({
        id: 'test-post',
        platform: 'instagram',
        status: 'APPROVED',
        caption: 'Test post',
        hashtags: ['test'],
        mediaUrls: ['https://example.com/image.jpg'],
        scheduledAt: new Date(),
      });
      
      // Update with Buffer draft IDs
      repository.updatePost('test-post', {
        buffer_draft_ids: JSON.stringify([
          { profileId: 'profile1', bufferId: 'buffer1', createdAt: new Date().toISOString() },
          { profileId: 'profile2', bufferId: 'buffer2', createdAt: new Date().toISOString() },
        ]),
      });
    });

    it('should publish an approved post successfully', async () => {
      mockBufferClient.publish.mockResolvedValue(undefined);

      const result = await publisher.publishPost({
        postId: 'test-post',
        approvedBy: 'user@example.com',
        notes: 'Looks good!',
      });

      expect(result.success).toBe(true);
      expect(result.bufferId).toBe('buffer1'); // First buffer ID returned as reference

      // Verify Buffer API calls
      expect(mockBufferClient.publish).toHaveBeenCalledTimes(2);
      expect(mockBufferClient.publish).toHaveBeenCalledWith('buffer1');
      expect(mockBufferClient.publish).toHaveBeenCalledWith('buffer2');

      // Verify database updates
      const updatedPost = repository.getPost('test-post');
      expect(updatedPost?.status).toBe('PUBLISHED');

      const approvals = repository.getApprovalsForPost('test-post');
      expect(approvals).toHaveLength(1);
      expect(approvals[0].action).toBe('published');
      expect(approvals[0].actor).toBe('user@example.com');
    });

    it('should handle post not found', async () => {
      const result = await publisher.publishPost({
        postId: 'nonexistent-post',
        approvedBy: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Post not found');
    });

    it('should handle post not in APPROVED status', async () => {
      // Create a post in DRAFT status
      repository.insertPost({
        id: 'draft-post',
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Draft post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
      });

      const result = await publisher.publishPost({
        postId: 'draft-post',
        approvedBy: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Post status is DRAFT, expected APPROVED');
    });

    it('should handle partial Buffer publish failures', async () => {
      mockBufferClient.publish
        .mockResolvedValueOnce(undefined) // Success for buffer1
        .mockRejectedValueOnce(new Error('Buffer API Error')); // Failure for buffer2

      const result = await publisher.publishPost({
        postId: 'test-post',
        approvedBy: 'user@example.com',
      });

      expect(result.success).toBe(true); // Success because at least one published
      expect(result.bufferId).toBe('buffer1');

      // Post should still be marked as PUBLISHED
      const updatedPost = repository.getPost('test-post');
      expect(updatedPost?.status).toBe('PUBLISHED');
    });

    it('should handle all Buffer publish failures', async () => {
      mockBufferClient.publish.mockRejectedValue(new Error('All failed'));

      const result = await publisher.publishPost({
        postId: 'test-post',
        approvedBy: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('All Buffer publishes failed');

      // Post status should remain APPROVED
      const updatedPost = repository.getPost('test-post');
      expect(updatedPost?.status).toBe('APPROVED');
    });
  });

  describe('rejectPost', () => {
    beforeEach(() => {
      // Create a test post in DRAFT status
      repository.insertPost({
        id: 'test-post',
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Test post',
        hashtags: ['test'],
        mediaUrls: ['https://example.com/image.jpg'],
        scheduledAt: new Date(),
      });
      
      // Update with Buffer draft IDs
      repository.updatePost('test-post', {
        buffer_draft_ids: JSON.stringify([
          { profileId: 'profile1', bufferId: 'buffer1', createdAt: new Date().toISOString() },
        ]),
      });
    });

    it('should reject a post and clean up Buffer drafts', async () => {
      mockBufferClient.deletePost.mockResolvedValue(undefined);

      const result = await publisher.rejectPost(
        'test-post',
        'user@example.com',
        'Not suitable for our brand'
      );

      expect(result.success).toBe(true);

      // Verify Buffer draft deletion
      expect(mockBufferClient.deletePost).toHaveBeenCalledWith('buffer1');

      // Verify database updates
      const updatedPost = repository.getPost('test-post');
      expect(updatedPost?.status).toBe('REJECTED');

      const approvals = repository.getApprovalsForPost('test-post');
      expect(approvals).toHaveLength(1);
      expect(approvals[0].action).toBe('rejected');
      expect(approvals[0].actor).toBe('user@example.com');
      expect(approvals[0].comment).toBe('Not suitable for our brand');
    });

    it('should handle Buffer draft deletion failures gracefully', async () => {
      mockBufferClient.deletePost.mockRejectedValue(new Error('Buffer API Error'));

      const result = await publisher.rejectPost('test-post', 'user@example.com');

      // Should still succeed (deletion is best-effort)
      expect(result.success).toBe(true);

      // Post should still be marked as REJECTED
      const updatedPost = repository.getPost('test-post');
      expect(updatedPost?.status).toBe('REJECTED');
    });

    it('should handle post not found', async () => {
      const result = await publisher.rejectPost('nonexistent-post', 'user@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Post not found');
    });
  });

  describe('getPostMetrics', () => {
    beforeEach(() => {
      // Create a published post
      repository.insertPost({
        id: 'published-post',
        platform: 'instagram',
        status: 'PUBLISHED',
        caption: 'Published post',
        hashtags: ['test'],
        mediaUrls: ['https://example.com/image.jpg'],
        scheduledAt: new Date(),
      });
      
      repository.updatePost('published-post', {
        buffer_draft_ids: JSON.stringify([
          { profileId: 'profile1', bufferId: 'buffer1', createdAt: new Date().toISOString() },
        ]),
      });
    });

    it('should fetch metrics for published post', async () => {
      const mockBufferPost = {
        id: 'buffer1',
        profile_service: 'instagram',
        sent_at: 1640995200,
        statistics: {
          reach: 1000,
          clicks: 50,
          favorites: 25,
          comments: 8,
        },
      };

      mockBufferClient.getPost.mockResolvedValue(mockBufferPost);

      const metrics = await publisher.getPostMetrics('published-post');

      expect(metrics).toEqual({
        profile1: {
          platform: 'instagram',
          statistics: mockBufferPost.statistics,
          sent_at: 1640995200,
        },
      });
    });

    it('should return null for non-published post', async () => {
      // Create a draft post
      repository.insertPost({
        id: 'draft-post',
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Draft post',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
      });

      const metrics = await publisher.getPostMetrics('draft-post');
      expect(metrics).toBeNull();
    });

    it('should handle Buffer API failures gracefully', async () => {
      mockBufferClient.getPost.mockRejectedValue(new Error('Buffer API Error'));

      const metrics = await publisher.getPostMetrics('published-post');

      // Should return empty object when no metrics could be fetched
      expect(metrics).toEqual({});
    });
  });

  describe('platform mapping', () => {
    const mockProfiles = [
      { id: 'ig-profile', service: 'instagram', service_username: 'test_ig' },
      { id: 'fb-profile', service: 'facebook', service_username: 'test_fb' },
      { id: 'tw-profile', service: 'twitter', service_username: 'test_tw' },
      { id: 'li-profile', service: 'linkedin', service_username: 'test_li' },
      { id: 'tt-profile', service: 'tiktok', service_username: 'test_tt' },
      { id: 'yt-profile', service: 'youtube', service_username: 'test_yt' },
    ];

    beforeEach(() => {
      mockBufferClient.getProfiles.mockResolvedValue(mockProfiles);
      mockBufferClient.createDraft.mockResolvedValue({ 'ig-profile': 'buffer1' });
    });

    it('should map platforms correctly', async () => {
      const testCases = [
        { platforms: ['instagram'], expectedProfiles: ['ig-profile'] },
        { platforms: ['instagram_reel'], expectedProfiles: ['ig-profile'] },
        { platforms: ['facebook'], expectedProfiles: ['fb-profile'] },
        { platforms: ['facebook_reel'], expectedProfiles: ['fb-profile'] },
        { platforms: ['twitter'], expectedProfiles: ['tw-profile'] },
        { platforms: ['linkedin'], expectedProfiles: ['li-profile'] },
        { platforms: ['linkedin_company'], expectedProfiles: ['li-profile'] },
        { platforms: ['tiktok'], expectedProfiles: ['tt-profile'] },
        { platforms: ['youtube_short'], expectedProfiles: ['yt-profile'] },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        mockBufferClient.getProfiles.mockResolvedValue(mockProfiles);
        mockBufferClient.createDraft.mockResolvedValue({ [testCase.expectedProfiles[0]]: 'buffer1' });

        const posts = [{
          id: 'test-post',
          text: 'Test post',
          mediaUrls: [],
          platforms: testCase.platforms,
        }];

        await publisher.createDrafts({ posts });

        // Check that createDraft was called with the correct profile IDs
        expect(mockBufferClient.createDraft).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Array),
          testCase.expectedProfiles
        );
      }
    });

    it('should handle multiple platforms with overlapping profiles', async () => {
      const posts = [{
        id: 'test-post',
        text: 'Test post',
        mediaUrls: [],
        platforms: ['instagram', 'instagram_reel'], // Both map to same profile
      }];

      mockBufferClient.createDraft.mockResolvedValue({ 'ig-profile': 'buffer1' });

      await publisher.createDrafts({ posts });

      // Should only call createDraft once with unique profile ID
      expect(mockBufferClient.createDraft).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        ['ig-profile'] // Deduplicated
      );
    });
  });
});