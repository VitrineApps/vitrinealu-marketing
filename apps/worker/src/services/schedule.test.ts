import { describe, it, expect, vi, beforeEach } from 'vitest';
import { schedulePosts } from './schedule.js';

// Mock config
vi.mock('../config.js', () => ({
  env: {
    BUFFER_ACCESS_TOKEN: 'test-token'
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('schedulePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockClear();
  });

  it('should schedule posts successfully', async () => {
    const mockResponse = {
      update: { id: 'buffer-id-123' }
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponse)
    } as any);

    const posts = [
      {
        mediaUrl: 'https://example.com/image.jpg',
        caption: 'Test caption',
        scheduledAt: '2025-09-22T10:00:00Z',
        profileIds: ['profile-1', 'profile-2']
      }
    ];

    const result = await schedulePosts(posts);

    expect(result).toEqual([
      { bufferId: 'buffer-id-123', profileId: 'profile-1' },
      { bufferId: 'buffer-id-123', profileId: 'profile-2' }
    ]);

    expect(global.fetch).toHaveBeenCalledWith('https://api.bufferapp.com/1/updates/create.json', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Test caption',
        profile_ids: ['profile-1', 'profile-2'],
        now: false,
        draft: false,
        scheduled_at: '2025-09-22T10:00:00Z',
        media: { link: 'https://example.com/image.jpg' }
      })
    });
  });

  it('should retry on 429 with exponential backoff', async () => {
    const mockResponse = {
      update: { id: 'buffer-id-456' }
    };

    let callCount = 0;
    vi.mocked(global.fetch).mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 429
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse)
      } as any);
    });

    const posts = [
      {
        mediaUrl: 'https://example.com/image.jpg',
        caption: 'Test caption',
        scheduledAt: '2025-09-22T10:00:00Z',
        profileIds: ['profile-1']
      }
    ];

    const result = await schedulePosts(posts);

    expect(result).toEqual([{ bufferId: 'buffer-id-456', profileId: 'profile-1' }]);
    expect(callCount).toBe(3); // 2 retries + 1 success
  });

  it('should throw error after max retries', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 429
    } as any);

    const posts = [
      {
        mediaUrl: 'https://example.com/image.jpg',
        caption: 'Test caption',
        scheduledAt: '2025-09-22T10:00:00Z',
        profileIds: ['profile-1']
      }
    ];

    await expect(schedulePosts(posts)).rejects.toThrow('Max attempts exceeded');
  });
});