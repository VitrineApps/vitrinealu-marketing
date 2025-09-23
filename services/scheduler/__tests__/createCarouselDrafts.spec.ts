import { createCarouselDraftsJob } from '../src/jobs/createCarouselDrafts';
import * as fs from 'fs';
import * as path from 'path';
import { upsertCarousel, insertItems } from '../src/repository';
import { db } from '../src/repository';

jest.mock('../src/captionerClient', () => ({
  generateForCarouselWithRetry: jest.fn(async ({ mediaPaths, platform, brandPath, seed }) => ({
    text: `caption for ${mediaPaths.join(',')}`,
    hashtags: ['#tag'],
    cta: 'CTA',
  }))
}));
jest.mock('../src/bufferClient', () => ({
  createCarouselDraft: jest.fn(async ({ channelId, text, mediaUrls, scheduledAt, platform }: { channelId: string, text: string, mediaUrls: string[], scheduledAt: string, platform: string }) => ({
    updateId: 'mockUpdateId',
    mediaIds: (mediaUrls as string[]).map((_: string, i: number) => `media${i}`),
    platform,
  }))
}));

describe('createCarouselDraftsJob', () => {
  const tmpRoot = path.join(__dirname, 'tmp_carousel');
  beforeAll(() => {
    if (!fs.existsSync(tmpRoot)) fs.mkdirSync(tmpRoot);
  });
  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
  beforeEach(() => {
    db.prepare('DELETE FROM carousels').run();
    db.prepare('DELETE FROM carousel_items').run();
  });

  it('creates drafts from explicit carousel.json', async () => {
    const jobDir = path.join(tmpRoot, 'job1');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'carousel.json'), JSON.stringify({ images: ['a.jpg', 'b.jpg'] }));
    fs.writeFileSync(path.join(jobDir, 'a.jpg'), '');
    fs.writeFileSync(path.join(jobDir, 'b.jpg'), '');
    await createCarouselDraftsJob({ root: tmpRoot, platform: 'instagram', dryRun: false });
    const rows = db.prepare('SELECT * FROM carousels').all();
    expect(rows.length).toBe(1);
  expect((rows[0] as any).platform).toBe('instagram');
    const items = db.prepare('SELECT * FROM carousel_items').all();
    expect(items.length).toBe(2);
  });

  it('infers groups if carousel.json missing', async () => {
    const jobDir = path.join(tmpRoot, 'job2');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, '1.jpg'), '');
    fs.writeFileSync(path.join(jobDir, '2.jpg'), '');
    fs.writeFileSync(path.join(jobDir, '3.jpg'), '');
    await createCarouselDraftsJob({ root: tmpRoot, platform: 'facebook', dryRun: false });
    const rows = db.prepare('SELECT * FROM carousels').all();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('is idempotent by hash', async () => {
    const jobDir = path.join(tmpRoot, 'job3');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'carousel.json'), JSON.stringify({ images: ['a.jpg', 'b.jpg'] }));
    fs.writeFileSync(path.join(jobDir, 'a.jpg'), '');
    fs.writeFileSync(path.join(jobDir, 'b.jpg'), '');
    await createCarouselDraftsJob({ root: tmpRoot, platform: 'instagram', dryRun: false });
    await createCarouselDraftsJob({ root: tmpRoot, platform: 'instagram', dryRun: false });
    const rows = db.prepare('SELECT * FROM carousels').all();
    expect(rows.length).toBe(1);
  });

  it('respects dry-run', async () => {
    const jobDir = path.join(tmpRoot, 'job4');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'carousel.json'), JSON.stringify({ images: ['a.jpg', 'b.jpg'] }));
    fs.writeFileSync(path.join(jobDir, 'a.jpg'), '');
    fs.writeFileSync(path.join(jobDir, 'b.jpg'), '');
    await createCarouselDraftsJob({ root: tmpRoot, platform: 'facebook', dryRun: true });
    const rows = db.prepare('SELECT * FROM carousels').all();
    expect(rows.length).toBe(0);
  });
});
