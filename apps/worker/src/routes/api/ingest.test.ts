import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createServer } from '../../server.js';
import { env } from '../../config.js';

describe('ingest integration', () => {
  let server: any;
  const mswServer = setupServer();

  beforeEach(() => {
    mswServer.listen();
    server = createServer();
  });

  afterEach(() => {
    mswServer.close();
    vi.clearAllMocks();
  });

  describe('POST /ingest/local/enqueue', () => {
    it('processes files through enhance pipeline', async () => {
      // Mock Enhance API
      mswServer.use(
        http.post(`${env.ENHANCE_SERVICE_URL}/background/clean`, () => {
          return HttpResponse.json({
            assetId: 'test-asset-id',
            outputUrl: 'http://example.com/enhanced.jpg',
            metadata: {
              engine: 'test',
              mode: 'clean',
              processing_time_ms: 1000,
              dimensions: { width: 1920, height: 1080 },
              validations: ['dimensions_preserved']
            }
          });
        })
      );

      // Mock drive helpers
      const mockDriveHelpers = await import('../../lib/drive.js');
      vi.spyOn(mockDriveHelpers, 'driveHelpers', 'get').mockReturnValue({
        uploadFile: vi.fn().mockResolvedValue({ id: 'file-id', webContentLink: 'http://example.com/file.jpg' }),
        ensureSourcePath: vi.fn().mockResolvedValue('source-folder'),
        getFileMetadata: vi.fn().mockResolvedValue({ name: 'test.jpg', mimeType: 'image/jpeg' }),
        downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('test'), cachePath: '/tmp/test' })
      });

      // Mock queue
      const mockEnqueueAndWait = vi.fn().mockResolvedValue({
        kind: 'enhance',
        url: 'http://example.com/enhanced.jpg',
        metadata: { provider: 'test', scale: 1, ms: 100 }
      });
      vi.doMock('../lib/queue.js', () => ({
        enqueueAndWait: mockEnqueueAndWait
      }));

      const response = await server.inject({
        method: 'POST',
        url: '/ingest/local/enqueue',
        payload: { paths: ['/host/input/test.jpg'] }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body[0].assetId).toBe('file-id');
      expect(body[0].enhanceUrl).toBe('http://example.com/enhanced.jpg');
    });
  });
});