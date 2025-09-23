import { KenBurnsEffect, KEN_BURNS_PRESETS } from './types';

/**
 * Generate Ken Burns filter string for FFmpeg
 */
export function generateKenBurnsFilter(
  effect: KenBurnsEffect,
  duration: number,
  inputWidth: number,
  inputHeight: number,
  outputWidth: number,
  outputHeight: number
): string {
  // Calculate aspect ratios
  const inputAspect = inputWidth / inputHeight;
  const outputAspect = outputWidth / outputHeight;
  
  // Determine if we need to crop or pad
  let scaleFilter: string;
  if (inputAspect > outputAspect) {
    // Input is wider, scale by height
    const scale = outputHeight / inputHeight;
    scaleFilter = `scale=${Math.round(inputWidth * scale)}:${outputHeight}`;
  } else {
    // Input is taller, scale by width
    const scale = outputWidth / inputWidth;
    scaleFilter = `scale=${outputWidth}:${Math.round(inputHeight * scale)}`;
  }
  
  // Build zoompan filter for Ken Burns effect
  const fps = 30; // Assuming 30fps
  const totalFrames = Math.round(duration * fps);
  
  const zoomFilter = [
    'zoompan',
    `z='zoom+${(effect.endScale - effect.startScale) / totalFrames}'`,
    `x='if(gte(zoom,${effect.endScale}),x,x+${effect.endX - effect.startX}/${totalFrames})'`,
    `y='if(gte(zoom,${effect.endScale}),y,y+${effect.endY - effect.startY}/${totalFrames})'`,
    `d=${totalFrames}`,
    `s=${outputWidth}x${outputHeight}`
  ].join(':');
  
  return `${scaleFilter},${zoomFilter}`;
}

/**
 * Get Ken Burns effect based on clip settings and seed for deterministic randomness
 */
export function getKenBurnsEffect(
  pan: 'ltr' | 'rtl' | 'center',
  zoom: 'in' | 'out' | 'none',
  seed: number
): KenBurnsEffect {
  // Use seed for deterministic randomness
  const random = createSeededRandom(seed);
  
  let effect = { ...KEN_BURNS_PRESETS.zoom[zoom] };
  
  // Apply pan effect
  if (pan !== 'center') {
    const panEffect = KEN_BURNS_PRESETS.pan[pan];
    effect.startX = panEffect.startX;
    effect.endX = panEffect.endX;
    effect.startY = panEffect.startY;
    effect.endY = panEffect.endY;
    
    // Add some scale for smoother pan
    if (effect.startScale === 1.0 && effect.endScale === 1.0) {
      effect.startScale = 1.1;
      effect.endScale = 1.1;
    }
  }
  
  // Add slight random variation (±5% for scale, ±20px for position)
  const scaleVariation = 0.05;
  const positionVariation = 20;
  
  effect.startScale += (random() - 0.5) * scaleVariation;
  effect.endScale += (random() - 0.5) * scaleVariation;
  effect.startX += (random() - 0.5) * positionVariation;
  effect.endX += (random() - 0.5) * positionVariation;
  effect.startY += (random() - 0.5) * positionVariation;
  effect.endY += (random() - 0.5) * positionVariation;
  
  // Ensure scales stay within reasonable bounds
  effect.startScale = Math.max(1.0, Math.min(1.3, effect.startScale));
  effect.endScale = Math.max(1.0, Math.min(1.3, effect.endScale));
  
  return effect;
}

/**
 * Create a seeded random number generator for deterministic results
 */
function createSeededRandom(seed: number): () => number {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

/**
 * Generate transition filter between two clips with crossfade
 */
export function generateTransitionFilter(
  duration: number = 0.5,
  offset: number = 0
): string {
  return `[0:v][1:v]xfade=transition=fade:duration=${duration}:offset=${offset}[v]`;
}

/**
 * Calculate optimal transition timing for multiple clips
 */
export function calculateTransitionTimings(
  clipDurations: number[],
  transitionDuration: number = 0.5
): Array<{ start: number; end: number; offset: number }> {
  const timings: Array<{ start: number; end: number; offset: number }> = [];
  let currentTime = 0;
  
  for (let i = 0; i < clipDurations.length - 1; i++) {
    const clipDuration = clipDurations[i];
    const nextClipStart = currentTime + clipDuration - transitionDuration;
    
    timings.push({
      start: currentTime,
      end: currentTime + clipDuration,
      offset: nextClipStart,
    });
    
    currentTime += clipDuration - transitionDuration;
  }
  
  return timings;
}