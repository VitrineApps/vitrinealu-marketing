import { beforeEach, describe, expect, it, vi } from 'vitest';

const envOverrides = vi.hoisted(() => ({
  OPENAI_API_KEY: 'test-openai',
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'worker@test',
    private_key: '-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n'
  }),
  SMTP_URL: 'smtp://user:pass@mail.local:587',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  RUNWAY_API_KEY: 'runway-test',
  PIKA_API_KEY: 'pika-test',
  TIMEZONE: 'Europe/London'
}));

Object.assign(process.env, envOverrides);

const enqueueMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/queue.js', () => ({
  enqueueAndWait: enqueueMock,
  mediaQueue: {
    getWaitingCount: vi.fn(async () => 0),
    getActiveCount: vi.fn(async () => 0),
    getCompletedCount: vi.fn(async () => 0)
  }
}));

import { createServer } from '../../server.js';

beforeEach(() => {
  enqueueMock.mockReset();
});

describe('media routes', () => {
  it('returns hash result', async () => {
    enqueueMock.mockResolvedValueOnce({ kind: 'hash', hash: 'abc123' });
    const app = createServer();
    const response = await app.inject({
      method: 'POST',
      url: '/hash',
      payload: { fileId: 'file-1' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sha256: 'abc123' });
    expect(enqueueMock).toHaveBeenCalledWith({ kind: 'hash', fileId: 'file-1' });
  });

  it('validates score payload', async () => {
    const app = createServer();
    const response = await app.inject({
      method: 'POST',
      url: '/score',
      payload: {}
    });
    expect(response.statusCode).toBe(400);
  });

  it('enhances with sourceUrl and sync', async () => {
    enqueueMock.mockResolvedValueOnce({
      kind: 'enhance',
      url: 'drive://enhanced.jpg',
      metadata: { provider: 'Noop' }
    });
    const app = createServer();
    const response = await app.inject({
      method: 'POST',
      url: '/enhance',
      payload: { sourceUrl: 'file:///e:/my_projects/vitrinealu-marketing/apps/worker/test/fixtures/bright.jpg', sync: 1 }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('url');
    expect(body).toHaveProperty('metadata');
    expect(body.metadata).toHaveProperty('provider');
  });
});
