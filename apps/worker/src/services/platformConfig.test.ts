import { describe, it, expect } from 'vitest';
import { validateCaptionForPlatform, getOptimalHashtagCount, platformConfig } from './platformConfig.js';

describe('Platform Configuration', () => {
  describe('validateCaptionForPlatform', () => {
    it('should validate LinkedIn caption constraints', () => {
      const caption = 'Professional LinkedIn content about aluminum fabrication';
      const hashtags = ['AluminumWork', 'QualityFirst', 'Professional'];
      
      const validation = validateCaptionForPlatform(caption, hashtags, 'linkedin');
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect TikTok character limit violations', () => {
      const longCaption = 'This is a very long TikTok caption that definitely exceeds the 150 character limit for the platform and should trigger a validation error because it is way too long for TikTok content';
      const hashtags = ['test'];
      
      const validation = validateCaptionForPlatform(longCaption, hashtags, 'tiktok');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('too long'))).toBe(true);
    });

    it('should detect excessive hashtag usage', () => {
      const caption = 'Test caption';
      const tooManyHashtags = Array.from({ length: 35 }, (_, i) => `hashtag${i}`);
      
      const validation = validateCaptionForPlatform(caption, tooManyHashtags, 'instagram');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('Too many hashtags'))).toBe(true);
    });

    it('should validate hashtag format', () => {
      const caption = 'Test caption';
      const invalidHashtags = ['validtag', '123numbers', 'invalid-dashes'];
      
      const validation = validateCaptionForPlatform(caption, invalidHashtags, 'instagram');
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect links in captions where not allowed', () => {
      const captionWithLink = 'Check out our website https://example.com for more info';
      const hashtags = ['test'];
      
      const tiktokValidation = validateCaptionForPlatform(captionWithLink, hashtags, 'tiktok');
      expect(tiktokValidation.isValid).toBe(false);
      expect(tiktokValidation.errors.some(error => error.includes('does not allow links'))).toBe(true);
      
      const linkedinValidation = validateCaptionForPlatform(captionWithLink, hashtags, 'linkedin');
      expect(linkedinValidation.isValid).toBe(true); // LinkedIn allows links
    });
  });

  describe('getOptimalHashtagCount', () => {
    it('should return correct optimal hashtag counts for each platform', () => {
      expect(getOptimalHashtagCount('linkedin')).toBe(3);
      expect(getOptimalHashtagCount('tiktok')).toBe(5);
      expect(getOptimalHashtagCount('instagram')).toBe(5);
      expect(getOptimalHashtagCount('youtube')).toBe(8);
      expect(getOptimalHashtagCount('facebook')).toBe(5);
    });
  });

  describe('platformConfig', () => {
    it('should have correct character limits', () => {
      expect(platformConfig.linkedin.maxCaptionLength).toBe(3000);
      expect(platformConfig.tiktok.maxCaptionLength).toBe(150);
      expect(platformConfig.instagram.maxCaptionLength).toBe(2200);
      expect(platformConfig.youtube.maxCaptionLength).toBe(5000);
      expect(platformConfig.facebook.maxCaptionLength).toBe(63206);
    });

    it('should have correct tone settings', () => {
      expect(platformConfig.linkedin.tone).toBe('professional');
      expect(platformConfig.tiktok.tone).toBe('casual');
      expect(platformConfig.instagram.tone).toBe('engaging');
      expect(platformConfig.youtube.tone).toBe('informative');
      expect(platformConfig.facebook.tone).toBe('friendly');
    });

    it('should have correct emoji and link policies', () => {
      expect(platformConfig.linkedin.allowsEmojis).toBe(false);
      expect(platformConfig.tiktok.allowsEmojis).toBe(true);
      expect(platformConfig.instagram.allowsEmojis).toBe(true);
      
      expect(platformConfig.linkedin.allowsLinks).toBe(true);
      expect(platformConfig.tiktok.allowsLinks).toBe(false);
      expect(platformConfig.instagram.allowsLinks).toBe(false);
    });
  });

  describe('character counting behavior', () => {
    it('should count characters correctly with hashtag inclusion policy', () => {
      const caption = 'Test caption';
      const hashtags = ['test', 'caption'];
      
      // Platforms that include hashtags in character count
      const instagramValidation = validateCaptionForPlatform(caption, hashtags, 'instagram');
      expect(instagramValidation.isValid).toBe(true);
      
      const tiktokValidation = validateCaptionForPlatform(caption, hashtags, 'tiktok');
      expect(tiktokValidation.isValid).toBe(true);
      
      // Platforms that don't include hashtags in character count
      const linkedinValidation = validateCaptionForPlatform(caption, hashtags, 'linkedin');
      expect(linkedinValidation.isValid).toBe(true);
    });
  });
});