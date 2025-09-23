import { VideoProfile, VIDEO_PROFILES } from './types';

/**
 * Get video profile by name with optional overrides
 */
export function getVideoProfile(
  profileName: 'reel' | 'linkedin',
  overrides?: Partial<VideoProfile>
): VideoProfile {
  const baseProfile = VIDEO_PROFILES[profileName];
  if (!baseProfile) {
    throw new Error(`Unknown video profile: ${profileName}`);
  }
  
  return {
    ...baseProfile,
    ...overrides,
  };
}

/**
 * Generate FFmpeg video codec settings for profile
 */
export function generateVideoCodecSettings(profile: VideoProfile): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-b:v', profile.bitrate,
    '-maxrate', profile.bitrate,
    '-bufsize', getBufsizeForBitrate(profile.bitrate),
    '-g', profile.keyint.toString(), // Keyframe interval
    '-keyint_min', profile.keyint.toString(),
    '-sc_threshold', '0', // Disable scene change detection
    '-profile:v', 'high',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', // Enable fast start for web playback
  ];
}

/**
 * Generate FFmpeg audio codec settings
 */
export function generateAudioCodecSettings(): string[] {
  return [
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2', // Stereo
  ];
}

/**
 * Generate FFmpeg output format settings
 */
export function generateOutputSettings(profile: VideoProfile): string[] {
  return [
    '-f', 'mp4',
    '-r', profile.fps.toString(),
    '-s', `${profile.width}x${profile.height}`,
  ];
}

/**
 * Calculate buffer size based on bitrate
 */
function getBufsizeForBitrate(bitrate: string): string {
  const bitrateNum = parseInt(bitrate.replace(/[^0-9]/g, ''));
  return `${bitrateNum * 2}k`; // 2x bitrate for buffer
}

/**
 * Get optimal quality settings for different use cases
 */
export function getQualityPreset(
  profile: 'reel' | 'linkedin',
  quality: 'draft' | 'standard' | 'high' = 'standard'
): Partial<VideoProfile> {
  const qualitySettings = {
    draft: {
      reel: { bitrate: '6000k' },
      linkedin: { bitrate: '4000k' },
    },
    standard: {
      reel: { bitrate: '12000k' },
      linkedin: { bitrate: '10000k' },
    },
    high: {
      reel: { bitrate: '14000k' },
      linkedin: { bitrate: '12000k' },
    },
  };
  
  return qualitySettings[quality][profile] || {};
}

/**
 * Validate profile settings
 */
export function validateProfile(profile: VideoProfile): void {
  if (profile.width <= 0 || profile.height <= 0) {
    throw new Error('Profile dimensions must be positive');
  }
  
  if (profile.fps <= 0 || profile.fps > 60) {
    throw new Error('Profile FPS must be between 1 and 60');
  }
  
  if (profile.keyint <= 0) {
    throw new Error('Profile keyint must be positive');
  }
  
  // Validate bitrate format
  if (!/^\d+k$/.test(profile.bitrate)) {
    throw new Error('Profile bitrate must be in format "1000k"');
  }
}

/**
 * Get recommended settings for specific platforms
 */
export function getPlatformRecommendations(platform: 'instagram' | 'tiktok' | 'youtube' | 'linkedin'): {
  profile: 'reel' | 'linkedin';
  quality: 'draft' | 'standard' | 'high';
  maxDuration: number;
} {
  const recommendations = {
    instagram: {
      profile: 'reel' as const,
      quality: 'standard' as const,
      maxDuration: 90, // 90 seconds max for Reels
    },
    tiktok: {
      profile: 'reel' as const,
      quality: 'standard' as const,
      maxDuration: 180, // 3 minutes max
    },
    youtube: {
      profile: 'reel' as const,
      quality: 'high' as const,
      maxDuration: 60, // 60 seconds for Shorts
    },
    linkedin: {
      profile: 'linkedin' as const,
      quality: 'high' as const,
      maxDuration: 600, // 10 minutes max
    },
  };
  
  return recommendations[platform];
}