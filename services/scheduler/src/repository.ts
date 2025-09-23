
import Database from 'better-sqlite3';
import path from 'path';
import { CarouselStatus } from './types';

const DB_PATH = process.env.SCHEDULER_DB_PATH || path.resolve(__dirname, '../../scheduler.db');
export const db = new Database(DB_PATH);

export async function upsertCarousel(c: {
  id: string;
  platform: string;
  status: CarouselStatus;
  scheduledAt?: string;
  caption?: string;
  cta?: string;
  hash: string;
}): Promise<void> {
  db.prepare(`INSERT INTO carousels (id, platform, status, scheduled_at, caption, cta, hash)
    VALUES (@id, @platform, @status, @scheduledAt, @caption, @cta, @hash)
    ON CONFLICT(hash) DO UPDATE SET
      id=excluded.id,
      platform=excluded.platform,
      status=excluded.status,
      scheduled_at=excluded.scheduled_at,
      caption=excluded.caption,
      cta=excluded.cta
  `).run(c);
}

export async function insertItems(items: Array<{
  id: string;
  carouselId: string;
  mediaPath: string;
  sidecarJson?: string;
  position: number;
}>): Promise<void> {
  const stmt = db.prepare(`INSERT INTO carousel_items (id, carousel_id, media_path, sidecar_json, position)
    VALUES (@id, @carouselId, @mediaPath, @sidecarJson, @position)`);
  const tx = db.transaction((arr) => { for (const i of arr) stmt.run(i); });
  tx(items);
}

export async function getPendingCarousels(limit: number): Promise<any[]> {
  return db.prepare(`SELECT * FROM carousels WHERE status = 'pending' ORDER BY scheduled_at ASC LIMIT ?`).all(limit);
}

export async function markStatus(id: string, status: CarouselStatus): Promise<void> {
  db.prepare(`UPDATE carousels SET status = ? WHERE id = ?`).run(status, id);
}