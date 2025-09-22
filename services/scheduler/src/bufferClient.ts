import { z } from 'zod';
import { config } from './config.js';

// Buffer API response schemas
const BufferProfileSchema = z.object({
  id: z.string(),
  service: z.string(),
  service_username: z.string(),
  service_name: z.string()
});

const BufferPostSchema = z.object({
  id: z.string(),
  text: z.string(),
  media: z.object({
    picture: z.string().optional(),
    thumbnail: z.string().optional(),
    video: z.string().optional()
  }).optional(),
  created_at: z.number(),
  scheduled_at: z.number().optional(),
  status: z.enum(['draft', 'pending', 'sent']),
  service_link: z.string().optional(),
  statistics: z.object({
    reach: z.number().optional(),
    impressions: z.number().optional(),
    engagements: z.number().optional()
  }).optional()
});

const BufferUpdateSchema = z.object({
  success: z.boolean(),
  buffer_count: z.number().optional(),
  buffer_percentage: z.number().optional(),
  updates: z.array(BufferPostSchema).optional()
});

export type BufferProfile = z.infer<typeof BufferProfileSchema>;
export type BufferPost = z.infer<typeof BufferPostSchema>;
export type BufferUpdate = z.infer<typeof BufferUpdateSchema>;

export class BufferClient {
  private accessToken: string;
  private baseUrl = 'https://api.bufferapp.com/1';

  constructor(accessToken: string = config.config.BUFFER_ACCESS_TOKEN) {
    this.accessToken = accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}?access_token=${this.accessToken}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Buffer API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data as T;
  }

  /**
   * Get all connected social media profiles
   */
  async getProfiles(): Promise<BufferProfile[]> {
    const data = await this.request('/profiles.json');
    return z.array(BufferProfileSchema).parse(data);
  }

  /**
   * Get profile by ID
   */
  async getProfile(profileId: string): Promise<BufferProfile> {
    const data = await this.request(`/profiles/${profileId}.json`);
    return BufferProfileSchema.parse(data);
  }

  /**
   * Create a draft post
   */
  async createDraft(profileIds: string[], text: string, options: {
    media?: {
      picture?: string;
      video?: string;
      thumbnail?: string;
    };
    scheduled_at?: Date;
    retweet?: boolean;
    attachment?: boolean;
  } = {}): Promise<BufferUpdate> {
    const payload: any = {
      profile_ids: profileIds,
      text,
      ...options.media && { media: options.media },
      ...options.scheduled_at && { scheduled_at: Math.floor(options.scheduled_at.getTime() / 1000) },
      ...options.retweet !== undefined && { retweet: options.retweet },
      ...options.attachment !== undefined && { attachment: options.attachment }
    };

    const data = await this.request('/updates/create.json', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return BufferUpdateSchema.parse(data);
  }

  /**
   * Update an existing draft post
   */
  async updateDraft(updateId: string, updates: {
    text?: string;
    media?: {
      picture?: string;
      video?: string;
      thumbnail?: string;
    };
    scheduled_at?: Date;
    profile_ids?: string[];
  }): Promise<BufferUpdate> {
    const payload: any = {
      ...updates.text && { text: updates.text },
      ...updates.media && { media: updates.media },
      ...updates.scheduled_at && { scheduled_at: Math.floor(updates.scheduled_at.getTime() / 1000) },
      ...updates.profile_ids && { profile_ids: updates.profile_ids }
    };

    const data = await this.request(`/updates/${updateId}/update.json`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return BufferUpdateSchema.parse(data);
  }

  /**
   * Get post details
   */
  async getPost(updateId: string): Promise<BufferPost> {
    const data = await this.request(`/updates/${updateId}.json`);
    return BufferPostSchema.parse(data);
  }

  /**
   * Delete a draft post
   */
  async deleteDraft(updateId: string): Promise<{ success: boolean }> {
    const data = await this.request(`/updates/${updateId}/destroy.json`, {
      method: 'POST'
    });

    return z.object({ success: z.boolean() }).parse(data);
  }

  /**
   * Move draft to scheduled queue
   */
  async scheduleDraft(updateId: string): Promise<BufferUpdate> {
    const data = await this.request(`/updates/${updateId}/share.json`, {
      method: 'POST'
    });

    return BufferUpdateSchema.parse(data);
  }

  /**
   * Get pending/scheduled posts
   */
  async getPendingPosts(profileId?: string): Promise<BufferPost[]> {
    const endpoint = profileId
      ? `/profiles/${profileId}/updates/pending.json`
      : '/updates/pending.json';

    const data = await this.request<any>(endpoint);
    return z.array(BufferPostSchema).parse(data.updates || data);
  }

  /**
   * Get sent posts
   */
  async getSentPosts(profileId?: string, options: {
    count?: number;
    since?: Date;
    page?: number;
  } = {}): Promise<BufferPost[]> {
    const params = new URLSearchParams();
    if (options.count) params.append('count', options.count.toString());
    if (options.since) params.append('since', Math.floor(options.since.getTime() / 1000).toString());
    if (options.page) params.append('page', options.page.toString());

    const query = params.toString();
    const endpoint = profileId
      ? `/profiles/${profileId}/updates/sent.json${query ? `?${query}` : ''}`
      : `/updates/sent.json${query ? `?${query}` : ''}`;

    const data = await this.request<any>(endpoint);
    return z.array(BufferPostSchema).parse(data.updates || data);
  }

  /**
   * Shuffle/update post order in queue
   */
  async reorderQueue(profileId: string, updateIds: string[]): Promise<{ success: boolean }> {
    const data = await this.request(`/profiles/${profileId}/updates/reorder.json`, {
      method: 'POST',
      body: JSON.stringify({
        order: updateIds
      })
    });

    return z.object({ success: z.boolean() }).parse(data);
  }

  /**
   * Get analytics for a post
   */
  async getPostAnalytics(updateId: string): Promise<{
    reach: number;
    impressions: number;
    engagements: number;
    clicks: number;
    favorites: number;
    retweets: number;
  }> {
    const data = await this.request(`/updates/${updateId}/analytics.json`);

    return z.object({
      reach: z.number(),
      impressions: z.number(),
      engagements: z.number(),
      clicks: z.number(),
      favorites: z.number(),
      retweets: z.number()
    }).parse(data);
  }
}