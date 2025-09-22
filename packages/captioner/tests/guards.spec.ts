import { clampCaptionLength, filterBannedWords } from '../src/promptGuards.js';

describe('Prompt Guards', () => {
  describe('clampCaptionLength', () => {
    it('should return caption unchanged if under limit for Instagram', () => {
      const caption = 'Short caption';
      const result = clampCaptionLength('instagram', caption);
      expect(result).toBe(caption);
    });

    it('should truncate caption at word boundary if over limit for Instagram', () => {
      // Create a very long caption that exceeds 180 words
      const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
      const longCaption = words.join(' ');
      const result = clampCaptionLength('instagram', longCaption);
      expect(result).toContain('...');
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(180);
    });

    it('should handle different limits for different platforms', () => {
      const longCaption = 'This is a very long caption that should be truncated at the right place because it exceeds the word limit for YouTube Shorts which is around 100 words but we are testing with fewer words here';
      const instagramResult = clampCaptionLength('instagram', longCaption);
      const shortsResult = clampCaptionLength('youtube_shorts', longCaption);
      // Instagram allows more words than YouTube Shorts
      expect(instagramResult.split(/\s+/).length).toBeGreaterThanOrEqual(shortsResult.split(/\s+/).length);
    });

    it('should handle empty string', () => {
      const result = clampCaptionLength('instagram', '');
      expect(result).toBe('');
    });
  });

  describe('filterBannedWords', () => {
    const bannedWords = ['bad', 'ugly', 'terrible'];

    it('should return caption unchanged if no banned words', () => {
      const caption = 'This is a good caption';
      const result = filterBannedWords(caption, bannedWords);
      expect(result).toBe(caption);
    });

    it('should filter out banned words with [FILTERED]', () => {
      const caption = 'This is a bad and ugly caption';
      const result = filterBannedWords(caption, bannedWords);
      expect(result).toBe('This is a [FILTERED] and [FILTERED] caption');
    });

    it('should handle multiple occurrences', () => {
      const caption = 'bad bad ugly terrible';
      const result = filterBannedWords(caption, bannedWords);
      expect(result).toBe('[FILTERED] [FILTERED] [FILTERED] [FILTERED]');
    });

    it('should handle case insensitive matching', () => {
      const caption = 'This is a BAD and Ugly caption';
      const result = filterBannedWords(caption, bannedWords);
      expect(result).toBe('This is a [FILTERED] and [FILTERED] caption');
    });

    it('should handle punctuation around words', () => {
      const caption = 'This is bad, ugly! terrible.';
      const result = filterBannedWords(caption, bannedWords);
      expect(result).toBe('This is [FILTERED], [FILTERED]! [FILTERED].');
    });

    it('should handle empty banned words list', () => {
      const caption = 'This is a bad caption';
      const result = filterBannedWords(caption, []);
      expect(result).toBe(caption);
    });

    it('should handle empty caption', () => {
      const result = filterBannedWords('', bannedWords);
      expect(result).toBe('');
    });
  });
});