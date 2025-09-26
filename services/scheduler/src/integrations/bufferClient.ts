import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from './logger.js';

export interface BufferProfile {
  id: string;
  service: string;
  service_username: string;
  service_id: string;
  formatted_service: string;
  formatted_username: string;
  avatar: string;
  timezone: string;
  schedules?: Array<{
    days: string[];
    times: string[];
  }>;
}

export interface BufferPost {
  id: string;
  text: string;
  html: string;
  due_at: number;
  due_time: string;
  via: string;
  state: 'buffer' | 'sent' | 'failed';
  published_text: string;
  created_at: number;
  updated_at: number;
  scheduled_at: number;
  sent_at?: number;
  client_id: string;
  profile_id: string;
  profile_service: string;
  user_id: string;
  statistics?: {
    reach: number;
    clicks: number;
    retweets: number;
    favorites: number;
    mentions: number;
    shares: number;
    comments: number;
  };
  media?: Array<{
    link: string;
    description: string;
    picture: string;
    thumbnail: string;
  }>;
}

export interface CreateDraftRequest {
  text: string;
  media?: {
    link?: string;
    description?: string;
    photo?: string;
    picture?: string;
    thumbnail?: string;
  }[];
  scheduled_at?: number;
  shorten?: boolean;
  now?: boolean;
}

export interface CreateDraftResponse {
  success: boolean;
  buffer_count: number;
  buffer_percentage: number;
  updates: BufferPost[];
}

export interface BufferError {
  code: number;
  message: string;
  error?: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  jitter: boolean;
}

/**
 * Buffer API client with comprehensive error handling, retries, and rate limiting
 */
export class BufferClient {
  private readonly client: AxiosInstance;
  private readonly retryConfig: RetryConfig;

  constructor(
    private readonly accessToken: string,
    options: {
      baseURL?: string;
      timeout?: number;
      retryConfig?: Partial<RetryConfig>;
    } = {}
  ) {
    if (!accessToken) {
      throw new Error('Buffer access token is required');
    }

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      jitter: true,
      ...options.retryConfig,
    };

