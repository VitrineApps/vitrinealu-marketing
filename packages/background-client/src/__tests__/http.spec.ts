import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../http';
import { BackgroundClientError, BackgroundNetworkError, BackgroundTimeoutError } from '../types';

const baseUrl = 'http://localhost:9999';
const config = { baseUrl, timeout: 100, retryAttempts: 2, retryDelay: 10 };

function mockFetch(status: number, body: any, delay = 0) {
  global.fetch = vi.fn().mockImplementation(() =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (status === 408) return reject(new Error('Timeout'));
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: status === 500 ? 'Internal Server Error' : 'OK',
          json: async () => body,
          text: async () => JSON.stringify(body),
        });
      }, delay);
    })
  ) as any;
}

describe('HttpClient', () => {
  let client: HttpClient;
  beforeEach(() => {
    client = new HttpClient(config as any);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should succeed on 200', async () => {
    mockFetch(200, { success: true, outputPath: '/foo.png' });
    const res = await client.replace({ imagePath: __filename, prompt: 'a' });
    expect(res.success).toBe(true);
    expect(res.outputPath).toBe('/foo.png');
  });

  it('should retry on 5xx', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      call++;
      if (call < 2) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({}),
          text: async () => 'fail',
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ success: true, outputPath: '/bar.png' }),
        text: async () => '',
      });
    }) as any;
    const res = await client.replace({ imagePath: __filename, prompt: 'b' });
    expect(res.success).toBe(true);
    expect(res.outputPath).toBe('/bar.png');
  });

  it('should throw on timeout', async () => {
    mockFetch(200, { success: true }, 200);
    await expect(client.replace({ imagePath: __filename, prompt: 'c' })).rejects.toBeInstanceOf(BackgroundTimeoutError);
  });
});
