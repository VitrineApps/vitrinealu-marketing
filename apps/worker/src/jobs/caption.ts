import { generateCaption, type CaptionContext } from '../services/caption.js';
import type { CaptionJobData } from './types.js';

export async function captionJob({ context, channel }: CaptionJobData): Promise<{ caption: string; hashtags: string[] }> {
  const captionContext: CaptionContext = context as CaptionContext; // Assuming context matches
  return generateCaption(channel, captionContext);
}