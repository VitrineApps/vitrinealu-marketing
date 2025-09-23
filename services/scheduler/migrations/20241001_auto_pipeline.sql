BEGIN;

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  source_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  asset_id TEXT,
  content_hash TEXT,
  content_type TEXT,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  buffer_draft_id TEXT,
  caption TEXT,
  hashtags TEXT,
  media_urls TEXT,
  thumbnail_url TEXT,
  scheduled_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(post_id) REFERENCES posts(id)
);

CREATE TABLE IF NOT EXISTS carousel_usage (
  id TEXT PRIMARY KEY,
  carousel_hash TEXT NOT NULL,
  theme TEXT,
  platform TEXT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
