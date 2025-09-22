import { CaptionOverlay } from '../src/captionOverlay';
import { BrandKitLoader } from '../src/brandKit';
import { Watermark } from '../src/watermark';

describe('CaptionOverlay', () => {
  describe('generateDrawtextFilter', () => {
    it('should generate basic drawtext filter', () => {
      const captions = [
        {
          text: 'Hello World',
          startTime: 0,
          endTime: 3,
          fontSize: 48,
          fontFamily: 'Arial',
          color: 'white',
          position: 'bottom' as const,
          safeArea: true,
        },
      ];

      const filter = CaptionOverlay.generateDrawtextFilter(captions, 1920, 1080);

      expect(filter).toContain('drawtext');
      expect(filter).toContain('Hello World');
      expect(filter).toContain('fontsize=48');
      expect(filter).toContain('fontcolor=white');
      expect(filter).toContain('between(t,0,3)');
    });

    it('should handle safe area positioning', () => {
      const captions = [
        {
          text: 'Test',
          startTime: 0,
          endTime: 2,
          position: 'bottom' as const,
          safeArea: true,
        },
      ];

      const filter = CaptionOverlay.generateDrawtextFilter(captions, 1920, 1080);

      expect(filter).toContain('max(');
      expect(filter).toContain('min(');
    });
  });

  describe('validateCaptions', () => {
    it('should validate correct captions', () => {
      const captions = [
        {
          text: 'Valid caption',
          startTime: 0,
          endTime: 3,
        },
      ];

      const result = CaptionOverlay.validateCaptions(captions);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid timing', () => {
      const captions = [
        {
          text: 'Invalid timing',
          startTime: 3,
          endTime: 1,
        },
      ];

      const result = CaptionOverlay.validateCaptions(captions);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Caption 0: start time must be before end time');
    });

    it('should detect overlapping captions', () => {
      const captions = [
        {
          text: 'First',
          startTime: 0,
          endTime: 3,
        },
        {
          text: 'Second',
          startTime: 2,
          endTime: 5,
        },
      ];

      const result = CaptionOverlay.validateCaptions(captions);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('overlap'))).toBe(true);
    });
  });

  describe('calculateSafeArea', () => {
    it('should calculate safe area dimensions', () => {
      const safeArea = CaptionOverlay.calculateSafeArea(1920, 1080);

      expect(safeArea.x).toBe(96); // 5% of 1920
      expect(safeArea.y).toBe(54); // 5% of 1080
      expect(safeArea.width).toBe(1728); // 1920 - 2*96
      expect(safeArea.height).toBe(972); // 1080 - 2*54
    });
  });
});

describe('BrandKitLoader', () => {
  describe('mergeWithDefaults', () => {
    it('should merge partial brand kit with defaults', () => {
      const partial = {
        brand: 'test',
        colors: {
          primary: '#ff0000',
        },
      };

      const result = BrandKitLoader.mergeWithDefaults(partial);

      expect(result.brand).toBe('test');
      expect(result.colors.primary).toBe('#ff0000');
      expect(result.colors.secondary).toBe('#666666'); // default
      expect(result.fonts.primary).toBe('Arial'); // default
    });
  });

  describe('findMatchingFont', () => {
    it('should find exact font match', () => {
      const availableFonts = ['Arial', 'Helvetica', 'Times New Roman'];

      const result = (BrandKitLoader as any).findMatchingFont('Arial', availableFonts);

      expect(result).toBe('Arial');
    });

    it('should find case-insensitive match', () => {
      const availableFonts = ['Arial', 'Helvetica'];

      const result = (BrandKitLoader as any).findMatchingFont('arial', availableFonts);

      expect(result).toBe('Arial');
    });

    it('should return null for no match', () => {
      const availableFonts = ['Arial', 'Helvetica'];

      const result = (BrandKitLoader as any).findMatchingFont('Comic Sans', availableFonts);

      expect(result).toBeNull();
    });
  });
});

describe('Watermark', () => {
  describe('generateWatermarkFilter', () => {
    it('should generate basic watermark filter', () => {
      const filter = Watermark.generateWatermarkFilter(
        '/path/to/watermark.png',
        1920,
        1080,
        { scale: 0.1, opacity: 0.8, position: 'bottom-right' }
      );

      expect(filter).toContain('movie=/path/to/watermark.png');
      expect(filter).toContain('scale=192:-1'); // 10% of 1920 = 192
      expect(filter).toContain('colorchannelmixer=aa=0.8');
      expect(filter).toContain('overlay=W-w-20:H-h-20');
    });

    it('should handle different positions', () => {
      const filter = Watermark.generateWatermarkFilter(
        '/path/to/watermark.png',
        1920,
        1080,
        { position: 'top-left' }
      );

      expect(filter).toContain('overlay=20:20');
    });
  });

  describe('calculateOptimalSize', () => {
    it('should calculate optimal watermark size', () => {
      const size = Watermark.calculateOptimalSize(1920, 1080);

      expect(size.width).toBe(96); // 5% of min(1920,1080) = 5% of 1080
      expect(size.height).toBe(96);
    });
  });
});