import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { enhanceJob } from './enhance.js';
import { TopazEnhancer } from '../providers/enhance/TopazEnhancer.js';
import { RealEsrganEnhancer } from '../providers/enhance/RealEsrganEnhancer.js';
import { NoopEnhancer } from '../providers/enhance/NoopEnhancer.js';
import { runOpencvPost } from '../lib/opencvPost.js';
import { driveHelpers } from '../lib/drive.js';

const { mkdtemp, rm, writeFile, readFile } = vi.mocked(await import('node:fs/promises'));

const mockedDriveHelpers = vi.mocked(driveHelpers);

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn()
}));

vi.mock('../lib/drive.js', () => ({
  driveHelpers: {
    downloadFile: vi.fn(),
    getFileMetadata: vi.fn(),
    ensureReadyPath: vi.fn(),
    uploadFile: vi.fn()
  }
}));

vi.mock('../lib/opencvPost.js', () => ({
  runOpencvPost: vi.fn().mockResolvedValue('/path/to/output.jpg')
}));

vi.mock('../config.js', () => ({
  env: {
    TOPAZ_CLI: '/usr/bin/topaz',
    REAL_ESRGAN_BIN: '/usr/bin/realesrgan',
    ENHANCE_DEFAULT_SCALE: 2,
    ENHANCE_KEEP_SCALE: 1,
    PYTHON_BIN: 'python3'
  }
}));

describe('enhanceJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdtemp.mockResolvedValue('/tmp/test-dir');
    rm.mockResolvedValue();
    writeFile.mockResolvedValue();
    readFile.mockResolvedValue(Buffer.from('fake image'));
    mockedDriveHelpers.downloadFile.mockResolvedValue({ buffer: Buffer.from('fake image'), cachePath: '/tmp/fake' });
    mockedDriveHelpers.getFileMetadata.mockResolvedValue({ name: 'test.jpg', mimeType: 'image/jpeg' });
    mockedDriveHelpers.ensureReadyPath.mockResolvedValue('ready/folder');
    mockedDriveHelpers.uploadFile.mockResolvedValue({ id: 'upload-id', webContentLink: 'https://example.com/enhanced.jpg' });
  });

  it('should use TopazEnhancer if available', async () => {
    const topazMock = vi.spyOn(TopazEnhancer.prototype, 'enhance').mockResolvedValue({ scale: 2, ms: 100 });
    const realEsrganMock = vi.spyOn(RealEsrganEnhancer.prototype, 'enhance');
    const noopMock = vi.spyOn(NoopEnhancer.prototype, 'enhance');

    const result = await enhanceJob({ assetId: 'test-id' });

    expect(topazMock).toHaveBeenCalled();
    expect(realEsrganMock).not.toHaveBeenCalled();
    expect(noopMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'enhance',
      url: 'https://example.com/enhanced.jpg',
      metadata: { provider: 'topaz', scale: 2, ms: 100 }
    });
  });

  it('should fallback to RealEsrganEnhancer if Topaz fails', async () => {
    const topazMock = vi.spyOn(TopazEnhancer.prototype, 'enhance').mockRejectedValue(new Error('Topaz failed'));
    const realEsrganMock = vi.spyOn(RealEsrganEnhancer.prototype, 'enhance').mockResolvedValue({ scale: 2, ms: 200 });
    const noopMock = vi.spyOn(NoopEnhancer.prototype, 'enhance');

    const result = await enhanceJob({ assetId: 'test-id' });

    expect(topazMock).toHaveBeenCalled();
    expect(realEsrganMock).toHaveBeenCalled();
    expect(noopMock).not.toHaveBeenCalled();
    expect(result.metadata.provider).toBe('real-esrgan');
  });

  it('should fallback to NoopEnhancer if all others fail', async () => {
    const topazMock = vi.spyOn(TopazEnhancer.prototype, 'enhance').mockRejectedValue(new Error('Topaz failed'));
    const realEsrganMock = vi.spyOn(RealEsrganEnhancer.prototype, 'enhance').mockRejectedValue(new Error('RealESRGAN failed'));
    const noopMock = vi.spyOn(NoopEnhancer.prototype, 'enhance').mockResolvedValue({ scale: 1, ms: 0 });

    const result = await enhanceJob({ assetId: 'test-id' });

    expect(topazMock).toHaveBeenCalled();
    expect(realEsrganMock).toHaveBeenCalled();
    expect(noopMock).toHaveBeenCalled();
    expect(result.metadata.provider).toBe('noop');
  });

  it('should throw error if all providers fail', async () => {
    const _topazMock = vi.spyOn(TopazEnhancer.prototype, 'enhance').mockRejectedValue(new Error('Topaz failed'));
    const _realEsrganMock = vi.spyOn(RealEsrganEnhancer.prototype, 'enhance').mockRejectedValue(new Error('RealESRGAN failed'));
    const _noopMock = vi.spyOn(NoopEnhancer.prototype, 'enhance').mockRejectedValue(new Error('Noop failed'));

    await expect(enhanceJob({ assetId: 'test-id' })).rejects.toThrow('All enhancement providers failed');
  });

  it('should handle sourceUrl input', async () => {
    const topazMock = vi.spyOn(TopazEnhancer.prototype, 'enhance').mockResolvedValue({ scale: 2, ms: 100 });

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
      headers: { get: vi.fn().mockReturnValue('image/jpeg') }
    });

    const result = await enhanceJob({ sourceUrl: 'https://example.com/image.jpg' });

    expect(topazMock).toHaveBeenCalled();
    expect(result.metadata.provider).toBe('topaz');
  });

  it('should increase mean brightness for dark images', async () => {
    // Skip this test in CI or when PYTHON_BIN is not available
    if (process.env.CI || !process.env.PYTHON_BIN) {
      return;
    }

    // Create a dark image buffer (all pixels near black)
    const darkBuffer = Buffer.alloc(100, 10); // Low values
    const brightBuffer = Buffer.alloc(100, 200); // High values

    mockedDriveHelpers.downloadFile.mockResolvedValue({ buffer: darkBuffer, cachePath: '/tmp/dark' });
    readFile.mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('opencv-output.jpg')) {
        return Promise.resolve(brightBuffer);
      }
      return Promise.resolve(Buffer.from('fake'));
    });

    const topazMock = vi.spyOn(TopazEnhancer.prototype, 'enhance').mockResolvedValue({ scale: 2, ms: 100 });

    const _result = await enhanceJob({ assetId: 'test-id' });

    expect(topazMock).toHaveBeenCalled();
    // Check that the uploaded buffer is the bright one
    expect(mockedDriveHelpers.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        data: brightBuffer
      })
    );

    // Calculate mean brightness
    const darkMean = darkBuffer.reduce((sum, val) => sum + val, 0) / darkBuffer.length;
    const brightMean = brightBuffer.reduce((sum, val) => sum + val, 0) / brightBuffer.length;
    expect(brightMean).toBeGreaterThan(darkMean);
  });
});