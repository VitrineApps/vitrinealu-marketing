-- Migration: Add Buffer integration and approval workflow columns
-- Date: 2025-09-24
-- Description: Add columns for Buffer draft IDs, approval tracking, and status management

BEGIN;

-- Add new columns to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS buffer_draft_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_by TEXT;

-- Create status enum if it doesn't exist and update status column
DO $$ 
BEGIN
    -- Create enum type for post status
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_status') THEN
        CREATE TYPE post_status AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHED');
    END IF;
    
    -- Update existing status column to use enum (if it's still TEXT)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'status' AND data_type = 'text') THEN
        -- First update existing values to match enum values
        UPDATE posts SET status = 'DRAFT' WHERE status IN ('draft', 'pending', 'created');
        UPDATE posts SET status = 'APPROVED' WHERE status IN ('approved', 'ready');
        UPDATE posts SET status = 'REJECTED' WHERE status IN ('rejected', 'cancelled');
        UPDATE posts SET status = 'PUBLISHED' WHERE status IN ('published', 'live', 'scheduled');
        
        -- Change column type
        ALTER TABLE posts ALTER COLUMN status TYPE post_status USING status::post_status;
    END IF;
END $$;

-- Add metrics table for post performance tracking
CREATE TABLE IF NOT EXISTS post_metrics (
    id SERIAL PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one metrics record per post per platform per fetch time
    UNIQUE(post_id, platform, fetched_at)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_buffer_draft_ids ON posts USING GIN (buffer_draft_ids);
CREATE INDEX IF NOT EXISTS idx_posts_approved_at ON posts(approved_at);
CREATE INDEX IF NOT EXISTS idx_posts_approved_by ON posts(approved_by);
CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_metrics_platform ON post_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_post_metrics_fetched_at ON post_metrics(fetched_at);

-- Add carousel posts table for multi-image post support
CREATE TABLE IF NOT EXISTS carousel_posts (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    image_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(post_id, image_order)
);

CREATE INDEX IF NOT EXISTS idx_carousel_posts_post_id ON carousel_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_carousel_posts_asset_ids ON carousel_posts USING GIN (asset_ids);

-- Add approval tokens table for HMAC validation
CREATE TABLE IF NOT EXISTS approval_tokens (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(post_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_approval_tokens_post_id ON approval_tokens(post_id);
CREATE INDEX IF NOT EXISTS idx_approval_tokens_expires_at ON approval_tokens(expires_at);

COMMIT;