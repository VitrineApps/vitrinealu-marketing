import { config } from './config.js';
import { CarouselDraftInput, CarouselDraftResult } from './types';
import pRetry from 'p-retry';
import pino from 'pino';

// Enhanced types for multi-image carousel support
export interface MediaItem {
  url: string;
  type?: 'image' | 'video';
  thumbnail?: string;
  alt_text?: string;
}

export interface CarouselBufferPayload {
  profile_ids: string[];
  text: string;
  media: {
    photos: MediaItem[];
  };
  scheduled_at?: number;
  link?: string;
  shorten?: boolean;
}

export interface BufferResponse {
  update: {
    id: string;
    media_attachments?: Array<{
      id: string;
      url: string;
      type: string;
    }>;
    service: string;
    status: string;
  };
}

// Error classes
export class RateLimitError extends Error {
  retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const logger = pino({ level: 'info' });

const PLATFORM_TEXT_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
};

export async function createCarouselDraft(input: CarouselDraftInput): Promise<CarouselDraftResult> {
  const minImages = Number(process.env.CAROUSEL_MIN_IMAGES || config.config.CAROUSEL_MIN_IMAGES || 2);
  const maxImages = Number(process.env.CAROUSEL_MAX_IMAGES || config.config.CAROUSEL_MAX_IMAGES || 10); // Buffer supports up to 10
  
  // Validate input
  if (!Array.isArray(input.mediaUrls) || input.mediaUrls.length < minImages) {
    throw new ValidationError(`Carousel must have at least ${minImages} images`);
  }
  if (input.mediaUrls.length > maxImages) {
    throw new ValidationError(`Carousel cannot have more than ${maxImages} images (Buffer limit)`);
  }
  if (!['instagram', 'facebook'].includes(input.platform)) {
    throw new ValidationError('Carousel platform must be instagram or facebook');
  }
  
  const textLimit = PLATFORM_TEXT_LIMITS[input.platform];
  if (input.text.length > textLimit) {
    throw new ValidationError(`Caption exceeds platform limit: ${input.text.length}/${textLimit} characters`);
  }
  
  const baseUrl = process.env.BUFFER_BASE_URL || config.config.BUFFER_BASE_URL || 'https://api.buffer.com/2/';
  const accessToken = process.env.BUFFER_ACCESS_TOKEN || config.config.BUFFER_ACCESS_TOKEN;
  if (!accessToken) throw new ValidationError('Missing BUFFER_ACCESS_TOKEN');
  const timeout = Number(process.env.HTTP_TIMEOUT_MS || config.config.HTTP_TIMEOUT_MS || 15000);

  // Create enhanced payload with proper media array structure
  const payload: CarouselBufferPayload = {
    profile_ids: [input.channelId],
    text: input.text,
    media: { 
      photos: input.mediaUrls.map((url, index) => ({
        url,
        type: 'image',
        alt_text: `Image ${index + 1} of ${input.mediaUrls.length}`
      }))
    },
    ...(input.scheduledAt && { scheduled_at: Math.floor(new Date(input.scheduledAt).getTime() / 1000) }),
    ...(input.link && { link: input.link }),
    shorten: false // Don't shorten URLs in carousel posts
  };

  const url = `${baseUrl.replace(/\/$/, '')}/updates/create.json`;

  function redact(str: string) {
    return str.replace(accessToken, '***REDACTED***');
  }

  return pRetry(async (attempt) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
    logger.info({
      msg: 'Creating carousel draft',
      attempt,
      url: redact(url),
      channelId: input.channelId,
      platform: input.platform,
      mediaCount: input.mediaUrls.length,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: any) {
      logger.error({ msg: 'Network error', err: err?.message });
  throw (pRetry as any).abort(new ApiError('Network error', 0));
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 1;
      logger.warn({ msg: 'Rate limited', retryAfter });
      throw new RateLimitError('Rate limited', retryAfter);
    }
    if (res.status >= 500) {
      logger.warn({ msg: 'Server error', status: res.status });
      throw new Error(`Server error ${res.status}`);
    }
    if (res.status >= 400) {
      const errBody = await res.text();
      logger.error({ msg: 'API error', status: res.status, errBody: redact(errBody) });
  throw (pRetry as any).abort(new ApiError(errBody, res.status));
    }
    const data = await res.json() as BufferResponse;
    
    // Validate Buffer response structure
    if (!data.update || !data.update.id) {
      logger.error({ msg: 'Malformed Buffer response', data });
      throw (pRetry as any).abort(new ApiError('Malformed response from Buffer API', 500));
    }

    // Log successful carousel creation
    logger.info({
      msg: 'Carousel draft created successfully',
      updateId: data.update.id,
      platform: data.update.service || input.platform,
      mediaCount: input.mediaUrls.length,
      status: data.update.status
    });

    return {
      updateId: data.update.id,
      mediaIds: (data.update.media_attachments || []).map((m: any) => m.id).filter(Boolean),
      platform: data.update.service || input.platform,
    };
  }, {
    retries: 4,
    minTimeout: 500,
    maxTimeout: 3000,
    randomize: true,
    onFailedAttempt: (err) => {
      // err is FailedAttemptError from p-retry
      const orig = err?.cause;
      if (orig instanceof RateLimitError && typeof orig.retryAfter === 'number' && orig.retryAfter > 0) {
        logger.warn({ msg: 'Retrying after rate limit', retryAfter: orig.retryAfter });
  return new Promise(res => setTimeout(res, (orig.retryAfter ?? 1) * 1000));
      }
    },
  });
}

