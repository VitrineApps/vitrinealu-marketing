import { describe, it, expect, beforeEach } from '@jest/globals';
import { Repository, PostStatus } from '../src/repository.js';

const makeDate = (value: string): Date => new Date(value);

const makeDraftInput = (overrides: Partial<{ contentHash: string; platform: string; status: PostStatus; scheduledAt: Date }> = {}) => ({
  contentHash: overrides.contentHash ?? 'hash-' + Math.random().toString(36).slice(2),
  platform: overrides.platform ?? 'instagram',
  caption: 'Sample caption',
  hashtags: ['#one', '#two'],
  mediaUrls: ['https://example.com/media.jpg'],
  scheduledAt: overrides.scheduledAt ?? makeDate('2024-01-15T10:00:00Z'),
  status: overrides.status ?? 'pending_approval' as PostStatus,
});

describe('Repository', () => {
  let repository: Repository;

  beforeEach(() => {
    repository = new Repository(':memory:');
  });

  it('inserts and retrieves a post', () => {
    const post = repository.insertPost({
      id: 'post-1',
      assetId: 'asset-1',
      contentHash: 'hash-1',
      platform: 'instagram',
      status: 'pending_approval',
      caption: 'Hello world',
      hashtags: ['#hello'],
      mediaUrls: ['https://example.com/a.jpg'],
      thumbnailUrl: 'https://example.com/thumb.jpg',
      scheduledAt: makeDate('2024-01-15T10:00:00Z'),
    });

    const retrieved = repository.getPostById(post.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.caption).toBe('Hello world');
    expect(retrieved?.mediaUrls).toEqual(['https://example.com/a.jpg']);
    expect(retrieved?.contentHash).toBe('hash-1');
  });

  it('creates a post from shorthand input', () => {
    const created = repository.createPost(makeDraftInput({ contentHash: 'unique-hash' }));
    expect(created.id).toMatch(/^.+/);
    const loaded = repository.getPost(created.id);
    expect(loaded?.contentHash).toBe('unique-hash');
  });

  it('updates post status and attaches buffer draft', () => {
    const post = repository.createPost(makeDraftInput({ status: 'draft' }));
    expect(repository.updatePostStatus(post.id, 'approved')).toBe(true);
    expect(repository.attachBufferDraft(post.id, 'draft-123')).toBe(true);
    const reloaded = repository.getPost(post.id);
    expect(reloaded?.status).toBe('pending_approval');
    expect(reloaded?.bufferDraftId).toBe('draft-123');
  });

  it('checks for existing content hashes', () => {
    repository.createPost(makeDraftInput({ contentHash: 'hash-exists' }));
    expect(repository.postExists('hash-exists')).toBe(true);
    expect(repository.postExists('hash-missing')).toBe(false);
  });

  it('lists posts by status with limit', () => {
    repository.createPost(makeDraftInput({ contentHash: 'hash-a', status: 'draft' }));
    repository.createPost(makeDraftInput({ contentHash: 'hash-b', status: 'draft' }));
    repository.createPost(makeDraftInput({ contentHash: 'hash-c', status: 'draft' }));
    const drafts = repository.getPostsByStatus('draft', 2);
    expect(drafts).toHaveLength(2);
    expect(drafts.every((post) => post.status === 'draft')).toBe(true);
  });

  it('filters posts for digest window', () => {
    repository.createPost(makeDraftInput({ status: 'pending_approval', contentHash: 'prev', scheduledAt: makeDate('2024-01-10T10:00:00Z') }));
    repository.createPost(makeDraftInput({ status: 'pending_approval', contentHash: 'in-range', scheduledAt: makeDate('2024-01-12T10:00:00Z') }));
    repository.createPost(makeDraftInput({ status: 'draft', contentHash: 'wrong-status', scheduledAt: makeDate('2024-01-13T10:00:00Z') }));

    const posts = repository.getPostsForDigest(makeDate('2024-01-11T00:00:00Z'), makeDate('2024-01-15T00:00:00Z'));
    expect(posts.map((p) => p.contentHash)).toEqual(['in-range']);
  });

  it('records approvals', () => {
    const post = repository.createPost(makeDraftInput({ contentHash: 'hash-approval' }));
    const approval = repository.recordApproval(post.id, 'approve', 'tester', 'looks good');
    expect(approval.postId).toBe(post.id);
    const approvals = repository.getApprovalsForPost(post.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].actor).toBe('tester');
  });

  it('tracks carousel usage', () => {
    repository.trackCarouselUsage('carousel-1', 'theme-a', 'instagram');
    const recent = repository.getRecentlyUsedCarousels(30);
    expect(recent).toHaveLength(1);
    expect(recent[0].carouselId).toBe('carousel-1');

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const period = repository.getCarouselsUsedInPeriod(start, end, 'instagram');
    expect(period).toHaveLength(1);
    expect(period[0].platform).toBe('instagram');
  });
});
