import path from 'path';
import { BrandKit, SafeArea, CaptionSegment, VideoProfile } from './types';

/**
 * Generate watermark overlay filter
 */
export function generateWatermarkFilter(
  watermarkPath: string,
  profile: VideoProfile,
  opacity: number = 0.8,
  marginPx: number = 48
): string {
  const x = profile.width - marginPx;
  const y = profile.height - marginPx;
  
  return [
    `movie=${watermarkPath.replace(/\\/g, '/')}[wm]`,
    `[wm]format=rgba,colorchannelmixer=aa=${opacity}[wm_opacity]`,
    `[in][wm_opacity]overlay=${x}:${y}:overlay_mode=rgb[out]`
  ].join(';');
}

/**
 * Generate safe area overlay (for testing/debug purposes)
 */
export function generateSafeAreaOverlay(
  safeArea: SafeArea,
  profile: VideoProfile,
  color: string = '#FF0000',
  opacity: number = 0.3
): string {
  const { top, bottom, left, right } = safeArea;
  const innerWidth = profile.width - left - right;
  const innerHeight = profile.height - top - bottom;
  
  return [
    `color=c=${color}@${opacity}:s=${innerWidth}x${innerHeight}[safe]`,
    `[in][safe]overlay=${left}:${top}[out]`
  ].join(';');
}

/**
 * Generate subtitle ASS file content
 */
export function generateAssSubtitles(
  captions: CaptionSegment[],
  profile: VideoProfile,
  brandKit: BrandKit,
  safeArea?: SafeArea
): string {
  const safeBottom = safeArea?.bottom || 100;
  const fontSize = Math.round(profile.height * 0.04); // 4% of video height
  const primaryColor = brandKit.colors.text_light || '#FFFFFF';
  const fontFamily = brandKit.fonts.primary || 'Arial';
  
  // ASS file header
  const header = `[Script Info]
Title: Video Captions
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,2,10,10,${safeBottom},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  // Generate dialogue lines
  const dialogues = captions.map(caption => {
    const start = formatAssTime(caption.start);
    const end = formatAssTime(caption.end);
    const text = caption.text.replace(/\n/g, '\\N'); // ASS line break
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).join('\n');

  return `${header}\n${dialogues}`;
}

/**
 * Format time for ASS subtitle format (H:MM:SS.cc)
 */
function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

/**
 * Generate drawtext filter for simple text overlay
 */
export function generateDrawTextFilter(
  text: string,
  profile: VideoProfile,
  brandKit: BrandKit,
  safeArea?: SafeArea,
  position: 'top' | 'center' | 'bottom' = 'bottom'
): string {
  const safeLeft = safeArea?.left || 40;
  const safeRight = safeArea?.right || 40;
  const safeTop = safeArea?.top || 100;
  const safeBottom = safeArea?.bottom || 100;
  
  const fontSize = Math.round(profile.height * 0.04);
  const fontColor = brandKit.colors.text_light || 'white';
  const fontFamily = brandKit.fonts.primary || 'Arial';
  const maxWidth = profile.width - safeLeft - safeRight;
  
  let x = safeLeft;
  let y: number;
  
  switch (position) {
    case 'top':
      y = safeTop;
      break;
    case 'center':
      y = (profile.height - fontSize) / 2;
      break;
    case 'bottom':
    default:
      y = profile.height - safeBottom - fontSize;
      break;
  }
  
  // Escape special characters for FFmpeg
  const escapedText = text
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
  
  return [
    'drawtext',
    `text='${escapedText}'`,
    `fontfile=${getFontPath(fontFamily)}`,
    `fontsize=${fontSize}`,
    `fontcolor=${fontColor}`,
    `x=${x}`,
    `y=${y}`,
    `box=1`,
    `boxcolor=black@0.5`,
    `boxborderw=5`
  ].join(':');
}

/**
 * Get system font path (simplified - in production would need more robust font detection)
 */
function getFontPath(fontFamily: string): string {
  // This is a simplified implementation
  // In production, you'd want to properly detect system fonts
  const commonFonts: Record<string, string> = {
    'Arial': 'C:/Windows/Fonts/arial.ttf',
    'Montserrat': 'C:/Windows/Fonts/Montserrat-Regular.ttf',
    'Lato': 'C:/Windows/Fonts/Lato-Regular.ttf',
  };
  
  return commonFonts[fontFamily] || commonFonts['Arial'];
}

/**
 * Parse caption JSON to segments
 */
export function parseCaptionJson(captionJson: string): CaptionSegment[] {
  try {
    const data = JSON.parse(captionJson);
    
    // Handle different caption formats
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        text: item.text || item.content || '',
        start: item.start || item.startTime || index * 3,
        end: item.end || item.endTime || (index + 1) * 3,
      }));
    }
    
    if (data.segments && Array.isArray(data.segments)) {
      return data.segments.map((segment: any) => ({
        text: segment.text || '',
        start: segment.start || 0,
        end: segment.end || 3,
      }));
    }
    
    // Single caption object
    if (data.text) {
      return [{
        text: data.text,
        start: data.start || 0,
        end: data.end || 3,
      }];
    }
    
    return [];
  } catch (error) {
    console.warn('Failed to parse caption JSON:', error);
    return [];
  }
}

/**
 * Calculate safe area based on profile and brand settings
 */
export function calculateSafeArea(
  profile: 'reel' | 'linkedin',
  brandKit?: BrandKit
): SafeArea {
  // Default safe areas
  const defaults: Record<string, SafeArea> = {
    reel: { top: 220, bottom: 220, left: 40, right: 40 },
    linkedin: { top: 100, bottom: 100, left: 60, right: 60 },
  };
  
  // Use brand kit override if available
  if (brandKit?.safe_areas) {
    const override = profile === 'reel' ? brandKit.safe_areas.reels : brandKit.safe_areas.landscape;
    if (override) {
      return override;
    }
  }
  
  return defaults[profile] || defaults.reel;
}