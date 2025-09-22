import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LLM service
vi.mock("./llm", async () => {
  const actual = await vi.importActual("./llm") as typeof import("./llm");
  return { getLLM: () => new actual.DummyAdapter() };
});

// Mock config
vi.mock('../config.js', () => ({
  env: {
    CAPTION_MODEL: 'gpt-4o-mini',
    CAPTION_MAX_HASHTAGS: 5
  }
}));

// Mock fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn()
}));

import { generateCaption } from './caption.js';

// Mock fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn()
}));

describe('generateCaption', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { readFile } = vi.mocked(await import('node:fs/promises'));
    readFile.mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('system.ig.txt')) {
        return Promise.resolve('You are a social media caption writer for Instagram. Create emotive, lifestyle-focused captions that are 2-3 sentences long. End with a call-to-action: "Tap for a free quote." Include 3-5 hashtags mixing industry and local terms. Never include addresses or locations.');
      }
      if (typeof path === 'string' && path.includes('system.tiktok.txt')) {
        return Promise.resolve('You are a TikTok caption creator. Write 1-2 punchy lines with emojis allowed. Include a call-to-action: "Message us for a fast quote." Add 3-5 relevant hashtags.');
      }
      if (typeof path === 'string' && path.includes('system.linkedin.txt')) {
        return Promise.resolve('You are a LinkedIn post writer. Create 2-4 sentences that are value-driven and tech-forward, using no slang. Checkmark bullets (✔) are allowed. Include 2-3 hashtags.');
      }
      if (typeof path === 'string' && path.includes('system.youtube.txt')) {
        return Promise.resolve('You are a YouTube Shorts caption writer. Write 1-2 sentences followed by #shorts. Include 3 relevant tags.');
      }
      return Promise.resolve('');
    });
  });

  it('should generate Instagram caption with DummyAdapter', async () => {
    const result = await generateCaption('instagram', {
      product: 'aluminum windows',
      locale: 'en-US',
      season: 'summer',
      benefits: ['durability', 'style']
    });

    expect(result.caption).toContain('[TEST CAPTION]');
    expect(result.caption).toContain('Product: aluminum windows');
    expect(result.hashtags).toEqual([]);
  });

  it('should generate TikTok caption with DummyAdapter', async () => {
    const result = await generateCaption('tiktok', {
      product: 'aluminum windows',
      benefits: ['modern', 'durable']
    });

    expect(result.caption).toContain('[TEST CAPTION]');
    expect(result.caption).toContain('Product: aluminum windows');
    expect(result.hashtags).toEqual([]);
  });

  it('should generate LinkedIn caption with DummyAdapter', async () => {
    const result = await generateCaption('linkedin', {
      product: 'windows',
      variantType: 'commercial'
    });

    expect(result.caption).toContain('[TEST CAPTION]');
    expect(result.caption).toContain('Product: windows');
    expect(result.hashtags).toEqual([]);
  });

  it('should generate YouTube caption with DummyAdapter', async () => {
    const result = await generateCaption('youtube', {
      product: 'windows',
      tone: 'professional'
    });

    expect(result.caption).toContain('[TEST CAPTION]');
    expect(result.caption).toContain('Product: windows');
    expect(result.hashtags).toEqual([]);
  });

  it('should handle optional context fields', async () => {
    const result = await generateCaption('instagram', {});

    expect(result.caption).toContain('[TEST CAPTION]');
    expect(result.hashtags).toEqual([]);
  });
});