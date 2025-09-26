import { describe, it, expect } from 'vitest';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { backgroundCleanupJob, backgroundReplaceJob } from './backgroundReplace.js';
import type { BackgroundCleanupJobData, BackgroundReplaceJobData } from './types.js';

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Background Replacement Integration', () => {
  it('should export backgroundCleanupJob function', async () => {
    expect(backgroundCleanupJob).toBeDefined();
    expect(typeof backgroundCleanupJob).toBe('function');
  });

  it('should export backgroundReplaceJob function', async () => {
    expect(backgroundReplaceJob).toBeDefined();
    expect(typeof backgroundReplaceJob).toBe('function');
  });

  it('should have proper function signatures', async () => {
    expect(backgroundCleanupJob.constructor.name).toBe('AsyncFunction');
    expect(backgroundReplaceJob.constructor.name).toBe('AsyncFunction');
  });

  it('should process background cleanup with mocked FastAPI', async () => {
    const inputBuffer = Buffer.from('fake input image');
    const outputBuffer = Buffer.from('fake output image with watermark and alpha');

    server.use(
      rest.post('http://localhost:8000/background/clean', (req, res, ctx) => {
        return res(ctx.json({
          assetId: 'test-asset',
          outputUrl: 'http://localhost:8000/assets/ready/test.jpg',
          metadata: {
            engine: 'gemini',
            mode: 'clean',
            processing_time_ms: 1000,
            dimensions: { width: 100, height: 100 },
            validations: ['watermark applied', 'blur applied']
          }
        }));
      }),
      rest.get('http://localhost:8000/assets/ready/test.jpg', (req, res, ctx) => {
        return res(ctx.body(outputBuffer));
      })
    );

    const data: BackgroundCleanupJobData = {
      fileId: 'test-file-id',
      mode: 'clean'
    };

    // Mock drive helpers
    const driveHelpers = await import('../lib/drive.js');
    const originalDownload = driveHelpers.driveHelpers.downloadFile;
    const originalGetMetadata = driveHelpers.driveHelpers.getFileMetadata;
    const originalUpload = driveHelpers.driveHelpers.uploadFile;
    const originalEnsureReady = driveHelpers.driveHelpers.ensureReadyPath;

    driveHelpers.driveHelpers.downloadFile = async () => ({ buffer: inputBuffer, cachePath: '' });
    driveHelpers.driveHelpers.getFileMetadata = async () => ({ name: 'test.jpg', mimeType: 'image/jpeg' });
    driveHelpers.driveHelpers.uploadFile = async () => ({ id: 'uploaded-id', webViewLink: 'http://uploaded' });
    driveHelpers.driveHelpers.ensureReadyPath = async () => 'test-folder';

    try {
      const result = await backgroundCleanupJob(data);
      expect(result.kind).toBe('backgroundCleanup');
      expect(result.url).toContain('uploaded');
      expect(result.metadata.engine).toBe('gemini');
      expect(result.metadata.dimensions).toEqual({ width: 100, height: 100 });
    } finally {
      driveHelpers.driveHelpers.downloadFile = originalDownload;
      driveHelpers.driveHelpers.getFileMetadata = originalGetMetadata;
      driveHelpers.driveHelpers.uploadFile = originalUpload;
      driveHelpers.driveHelpers.ensureReadyPath = originalEnsureReady;
    }
  });

  it('should process background replace with mocked FastAPI', async () => {
    const inputBuffer = Buffer.from('fake input image');
    const outputBuffer = Buffer.from('fake output image with watermark and alpha');

    server.use(
      rest.post('http://localhost:8000/background/replace', (req, res, ctx) => {
        return res(ctx.json({
          assetId: 'test-asset',
          outputUrl: 'http://localhost:8000/output.jpg',
          metadata: {
            engine: 'gemini',
            mode: 'replace',
            processing_time_ms: 1000,
            dimensions: { width: 100, height: 100 },
            validations: ['watermark applied', 'blur applied']
          }
        }));
      }),
      rest.get('http://localhost:8000/output.jpg', (req, res, ctx) => {
        return res(ctx.body(outputBuffer));
      })
    );

    const data: BackgroundReplaceJobData = {
      mediaId: 'test-media',
      inputPath: '/tmp/input.jpg',
      projectId: 'test-project',
      preset: 'test-preset'
    };

    // Mock fs
    const fs = await import('fs');
    const originalRead = fs.readFileSync;
    const originalWrite = fs.writeFileSync;
    fs.readFileSync = jest.fn().mockReturnValue(inputBuffer);
    fs.writeFileSync = jest.fn();

    try {
      const result = await backgroundReplaceJob(data);
      expect(result.kind).toBe('backgroundReplace');
      expect(result.jobId).toBeDefined();
      expect(result.metadata.outputUrl).toContain('/tmp/background-test-media-');
    } finally {
      fs.readFileSync = originalRead;
      fs.writeFileSync = originalWrite;
    }
  });

  it('should open circuit breaker after repeated failures', async () => {
    server.use(
      rest.post('http://localhost:8000/background/replace', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'server error' }));
      })
    );

    const data: BackgroundReplaceJobData = {
      mediaId: 'test-media',
      inputPath: '/tmp/input.jpg',
      projectId: 'test-project',
      preset: 'test-preset'
    };

    // Mock fs minimally
    const fs = await import('fs');
    const originalRead = fs.readFileSync;
    fs.readFileSync = jest.fn().mockReturnValue(Buffer.from('input'));

    try {
      // Trigger 3 failures to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(backgroundReplaceJob(data)).rejects.toThrow();
      }
      // Now circuit should be open
      await expect(backgroundReplaceJob(data)).rejects.toThrow('Circuit breaker is open');
    } finally {
      fs.readFileSync = originalRead;
    }
  });
});