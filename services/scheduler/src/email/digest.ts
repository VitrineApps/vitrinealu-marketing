import type { Post } from '../repository.js';
import { config } from '../config.js';
import { DigestBuilder } from './digestBuilder.js';

export class DigestGenerator {
  private readonly builder = new DigestBuilder(config.brandConfig);

  generateDigest(posts: Post[], weekStart: Date, weekEnd: Date): string {
    return this.builder.buildHtml(posts, { weekStart, weekEnd });
  }

  generateTextDigest(posts: Post[], weekStart: Date, weekEnd: Date): string {
    return this.builder.buildText(posts, { weekStart, weekEnd });
  }

  getSubjectLine(postCount: number, weekStart: Date): string {
    const brandName = config.brandConfig.name ?? 'VitrineAlu';
    const formatted = weekStart.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    const label = postCount === 1 ? 'post' : 'posts';
    return brandName + ' Content Digest: ' + postCount + ' ' + label + ' for week of ' + formatted;
  }
}