    this.client = axios.create({
      baseURL: options.baseURL || 'https://api.bufferapp.com/1',
      timeout: options.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'VitrineAlu-Marketing/1.0',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug({ 
          method: config.method?.toUpperCase(), 
          url: config.url,
          profileIds: config.data?.profile_ids,
        }, 'Buffer API request');
        return config;
      },
      (error) => {
        logger.error({ error }, 'Buffer API request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug({ 
          status: response.status, 
          url: response.config.url,
          success: response.data?.success,
        }, 'Buffer API response');
        return response;
      },
      (error) => {
        this.logError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get user profiles
   */
  async getProfiles(): Promise<BufferProfile[]> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<BufferProfile[]>('/profiles.json');
      return response.data;
    });
  }

  /**
   * Create draft posts for multiple profiles
   * @param post Post content and metadata
   * @param media Array of media URLs/objects
   * @param profileIds Array of Buffer profile IDs
   * @returns Object mapping profile ID to Buffer post ID
   */
  async createDraft(
    post: { text: string; scheduledAt?: Date },
    media: Array<{ url: string; description?: string }>,
    profileIds: string[]
  ): Promise<Record<string, string>> {
    if (!profileIds.length) {
      throw new Error('At least one profile ID is required');
    }

    const draftIds: Record<string, string> = {};
    
    // Create drafts for each profile individually to handle different platform requirements
    await Promise.allSettled(
      profileIds.map(async (profileId) => {
        try {
          const bufferMedia = media.map(item => ({
            link: item.url,
            description: item.description || '',
            photo: item.url,
            picture: item.url,
            thumbnail: item.url,
          }));

          const requestBody: CreateDraftRequest = {
            text: post.text,
            media: bufferMedia.length > 0 ? bufferMedia : undefined,
            scheduled_at: post.scheduledAt ? Math.floor(post.scheduledAt.getTime() / 1000) : undefined,
            shorten: true,
            now: false, // Always create as draft, never publish immediately
          };

          const response = await this.executeWithRetry(async () => {
            const result = await this.client.post<CreateDraftResponse>(
              `/updates/create.json?profile_ids[]=${profileId}`,
              requestBody
            );
            return result;
          });

          if (response.data.success && response.data.updates.length > 0) {
            draftIds[profileId] = response.data.updates[0].id;
            logger.info({ 
              profileId, 
              bufferId: response.data.updates[0].id,
              text: post.text.substring(0, 100) + '...',
            }, 'Buffer draft created successfully');
          } else {
            logger.warn({ profileId, response: response.data }, 'Buffer draft creation returned no updates');
          }
        } catch (error) {
          logger.error({ 
            profileId, 
            error: error instanceof Error ? error.message : error 
          }, 'Failed to create Buffer draft for profile');
          // Don't throw here - let other profiles succeed
        }
      })
    );

    if (Object.keys(draftIds).length === 0) {
      throw new Error('Failed to create drafts for any profiles');
    }

    return draftIds;
  }

  /**
   * Publish a draft post
   * @param bufferId Buffer post ID
   */
  async publish(bufferId: string): Promise<void> {
    await this.executeWithRetry(async () => {
      const response = await this.client.post(`/updates/${bufferId}/share.json`);
      
      if (!response.data.success) {
        throw new Error(`Failed to publish Buffer post ${bufferId}: ${response.data.message || 'Unknown error'}`);
      }

      logger.info({ bufferId }, 'Buffer post published successfully');
    });
  }

  /**
   * Get post details and statistics
   * @param bufferId Buffer post ID
   */
  async getPost(bufferId: string): Promise<BufferPost> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<BufferPost>(`/updates/${bufferId}.json`);
      return response.data;
    });
  }

  /**
   * Get posts for a profile with optional date range
   * @param profileId Buffer profile ID
   * @param options Query options
   */
  async getPostsForProfile(
    profileId: string,
    options: {
      status?: 'sent' | 'buffer' | 'failed';
      since?: Date;
      until?: Date;
      count?: number;
    } = {}
  ): Promise<BufferPost[]> {
    return this.executeWithRetry(async () => {
      const params = new URLSearchParams();
      
      if (options.status) params.append('status', options.status);
      if (options.since) params.append('since', Math.floor(options.since.getTime() / 1000).toString());
      if (options.until) params.append('until', Math.floor(options.until.getTime() / 1000).toString());
      if (options.count) params.append('count', options.count.toString());

      const response = await this.client.get<{ updates: BufferPost[] }>(
        `/profiles/${profileId}/updates.json?${params.toString()}`
      );
      
      return response.data.updates || [];
    });
  }

  /**
   * Delete a post
   * @param bufferId Buffer post ID
   */
  async deletePost(bufferId: string): Promise<void> {
    await this.executeWithRetry(async () => {
      const response = await this.client.post(`/updates/${bufferId}/destroy.json`);
      
      if (!response.data.success) {
        throw new Error(`Failed to delete Buffer post ${bufferId}: ${response.data.message || 'Unknown error'}`);
      }

      logger.info({ bufferId }, 'Buffer post deleted successfully');
    });
  }

  /**
   * Execute a function with exponential backoff retry logic
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.retryConfig.maxRetries) {
          break; // Don't retry on last attempt
        }

        if (!this.isRetryableError(error)) {
          logger.debug({ error: lastError.message }, 'Non-retryable error, not retrying');
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        logger.warn({ 
          attempt: attempt + 1, 
          maxRetries: this.retryConfig.maxRetries + 1,
          delayMs: delay,
          error: lastError.message,
        }, 'Buffer API request failed, retrying');
        
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );

    if (this.retryConfig.jitter) {
      // Add jitter: random value between 0.5 and 1.5 times the delay
      const jitterFactor = 0.5 + Math.random();
      return Math.floor(exponentialDelay * jitterFactor);
    }

    return exponentialDelay;
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      // Retry on network errors
      if (!error.response) {
        return true;
      }

      const status = error.response.status;
      
      // Retry on server errors and rate limits
      if (status >= 500 || status === 429) {
        return true;
      }

      // Don't retry on client errors (4xx except 429)
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Retry on timeout and network errors
    if (error instanceof Error) {
      return error.message.includes('timeout') || 
             error.message.includes('ECONNRESET') ||
             error.message.includes('ETIMEDOUT');
    }

    return false;
  }

  /**
   * Log detailed error information
   */
  private logError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<BufferError>;
      logger.error({
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        method: axiosError.config?.method?.toUpperCase(),
        url: axiosError.config?.url,
        code: axiosError.response?.data?.code,
        message: axiosError.response?.data?.message || axiosError.message,
        error: axiosError.response?.data?.error,
      }, 'Buffer API error');
    } else {
      logger.error({ error }, 'Unexpected Buffer API error');
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}