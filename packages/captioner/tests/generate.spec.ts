// packages/captioner/tests/generate.spec.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as realReadFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const brandPath = path.resolve(__dirname, '../fixtures/brand.example.yaml');

// ESM-friendly mocks
jest.mock('globby', () => ({ __esModule: true, globby: jest.fn() }));
jest.mock('fs-extra', () => ({
  __esModule: true,
  default: {
    ensureDir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
}));
jest.mock('../src/extractors/exif.ts', () => ({
  __esModule: true,
  extractExifHints: jest.fn().mockResolvedValue({ lens: 'wide', timeOfDay: 'day' }),
}));
jest.mock('../src/providers/index.ts', () => ({
  __esModule: true,
  getProvider: jest.fn(() => ({
    generate: jest.fn().mockResolvedValue({
      platform: 'instagram',
      caption: 'Test caption with emoji 😊',
      hashtags: Array.from({ length: 40 }, (_, i) => `#tag${i + 1}`),
      call_to_action: 'Request a free quote.',
    }),
  })),
}));

import { globby as globbyFn } from 'globby';
import * as fsx from 'fs-extra';
import * as exifMod from '../src/extractors/exif.js';
import * as providers from '../src/providers/index.js';
import { logger } from '../src/logger.js';
import { generateForDir, loadBrandKit, MEDIA_PATTERNS } from '../src/generate.js';

const mockGlobby = globbyFn as unknown as jest.Mock;
const mockEnsureDir = jest.spyOn(fsx, 'ensureDir') as unknown as jest.Mock;
const mockWriteFile = jest.spyOn(fsx, 'writeFile') as unknown as jest.Mock;
const mockReadFile = jest.spyOn(fsx, 'readFile') as unknown as jest.Mock;
const mockExtractExifHints = jest.spyOn(exifMod, 'extractExifHints') as unknown as jest.Mock;
const mockGetProvider = jest.spyOn(providers, 'getProvider') as unknown as jest.Mock;

describe('Caption Generation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadBrandKit', () => {
    it('should load and parse brand configuration', async () => {
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));
      const kit = await loadBrandKit(brandPath);
      expect(kit.toneWords?.length).toBeGreaterThan(0);
      expect(kit.locale).toBeDefined();
    });
  });

  describe('generateForDir', () => {
    it('should generate captions for all media files in directory', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));

      const provider = mockGetProvider.mock.results[0].value;
      const mockProviderGenerate = provider.generate as jest.Mock;

      const options = {
        mediaDir: '/media',
        platform: 'instagram' as const,
        providerName: 'mock' as const,
        seed: 7,
      };
      const results = await generateForDir(options);
      expect(results.length).toBe(1);

      expect(mockGlobby).toHaveBeenCalledWith(MEDIA_PATTERNS, {
        cwd: '/media',
        absolute: true,
      });
      expect(mockProviderGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'instagram', seed: 7 }),
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(payload.platform).toBe('instagram');
    });

    it('should write merged output when outFile is specified', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));
      const options = {
        mediaDir: '/media',
        platform: 'instagram' as const,
        outFile: '/output',
        providerName: 'mock' as const,
      };
      await generateForDir(options);
      expect(mockEnsureDir).toHaveBeenCalledWith('/output');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/output/captions.json',
        expect.any(String),
      );
    });

    it('should handle empty directory', async () => {
      mockGlobby.mockResolvedValue([]);
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
      const options = {
        mediaDir: '/empty',
        platform: 'instagram' as const,
        providerName: 'mock' as const,
      };
      const results = await generateForDir(options);
      expect(results).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith({ mediaDir: '/empty' }, 'No media files found');
    });

    it('should apply platform-specific hashtag limits', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));

      const provider = mockGetProvider.mock.results[0].value;
      (provider.generate as jest.Mock).mockResolvedValueOnce({
        platform: 'instagram',
        caption: 'x',
        hashtags: Array.from({ length: 80 }, (_, i) => `#h${i}`),
        call_to_action: 'x',
      });

      await generateForDir({
        mediaDir: '/media',
        platform: 'instagram',
        providerName: 'mock' as const,
      });

      const sidecar = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(sidecar.hashtags.length).toBe(30);
    });

    it('should use deterministic seed for reproducible results', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));
      const provider = mockGetProvider.mock.results[0].value;
      const mockProviderGenerate = provider.generate as jest.Mock;

      await generateForDir({
        mediaDir: '/media',
        platform: 'instagram',
        providerName: 'mock' as const,
        seed: 42,
      });

      expect(mockProviderGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ seed: 42 }),
      );
    });

    it('should filter banned hashtags', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(
        // inject banned hashtags into brand file
        `tone_words: [inspiring, authentic]
banned_hashtags: ['#bad','#awful']
locale: en-GB
`,
      );
      const provider = mockGetProvider.mock.results[0].value;
      (provider.generate as jest.Mock).mockResolvedValueOnce({
        platform: 'instagram',
        caption: 'x',
        hashtags: ['#good', '#Bad', '#also_good'],
        call_to_action: 'x',
      });

      await generateForDir({
        mediaDir: '/media',
        platform: 'instagram',
        providerName: 'mock' as const,
        seed: 1,
      });

      const sidecar = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(sidecar.hashtags).toEqual(['#also_good', '#good']); // filtered and sorted
    });

    it('should remove emojis from LinkedIn captions', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));

      const provider = mockGetProvider.mock.results[0].value;
      (provider.generate as jest.Mock).mockResolvedValueOnce({
        platform: 'linkedin',
        caption: 'Test caption with emoji �',
        hashtags: ['#aluminium'],
        call_to_action: 'x',
      });

      await generateForDir({
        mediaDir: '/media',
        platform: 'linkedin',
        providerName: 'mock' as const,
      });

      const sidecar = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(sidecar.caption).toBe('Test caption with emoji ');
    });

    it('should handle EXIF extraction failure with fallback', async () => {
      mockGlobby.mockResolvedValue(['/media/a.jpg']);
      mockReadFile.mockResolvedValueOnce(await realReadFile(brandPath, 'utf-8'));
      mockExtractExifHints.mockRejectedValueOnce(new Error('exif fail'));

      const provider = mockGetProvider.mock.results[0].value;
      await generateForDir({
        mediaDir: '/media',
        platform: 'instagram',
        providerName: 'mock' as const,
      });

      expect(mockExtractExifHints).toHaveBeenCalled();
      expect((provider.generate as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          exif: expect.objectContaining({ lens: expect.any(String), timeOfDay: expect.any(String) }),
        }),
      );
    });
  });
})