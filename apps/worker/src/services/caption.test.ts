import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCaption, type CaptionResult } from './caption.js';

// Mock the LLM service
const mockLLM = {
  chat: vi.fn(),
};

vi.mock('./llm.js', () => ({
  getLLM: () => mockLLM,
}));

// Mock file system for prompt loading
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('generateCaption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate Instagram caption with proper schema', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# Instagram Caption Prompt\n\nCreate engaging captions...');

    mockLLM.chat.mockResolvedValue('Engaging Instagram caption\n#Aluminum #Work #Quality #Professional #Craft');

    const result: CaptionResult = await generateCaption('instagram', {
      product: 'aluminum windows',
      locale: 'en-US',
      season: 'summer',
      benefits: ['durability', 'style']
    });

    expect(result.text).toBe('Engaging Instagram caption');
    expect(result.hashtags).toEqual(['Aluminum', 'Work', 'Quality', 'Professional', 'Craft']);
    expect(result.cta).toBeUndefined(); // No callToAction provided
  });

  it('should generate TikTok caption with CTA', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# TikTok Caption Prompt\n\nCreate punchy captions...');

    mockLLM.chat.mockResolvedValue('Punchy TikTok caption\n#Aluminum #TikTok #Fast #Quote');

    const result = await generateCaption('tiktok', {
      product: 'aluminum windows',
      callToAction: 'DM for quote'
    });

    expect(result.text).toBe('Punchy TikTok caption');
    expect(result.hashtags).toEqual(['Aluminum', 'TikTok', 'Fast', 'Quote']);
    expect(result.cta).toBe('DM for quote');
  });

  it('should generate LinkedIn caption with limited hashtags', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# LinkedIn Caption Prompt\n\nCreate professional captions...');

    mockLLM.chat.mockResolvedValue('Professional LinkedIn caption\n#Aluminum #Quality #Professional #Extra #Hashtag');

    const result = await generateCaption('linkedin', {
      product: 'windows',
      variantType: 'commercial'
    });

    expect(result.text).toBe('Professional LinkedIn caption');
    expect(result.hashtags).toHaveLength(3); // Limited to 3 for LinkedIn
  });

  it('should handle optional context fields', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# Instagram Caption Prompt\n\nCreate captions...');

    mockLLM.chat.mockResolvedValue('Basic caption\n#Test');

    const result = await generateCaption('instagram', {});

    expect(result.text).toBe('Basic caption');
    expect(result.hashtags).toEqual(['Test']);
  });

  it('should validate result with zod schema', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# Instagram Caption Prompt\n\nCreate captions...');

    mockLLM.chat.mockResolvedValue('Test caption\n#Valid');

    const result = await generateCaption('instagram', {});

    // Should not throw if valid
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('hashtags');
    expect(result).toHaveProperty('cta');
  });

  it('should load platform-specific prompts correctly', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# Test Prompt\n\nTest content');

    mockLLM.chat.mockResolvedValue('Test\n#Test');

    await generateCaption('instagram', {});

    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining('services/worker/prompts/instagram.md'),
      'utf-8'
    );
  });

  it('should trim hashtags to platform limits', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# LinkedIn Prompt\n\nCreate professional captions...');

    // Mock LLM to return more hashtags than LinkedIn allows (3)
    mockLLM.chat.mockResolvedValue('Professional caption\n#One #Two #Three #Four #Five #Six');

    const result = await generateCaption('linkedin', {});

    expect(result.hashtags).toHaveLength(3); // LinkedIn max 3
    expect(result.hashtags).toEqual(['One', 'Two', 'Three']);
  });

  it('should deterministically limit hashtags for Instagram/TikTok', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# Instagram Prompt\n\nCreate engaging captions...');

    // Mock LLM to return more than 5 hashtags
    mockLLM.chat.mockResolvedValue('Instagram caption\n#1 #2 #3 #4 #5 #6 #7');

    const result = await generateCaption('instagram', {});

    expect(result.hashtags).toHaveLength(5); // Instagram max 5
    expect(result.hashtags).toEqual(['1', '2', '3', '4', '5']);
  });

  it('should parse content correctly with mixed lines', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('# Test Prompt\n\nTest');

    mockLLM.chat.mockResolvedValue('First line\nSecond line\n#Hashtag1\nSome text\n#Hashtag2\nMore text');

    const result = await generateCaption('instagram', {});

    expect(result.text).toBe('First line\nSecond line\nSome text\nMore text');
    expect(result.hashtags).toEqual(['Hashtag1', 'Hashtag2']);
  });
});