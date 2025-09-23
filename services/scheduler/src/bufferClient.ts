import { config } from './config.js';
import { CarouselDraftInput, CarouselDraftResult } from './types';
import pRetry from 'p-retry';
import pino from 'pino';

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
  const maxImages = Number(process.env.CAROUSEL_MAX_IMAGES || config.config.CAROUSEL_MAX_IMAGES || 5);
  if (!Array.isArray(input.mediaUrls) || input.mediaUrls.length < minImages || input.mediaUrls.length > maxImages) {
    throw new ValidationError(`Carousel must have between ${minImages} and ${maxImages} images`);
  }
  if (!['instagram', 'facebook'].includes(input.platform)) {
    throw new ValidationError('Platform must be instagram or facebook');
  }
  const textLimit = PLATFORM_TEXT_LIMITS[input.platform];
  if (input.text.length > textLimit) {
    throw new ValidationError(`Text exceeds platform limit (${textLimit})`);
  }
  const baseUrl = process.env.BUFFER_BASE_URL || config.config.BUFFER_BASE_URL || 'https://api.buffer.com/2/';
  const accessToken = process.env.BUFFER_ACCESS_TOKEN || config.config.BUFFER_ACCESS_TOKEN;
  if (!accessToken) throw new ValidationError('Missing BUFFER_ACCESS_TOKEN');
  const timeout = Number(process.env.HTTP_TIMEOUT_MS || config.config.HTTP_TIMEOUT_MS || 15000);

  const payload: any = {
    profile_ids: [input.channelId],
    text: input.text,
    media: { photos: input.mediaUrls.map(url => ({ url })) },
    ...(input.scheduledAt && { scheduled_at: Math.floor(new Date(input.scheduledAt).getTime() / 1000) }),
    ...(input.link && { link: input.link }),
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
    const data: any = await res.json();
    // Buffer v2: { update: { id, media_attachments, service } }
    if (!data.update || !data.update.id) {
      logger.error({ msg: 'Malformed response', data });
  throw (pRetry as any).abort(new ApiError('Malformed response', 500));
    }
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