async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = (process.env.BUFFER_BASE_URL || config.config.BUFFER_BASE_URL || 'https://api.buffer.com/2/').replace(/\/$/, '');
  const accessToken = process.env.BUFFER_ACCESS_TOKEN || config.config.BUFFER_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ValidationError('Missing BUFFER_ACCESS_TOKEN');
  }
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    ...(init.headers || {}),
  } as Record<string, string>;
  const response = await fetch(`${baseUrl}${url}`, { ...init, headers });
  return response;
}

export class BufferClient {
  async createCarouselDraft(input: CarouselDraftInput): Promise<CarouselDraftResult> {
    return createCarouselDraft(input);
  }

  async createDraft(profileIds: string[], text: string, mediaUrls: string[], scheduledAt?: Date): Promise<string> {
    // For single image/video posts
    const payload = {
      profile_ids: profileIds,
      text,
      media: {
        photo: mediaUrls[0], // For single media
      },
      ...(scheduledAt && { scheduled_at: Math.floor(scheduledAt.getTime() / 1000) }),
    };

    const baseUrl = process.env.BUFFER_BASE_URL || config.config.BUFFER_BASE_URL || 'https://api.buffer.com/2/';
    const accessToken = process.env.BUFFER_ACCESS_TOKEN || config.config.BUFFER_ACCESS_TOKEN;
    const url = `${baseUrl.replace(/\/$/, '')}/updates/create.json`;

    return pRetry(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Buffer API error: ${response.status} ${body}`);
      }

      const data = await response.json() as BufferResponse;
      return data.update.id;
    }, {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
    });
  }

  async publish(updateId: string): Promise<void> {
    await this.postUpdateAction(updateId, 'share');
  }

  async scheduleDraft(updateId: string): Promise<void> {
    await this.postUpdateAction(updateId, 'share');
  }

  async deleteDraft(updateId: string): Promise<void> {
    await this.postUpdateAction(updateId, 'destroy');
  }

  private async postUpdateAction(updateId: string, action: 'share' | 'destroy'): Promise<void> {
    const response = await authorizedFetch(`/updates/${updateId}/${action}.json`, { method: 'POST' });
    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(`Buffer ${action} failed: ${body}`, response.status);
    }
  }
}
