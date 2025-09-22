import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

import { BufferClient } from '../src/bufferClient.js';

describe('BufferClient', () => {
  let client: BufferClient;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    client = new BufferClient('test-token');
    mockFetch.mockClear();
  });

  describe('createDraft', () => {
    it('should create a draft post successfully', async () => {
      const mockResponse = {
        success: true,
        buffer_count: 1,
        buffer_percentage: 100,
        updates: [{
          id: 'update-123',
          text: 'Test post',
          created_at: Math.floor(Date.now() / 1000),
          status: 'draft'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const result = await client.createDraft(
        ['profile-123'],
        'Test post',
        { scheduled_at: new Date('2024-01-01T10:00:00Z') }
      );

      expect(result.success).toBe(true);
      expect(result.updates).toHaveLength(1);
      expect(result.updates![0].id).toBe('update-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bufferapp.com/1/updates/create.json?access_token=test-token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test post')
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid profile ID')
      } as Response);

      await expect(client.createDraft(['invalid-profile'], 'Test'))
        .rejects
        .toThrow('Buffer API error: 400 Invalid profile ID');
    });
  });

  describe('scheduleDraft', () => {
    it('should schedule a draft post', async () => {
      const mockResponse = {
        success: true,
        updates: [{
          id: 'update-123',
          text: 'Test post',
          created_at: Math.floor(Date.now() / 1000),
          status: 'pending'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const result = await client.scheduleDraft('update-123');

      expect(result.success).toBe(true);
      expect(result.updates![0].status).toBe('pending');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bufferapp.com/1/updates/update-123/share.json?access_token=test-token',
        { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
  });

  describe('getProfiles', () => {
    it('should retrieve user profiles', async () => {
      const mockResponse = [{
        id: 'profile-123',
        service: 'instagram',
        service_username: 'testuser',
        service_name: 'Instagram'
      }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const profiles = await client.getProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe('profile-123');
      expect(profiles[0].service).toBe('instagram');
    });
  });

  describe('getPendingPosts', () => {
    it('should retrieve pending posts', async () => {
      const mockResponse = {
        updates: [{
          id: 'update-123',
          text: 'Pending post',
          status: 'pending',
          created_at: Math.floor(Date.now() / 1000),
          scheduled_at: Math.floor(Date.now() / 1000) + 3600
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const posts = await client.getPendingPosts();

      expect(posts).toHaveLength(1);
      expect(posts[0].status).toBe('pending');
    });

    it('should retrieve pending posts for specific profile', async () => {
      const mockResponse = {
        updates: [{
          id: 'update-123',
          text: 'Profile specific post',
          created_at: Math.floor(Date.now() / 1000),
          status: 'pending'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const posts = await client.getPendingPosts('profile-123');

      expect(posts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bufferapp.com/1/profiles/profile-123/updates/pending.json?access_token=test-token',
        { headers: { 'Content-Type': 'application/json' } }
      );
    });
  });

  describe('deleteDraft', () => {
    it('should delete a draft post', async () => {
      const mockResponse = { success: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const result = await client.deleteDraft('update-123');

      expect(result.success).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.bufferapp.com/1/updates/update-123/destroy.json?access_token=test-token',
        { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
  });
});