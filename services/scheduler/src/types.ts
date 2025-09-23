
export type CarouselStatus = 'pending'|'drafted'|'scheduled'|'rejected'|'failed';

export interface CarouselDraftInput {
  channelId: string;
  text: string;
  mediaUrls: string[];
  scheduledAt?: string;
  link?: string;
  platform: 'instagram' | 'facebook';
}

export interface CarouselDraftResult {
  updateId: string;
  mediaIds: string[];
  platform: string;
}
