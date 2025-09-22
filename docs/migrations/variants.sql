-- Migration to create variants table for media variants
-- Apply this via Supabase SQL Editor or migration tool

CREATE TABLE variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL,
  url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional: Add index for faster queries
CREATE INDEX idx_variants_asset_id ON variants(asset_id);
CREATE INDEX idx_variants_type ON variants(variant_type);

-- Optional: Ensure unique variant types per asset
-- ALTER TABLE variants ADD CONSTRAINT unique_asset_variant UNIQUE (asset_id, variant_type);