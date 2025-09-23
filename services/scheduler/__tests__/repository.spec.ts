import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { upsertCarousel, insertItems, getPendingCarousels, markStatus } from '../src/repository';
import { CarouselStatus } from '../src/types';

describe('repository', () => {
  const tmpDbPath = path.join(__dirname, 'test_carousels.db');
  let db: Database.Database;

  beforeAll(() => {
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
    db = new Database(tmpDbPath);
    db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations/20240901_carousels.sql'), 'utf8'));
    // Patch the DAL to use this DB instance
    require('../src/repository').db = db;
  });
  afterAll(() => { db.close(); if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); });

  it('upsertCarousel is idempotent by hash', async () => {
    const carousel = {
      id: 'c1',
      platform: 'instagram',
      status: 'pending' as CarouselStatus,
      scheduledAt: '2025-09-23T10:00:00Z',
      caption: 'Test',
      cta: 'Buy now',
      hash: 'hash1',
    };
    await upsertCarousel(carousel);
    await upsertCarousel({ ...carousel, id: 'c1b', caption: 'Test2' });
  const rows = db.prepare('SELECT * FROM carousels WHERE hash = ?').all('hash1') as any[];
  expect(rows.length).toBe(1);
  expect(rows[0].caption).toBe('Test2');
  expect(rows[0].id).toBe('c1b');
  });

  it('insertItems and FK cascade', async () => {
    const carousel = {
      id: 'c2',
      platform: 'facebook',
      status: 'pending' as CarouselStatus,
      scheduledAt: '2025-09-23T11:00:00Z',
      caption: 'Test2',
      cta: 'Learn more',
      hash: 'hash2',
    };
    await upsertCarousel(carousel);
    await insertItems([
      { id: 'i1', carouselId: 'c2', mediaPath: '/img/1.jpg', position: 0 },
      { id: 'i2', carouselId: 'c2', mediaPath: '/img/2.jpg', position: 1, sidecarJson: '{"foo":1}' },
    ]);
  let items = db.prepare('SELECT * FROM carousel_items WHERE carousel_id = ?').all('c2') as any[];
  expect(items.length).toBe(2);
  db.prepare('DELETE FROM carousels WHERE id = ?').run('c2');
  items = db.prepare('SELECT * FROM carousel_items WHERE carousel_id = ?').all('c2') as any[];
  expect(items.length).toBe(0);
  });

  it('getPendingCarousels and markStatus', async () => {
    const carousel = {
      id: 'c3',
      platform: 'instagram',
      status: 'pending' as CarouselStatus,
      scheduledAt: '2025-09-23T12:00:00Z',
      caption: 'Pending',
      cta: '',
      hash: 'hash3',
    };
    await upsertCarousel(carousel);
    let pending = await getPendingCarousels(10);
    expect(pending.some(c => c.id === 'c3')).toBe(true);
    await markStatus('c3', 'drafted');
    pending = await getPendingCarousels(10);
    expect(pending.some(c => c.id === 'c3')).toBe(false);
  });

  it('indices exist', () => {
  const idx = db.prepare("PRAGMA index_list('carousels')").all() as any[];
  const idxNames = idx.map(i => i.name);
  expect(idxNames).toContain('idx_carousels_platform_status_scheduled_at');
  expect(idxNames).toContain('idx_carousels_hash');
  });
});
