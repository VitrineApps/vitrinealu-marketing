import { buildPrompt, PromptInputs } from '../src/promptTemplates.js';
import { Platform } from '../src/types.js';

describe('Prompt Templates', () => {
  const baseInputs: PromptInputs = {
    brief: 'Beautiful mountain landscape',
    productTags: ['nature', 'adventure'],
    location: 'Scottish Highlands',
    features: ['stunning views', 'peaceful atmosphere'],
    brandTone: ['inspiring', 'authentic'],
  };

  describe('Instagram/TikTok template', () => {
    it('should build Instagram prompt', () => {
      const result = buildPrompt('instagram', baseInputs);
      expect(result).toMatchSnapshot();
    });

    it('should build TikTok prompt', () => {
      const result = buildPrompt('tiktok', baseInputs);
      expect(result).toMatchSnapshot();
    });
  });

  describe('YouTube Shorts template', () => {
    it('should build YouTube Shorts prompt', () => {
      const result = buildPrompt('youtube_shorts', baseInputs);
      expect(result).toMatchSnapshot();
    });
  });

  describe('LinkedIn template', () => {
    it('should build LinkedIn prompt', () => {
      const result = buildPrompt('linkedin', baseInputs);
      expect(result).toMatchSnapshot();
    });
  });

  describe('Facebook template', () => {
    it('should build Facebook prompt', () => {
      const result = buildPrompt('facebook', baseInputs);
      expect(result).toMatchSnapshot();
    });
  });

  describe('Input variations', () => {
    it('should handle missing location', () => {
      const inputs: PromptInputs = {
        brief: 'Test brief',
        productTags: ['tag1'],
      };
      const result = buildPrompt('instagram', inputs);
      expect(result).toContain('Key benefits: benefits of tag1');
      expect(result).not.toContain('region');
    });

    it('should handle missing features', () => {
      const inputs: PromptInputs = {
        brief: 'Test brief',
        productTags: ['tag1'],
      };
      const result = buildPrompt('instagram', inputs);
      expect(result).toContain('Features:\n');
    });

    it('should handle missing brand tone', () => {
      const inputs: PromptInputs = {
        brief: 'Test brief',
        productTags: ['tag1'],
      };
      const result = buildPrompt('instagram', inputs);
      expect(result).not.toContain('vocabulary');
    });
  });
});