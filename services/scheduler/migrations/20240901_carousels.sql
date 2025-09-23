-- Migration for carousels and carousel_items
CREATE TABLE IF NOT EXISTS carousels (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  caption TEXT,
  cta TEXT,
  hash TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carousel_items (
  id TEXT PRIMARY KEY,
  carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  media_path TEXT NOT NULL,
  sidecar_json TEXT,
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carousels_platform_status_scheduled_at
  ON carousels(platform, status, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carousels_hash ON carousels(hash);
