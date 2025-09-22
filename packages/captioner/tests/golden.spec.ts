// Mock dependencies
jest.mock('exifr');

const mockExtractExifHints = jest.fn();
const mockBuildPrompt = jest.fn();
const mockClampCaptionLength = jest.fn();
const mockFilterBannedWords = jest.fn();
const mockGetProvider = jest.fn();

jest.unstable_mockModule('../src/extractors/exif.js', () => ({
  extractExifHints: mockExtractExifHints,
}));

jest.unstable_mockModule('../src/promptTemplates.js', () => ({
  buildPrompt: mockBuildPrompt,
}));

jest.unstable_mockModule('../src/promptGuards.js', () => ({
  clampCaptionLength: mockClampCaptionLength,
  filterBannedWords: mockFilterBannedWords,
}));

jest.unstable_mockModule('../src/providers/index.js', () => ({
  getProvider: mockGetProvider,
}));

jest.mock('../src/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import * as generate from '../src/generate.js';
import { jest } from '@jest/globals';
import * as fsx from 'fs-extra';
const { readFile } = fsx;
import * as path from 'path';

import exifr from 'exifr';
import mockProvider from '../src/providers/mockProvider.js';

const _mockExifrParse = jest.mocked(exifr.parse);

describe('Golden File Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock EXIF extraction
    (mockExtractExifHints as any).mockImplementation((filePath: string) => {
      if (filePath.includes('img_wide.jpg')) {
        return Promise.resolve({
          lens: 'wide' as const,
          timeOfDay: 'day' as const,
        });
      } else if (filePath.includes('img_ultrawide.jpg')) {
        return Promise.resolve({
          lens: 'ultra-wide' as const,
          timeOfDay: 'golden_hour' as const,
        });
      }
      return Promise.resolve({
        lens: 'standard' as const,
        timeOfDay: 'day' as const,
      });
    });

    // Mock prompt building
    (mockBuildPrompt as any).mockReturnValue('Test prompt for golden file generation');

    // Mock getProvider to return mockProvider
    (mockGetProvider as any).mockReturnValue(mockProvider);

    // Mock content processing
    (mockClampCaptionLength as any).mockImplementation((platform: string, caption: string) => caption);
    (mockFilterBannedWords as any).mockImplementation((caption: string) => caption);
  });

  it('should generate Instagram captions matching golden file', async () => {
    const results = await generate.generateForDir({
      mediaDir: 'fixtures',
      platform: 'instagram',
      providerName: 'mock',
      seed: 42, // Deterministic seed
    });

    // Load golden file
    const goldenPath = path.join(process.cwd(), 'fixtures/golden/instagram.img_wide.json');
    const goldenContent = await readFile(goldenPath, 'utf-8');
    const golden = JSON.parse(goldenContent);

    // Find the result for img_wide.jpg
    const result = results.find(r => r.meta.file.includes('img_wide.jpg'));
    expect(result).toBeDefined();

    // Compare key fields (excluding meta.hash which is computed)
    expect(result!.platform).toBe(golden.platform);
    expect(result!.caption).toBe(golden.caption);
    expect(result!.hashtags).toEqual(golden.hashtags);
    expect(result!.call_to_action).toBe(golden.call_to_action);
    expect(result!.compliance_notes).toBe(golden.compliance_notes);
    expect(result!.meta.exif).toEqual(golden.meta.exif);
  });

  it('should generate LinkedIn captions matching golden file', async () => {
    const results = await generate.generateForDir({
      mediaDir: 'fixtures',
      platform: 'linkedin',
      providerName: 'mock',
      seed: 42, // Deterministic seed
    });

    // Load golden file
    const goldenPath = path.join(process.cwd(), 'fixtures/golden/linkedin.img_ultrawide.json');
    const goldenContent = await readFile(goldenPath, 'utf-8');
    const golden = JSON.parse(goldenContent);

    // Find the result for img_ultrawide.jpg
    const result = results.find(r => r.meta.file.includes('img_ultrawide.jpg'));
    expect(result).toBeDefined();

    // Compare key fields (excluding meta.hash which is computed)
    expect(result!.platform).toBe(golden.platform);
    expect(result!.caption).toBe(golden.caption);
    expect(result!.hashtags).toEqual(golden.hashtags);
    expect(result!.call_to_action).toBe(golden.call_to_action);
    expect(result!.compliance_notes).toBe(golden.compliance_notes);
    expect(result!.meta.exif).toEqual(golden.meta.exif);
  });

  it('should generate deterministic output with seed', async () => {
    // Run twice with same seed
    const results1 = await generate.generateForDir({
      mediaDir: 'fixtures',
      platform: 'instagram',
      providerName: 'mock',
      seed: 123,
    });

    const results2 = await generate.generateForDir({
      mediaDir: 'fixtures',
      platform: 'instagram',
      providerName: 'mock',
      seed: 123,
    });

    // Results should be identical
    expect(results1).toEqual(results2);
  });
});