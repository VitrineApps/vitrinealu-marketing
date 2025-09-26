import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { BufferClient } from '../integrations/bufferClient.js';

describe('BufferClient', () => {
  let client: BufferClient;
  const mockAccessToken = 'test-buffer-token';
  const baseURL = 'https://api.bufferapp.com/1';

  beforeEach(() => {
    client = new BufferClient(mockAccessToken, {
      retryConfig: {
        maxRetries: 1, // Reduce retries for faster tests
        baseDelay: 100,
        maxDelay: 500,
        jitter: false,
      },
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should throw error if no access token provided', () => {
      expect(() => new BufferClient('')).toThrow('Buffer access token is required');
    });

    it('should create client with default options', () => {
      expect(() => new BufferClient(mockAccessToken)).not.toThrow();
    });
  });

  describe('getProfiles', () => {
    it('should fetch user profiles successfully', async () => {
      const mockProfiles = [
        {
          id: 'profile1',
          service: 'instagram',
          service_username: 'test_instagram',
          service_id: '123456',
          formatted_service: 'Instagram',
          formatted_username: '@test_instagram',
          avatar: 'https://example.com/avatar.jpg',
          timezone: 'Europe/London',
        },
        {
          id: 'profile2',
          service: 'twitter',
          service_username: 'test_twitter',
          service_id: '789012',
          formatted_service: 'Twitter',
          formatted_username: '@test_twitter',
          avatar: 'https://example.com/avatar2.jpg',
          timezone: 'Europe/London',
        },
      ];

      nock(baseURL)
        .get('/profiles.json')
        .reply(200, mockProfiles);

      const profiles = await client.getProfiles();

      expect(profiles).toEqual(mockProfiles);
      expect(profiles).toHaveLength(2);
      expect(profiles[0].service).toBe('instagram');
      expect(profiles[1].service).toBe('twitter');
    });

    it('should retry on 500 error', async () => {
      const mockProfiles = [{ id: 'profile1', service: 'instagram' }];

      nock(baseURL)
        .get('/profiles.json')
        .reply(500, { error: 'Internal Server Error' })
        .get('/profiles.json')
        .reply(200, mockProfiles);

      const profiles = await client.getProfiles();
      expect(profiles).toEqual(mockProfiles);
    });

    it('should not retry on 400 error', async () => {
      nock(baseURL)
        .get('/profiles.json')
        .reply(400, { error: 'Bad Request' });

      await expect(client.getProfiles()).rejects.toThrow();
    });
  });

  describe('createDraft', () => {
    const mockPost = {
      text: 'Test post content #test',
      scheduledAt: new Date('2025-01-01T12:00:00Z'),
    };
    const mockMedia = [
      { url: 'https://example.com/image1.jpg', description: 'Test image 1' },
      { url: 'https://example.com/image2.jpg', description: 'Test image 2' },
    ];
    const mockProfileIds = ['profile1', 'profile2'];

    it('should create drafts for multiple profiles successfully', async () => {
      const mockResponse1 = {
        success: true,
        buffer_count: 1,
        buffer_percentage: 100,
        updates: [{ id: 'update1', text: mockPost.text, profile_id: 'profile1' }],
      };

      const mockResponse2 = {
        success: true,
        buffer_count: 1,
        buffer_percentage: 100,
        updates: [{ id: 'update2', text: mockPost.text, profile_id: 'profile2' }],
      };

      nock(baseURL)
        .post('/updates/create.json?profile_ids[]=profile1')
        .reply(200, mockResponse1)
        .post('/updates/create.json?profile_ids[]=profile2')
        .reply(200, mockResponse2);

      const result = await client.createDraft(mockPost, mockMedia, mockProfileIds);

      expect(result).toEqual({
        profile1: 'update1',
        profile2: 'update2',
      });
    });

    it('should handle partial failures gracefully', async () => {
      const mockResponse1 = {
        success: true,
        buffer_count: 1,
        buffer_percentage: 100,
        updates: [{ id: 'update1', text: mockPost.text, profile_id: 'profile1' }],
      };

      nock(baseURL)
        .post('/updates/create.json?profile_ids[]=profile1')
        .reply(200, mockResponse1)
        .post('/updates/create.json?profile_ids[]=profile2')
        .reply(500, { error: 'Internal Server Error' });

      const result = await client.createDraft(mockPost, mockMedia, mockProfileIds);

      expect(result).toEqual({
        profile1: 'update1',
      });
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('should fail if no profiles succeed', async () => {
      nock(baseURL)
        .post('/updates/create.json?profile_ids[]=profile1')
        .reply(500, { error: 'Internal Server Error' })
        .post('/updates/create.json?profile_ids[]=profile2')
        .reply(500, { error: 'Internal Server Error' });

      await expect(client.createDraft(mockPost, mockMedia, mockProfileIds))
        .rejects.toThrow('Failed to create drafts for any profiles');
    });

    it('should handle empty profile list', async () => {
      await expect(client.createDraft(mockPost, mockMedia, []))
        .rejects.toThrow('At least one profile ID is required');
    });

    it('should include correct media format in request', async () => {
      const mockResponse = {
        success: true,
        buffer_count: 1,
        buffer_percentage: 100,
        updates: [{ id: 'update1', text: mockPost.text, profile_id: 'profile1' }],
      };

      const expectedRequest = {
        text: mockPost.text,
        media: [
          {
            link: 'https://example.com/image1.jpg',
            description: 'Test image 1',
            photo: 'https://example.com/image1.jpg',
            picture: 'https://example.com/image1.jpg',
            thumbnail: 'https://example.com/image1.jpg',
          },
          {
            link: 'https://example.com/image2.jpg',
            description: 'Test image 2',
            photo: 'https://example.com/image2.jpg',
            picture: 'https://example.com/image2.jpg',
            thumbnail: 'https://example.com/image2.jpg',
          },
        ],
        scheduled_at: Math.floor(mockPost.scheduledAt.getTime() / 1000),
        shorten: true,
        now: false,
      };

      const scope = nock(baseURL)
        .post('/updates/create.json?profile_ids[]=profile1', expectedRequest)
        .reply(200, mockResponse);

      await client.createDraft(mockPost, mockMedia, ['profile1']);

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('publish', () => {
    it('should publish a draft successfully', async () => {
      const bufferId = 'update123';
      const mockResponse = { success: true };

      nock(baseURL)
        .post(`/updates/${bufferId}/share.json`)
        .reply(200, mockResponse);

      await expect(client.publish(bufferId)).resolves.not.toThrow();
    });

    it('should handle publish failure', async () => {
      const bufferId = 'update123';
      const mockResponse = { 
        success: false, 
        message: 'Post already published' 
      };

      nock(baseURL)
        .post(`/updates/${bufferId}/share.json`)
        .reply(200, mockResponse);

      await expect(client.publish(bufferId))
        .rejects.toThrow('Failed to publish Buffer post update123: Post already published');
    });

    it('should retry on 429 rate limit', async () => {
      const bufferId = 'update123';
      const mockResponse = { success: true };

      nock(baseURL)
        .post(`/updates/${bufferId}/share.json`)
        .reply(429, { error: 'Rate limited' })
        .post(`/updates/${bufferId}/share.json`)
        .reply(200, mockResponse);

      await expect(client.publish(bufferId)).resolves.not.toThrow();
    });
  });

  describe('getPost', () => {
    it('should fetch post details successfully', async () => {
      const bufferId = 'update123';
      const mockPost = {
        id: bufferId,
        text: 'Test post',
        html: '<p>Test post</p>',
        due_at: 1640995200,
        due_time: '12:00:00',
        via: 'api',
        state: 'sent' as const,
        published_text: 'Test post',
        created_at: 1640908800,
        updated_at: 1640995200,
        scheduled_at: 1640995200,
        sent_at: 1640995200,
        client_id: 'client123',
        profile_id: 'profile1',
        profile_service: 'instagram',
        user_id: 'user1',
        statistics: {
          reach: 1000,
          clicks: 50,
          retweets: 5,
          favorites: 25,
          mentions: 2,
          shares: 10,
          comments: 8,
        },
      };

      nock(baseURL)
        .get(`/updates/${bufferId}.json`)
        .reply(200, mockPost);

      const result = await client.getPost(bufferId);
      expect(result).toEqual(mockPost);
      expect(result.statistics?.reach).toBe(1000);
    });
  });

  describe('getPostsForProfile', () => {
    it('should fetch posts for profile with options', async () => {
      const profileId = 'profile1';
      const mockPosts = [
        { id: 'update1', text: 'Post 1', state: 'sent' },
        { id: 'update2', text: 'Post 2', state: 'buffer' },
      ];

      const options = {
        status: 'sent' as const,
        since: new Date('2025-01-01T00:00:00Z'),
        until: new Date('2025-01-02T00:00:00Z'),
        count: 10,
      };

      const expectedParams = new URLSearchParams({
        status: 'sent',
        since: '1735689600', // Unix timestamp
        until: '1735776000', // Unix timestamp
        count: '10',
      });

      nock(baseURL)
        .get(`/profiles/${profileId}/updates.json?${expectedParams.toString()}`)
        .reply(200, { updates: mockPosts });

      const result = await client.getPostsForProfile(profileId, options);
      expect(result).toEqual(mockPosts);
    });
  });

  describe('deletePost', () => {
    it('should delete a post successfully', async () => {
      const bufferId = 'update123';
      const mockResponse = { success: true };

      nock(baseURL)
        .post(`/updates/${bufferId}/destroy.json`)
        .reply(200, mockResponse);

      await expect(client.deletePost(bufferId)).resolves.not.toThrow();
    });

    it('should handle delete failure', async () => {
      const bufferId = 'update123';
      const mockResponse = { 
        success: false, 
        message: 'Post not found' 
      };

      nock(baseURL)
        .post(`/updates/${bufferId}/destroy.json`)
        .reply(200, mockResponse);

      await expect(client.deletePost(bufferId))
        .rejects.toThrow('Failed to delete Buffer post update123: Post not found');
    });
  });

  describe('retry logic', () => {
    it('should respect exponential backoff', async () => {
      const startTime = Date.now();

      nock(baseURL)
        .get('/profiles.json')
        .reply(500, { error: 'Server Error' })
        .get('/profiles.json')
        .reply(200, []);

      await client.getProfiles();

      const elapsed = Date.now() - startTime;
      // Should have waited at least the base delay (100ms)
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should not retry on 404 error', async () => {
      nock(baseURL)
        .get('/profiles.json')
        .reply(404, { error: 'Not Found' });

      await expect(client.getProfiles()).rejects.toThrow();
      
      // Should not have retried (nock would throw if extra requests were made)
    });

    it('should retry on network timeout', async () => {
      const client = new BufferClient(mockAccessToken, {
        timeout: 100, // Very short timeout to trigger timeout
        retryConfig: {
          maxRetries: 1,
          baseDelay: 50,
          maxDelay: 100,
          jitter: false,
        },
      });

      nock(baseURL)
        .get('/profiles.json')
        .delay(150) // Delay longer than timeout
        .reply(200, []);

      // Should still succeed after retry with timeout
      nock(baseURL)
        .get('/profiles.json')
        .reply(200, [{ id: 'profile1' }]);

      const result = await client.getProfiles();
      expect(result).toHaveLength(1);
    });
  });
});