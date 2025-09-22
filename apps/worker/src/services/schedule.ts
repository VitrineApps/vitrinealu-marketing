import { env } from '../config.js';

export interface PostData {
  mediaUrl: string;
  caption: string;
  scheduledAt: string;
  profileIds: string[];
}

export interface BufferResult {
  bufferId: string;
  profileId: string;
}

async function createBufferUpdate(post: PostData, token: string): Promise<BufferResult[]> {
  const payload = {
    text: post.caption,
    profile_ids: post.profileIds,
    now: false,
    draft: false,
    scheduled_at: post.scheduledAt,
    media: { link: post.mediaUrl }
  };

  let attempt = 0;
  const maxAttempts = 5;
  while (attempt < maxAttempts) {
    try {
      const response = await fetch('https://api.bufferapp.com/1/updates/create.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Buffer API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { update?: { id?: string } };
      const bufferId = data.update?.id;
      if (!bufferId) {
        throw new Error('No update ID returned from Buffer');
      }

      // Return for each profileId
      return post.profileIds.map(profileId => ({ bufferId, profileId }));
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      attempt++;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max attempts exceeded');
}

export async function schedulePosts(posts: PostData[]): Promise<BufferResult[]> {
  if (!env.BUFFER_ACCESS_TOKEN) {
    throw new Error('BUFFER_ACCESS_TOKEN not configured');
  }

  const results: BufferResult[] = [];
  for (const post of posts) {
    const postResults = await createBufferUpdate(post, env.BUFFER_ACCESS_TOKEN);
    results.push(...postResults);
  }
  return results;
}