import { CaptionLayer } from './types';

export class CaptionOverlay {
  /**
   * Generate FFmpeg drawtext filter for captions
   */
  static generateDrawtextFilter(
    captions: CaptionLayer[],
    videoWidth: number,
    videoHeight: number,
    fontFamily?: string
  ): string {
    const filters: string[] = [];

    captions.forEach((caption, _index) => {
      const filter = this.generateSingleCaptionFilter(
        caption,
        videoWidth,
        videoHeight,
        fontFamily
      );
      if (filter) {
        filters.push(filter);
      }
    });

    return filters.join(',');
  }

  /**
   * Generate filter for a single caption
   */
  private static generateSingleCaptionFilter(
    caption: CaptionLayer,
    videoWidth: number,
    videoHeight: number,
    defaultFontFamily?: string
  ): string {
    const fontSize = caption.fontSize || Math.floor(videoHeight * 0.04); // 4% of height
    const fontFamily = caption.fontFamily || defaultFontFamily || 'Arial';
    const color = caption.color || 'white';

    // Calculate safe area margins (5% of dimensions)
    const marginX = Math.floor(videoWidth * 0.05);
    const marginY = Math.floor(videoHeight * 0.05);

    // Calculate position
    let x: string, y: string;
    switch (caption.position || 'bottom') {
      case 'top':
        x = `(w-text_w)/2`;
        y = marginY.toString();
        break;
      case 'center':
        x = `(w-text_w)/2`;
        y = `(h-text_h)/2`;
        break;
      case 'bottom':
      default:
        x = `(w-text_w)/2`;
        y = `(h-text_h-${marginY})`;
        break;
    }

    // Apply safe area if enabled
    if (caption.safeArea !== false) {
      x = `max(${marginX}, min(w-text_w-${marginX}, ${x}))`;
      y = `max(${marginY}, min(h-text_h-${marginY}, ${y}))`;
    }

    // Escape special characters
    const escapedText = caption.text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/,/g, '\\,');

    const filter = `drawtext=text='${escapedText}':` +
      `fontsize=${fontSize}:` +
      `fontcolor=${color}:` +
      `fontfile='${fontFamily}':` +
      `x=${x}:` +
      `y=${y}:` +
      `enable='between(t,${caption.startTime},${caption.endTime})':` +
      `shadowcolor=black:` +
      `shadowx=2:` +
      `shadowy=2:` +
      `box=1:` +
      `boxcolor=black@0.5:` +
      `boxborderw=5`;

    return filter;
  }

  /**
   * Calculate safe area dimensions
   */
  static calculateSafeArea(width: number, height: number, marginPercent: number = 0.05) {
    const marginX = Math.floor(width * marginPercent);
    const marginY = Math.floor(height * marginPercent);

    return {
      x: marginX,
      y: marginY,
      width: width - (2 * marginX),
      height: height - (2 * marginY),
    };
  }

  /**
   * Validate caption timing
   */
  static validateCaptions(captions: CaptionLayer[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    captions.forEach((caption, _index) => {
      if (caption.startTime >= caption.endTime) {
        errors.push(`Caption ${_index}: start time must be before end time`);
      }

      if (caption.startTime < 0) {
        errors.push(`Caption ${_index}: start time cannot be negative`);
      }

      if (caption.text.trim().length === 0) {
        errors.push(`Caption ${_index}: text cannot be empty`);
      }
    });

    // Check for overlapping captions
    for (let i = 0; i < captions.length; i++) {
      for (let j = i + 1; j < captions.length; j++) {
        const a = captions[i];
        const b = captions[j];

        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          errors.push(`Captions ${i} and ${j} overlap in time`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate SRT subtitle file content
   */
  static generateSRT(captions: CaptionLayer[]): string {
    let srt = '';
    const timeFormat = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);

      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };

    captions.forEach((caption, _index) => {
      srt += `${_index + 1}\n`;
      srt += `${timeFormat(caption.startTime)} --> ${timeFormat(caption.endTime)}\n`;
      srt += `${caption.text}\n\n`;
    });

    return srt;
  }

  /**
   * Generate ASS subtitle file content
   */
  static generateASS(
    captions: CaptionLayer[],
    _videoWidth: number,
    _videoHeight: number
  ): string {
    let ass = `[Script Info]
Title: Generated Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,2,2,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const timeFormat = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const cs = Math.floor((seconds % 1) * 100); // centiseconds

      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    };

    captions.forEach((caption) => {
      const start = timeFormat(caption.startTime);
      const end = timeFormat(caption.endTime);
      const text = caption.text.replace(/\n/g, '\\N');

      ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
    });

    return ass;
  }
}