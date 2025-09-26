import { generateCaption, type CaptionContext, type CaptionResult } from '../services/caption.js';
import type { CaptionJobData } from './types.js';

export async function captionJob({ context, channel }: CaptionJobData): Promise<CaptionResult> {
  const captionContext: CaptionContext = context as CaptionContext; // Assuming context matches
  return generateCaption(channel, captionContext);
}