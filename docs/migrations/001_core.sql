-- assets
create table if not exists public.assets(
  id uuid primary key default gen_random_uuid(),
  hash text unique,
  file_name text,
  file_size bigint,
  mime_type text,
  source_url text,
  google_file_id text,
  exif jsonb,
  score numeric,
  is_candidate boolean default false,
  status text default 'NEW',
  created_at timestamptz default now()
);
create index if not exists idx_assets_status on public.assets(status);

-- variants
create table if not exists public.variants(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete cascade,
  variant_type text, -- enhanced|safe|cleaned|reel|linkedin
  url text,
  metadata jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_variants_asset on public.variants(asset_id);

-- posts
create table if not exists public.posts(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete set null,
  variant_type text,
  channel text, -- instagram|facebook|tiktok|youtube|linkedin
  caption text,
  buffer_id text,
  status text default 'AWAITING_APPROVAL',
  scheduled_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_posts_status on public.posts(status);

-- metrics
create table if not exists public.metrics(
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  channel text,
  views int default 0,
  clicks int default 0,
  comments int default 0,
  shares int default 0,
  saves int default 0,
  profile_visits int default 0,
  ctr numeric,
  collected_at timestamptz default now()
);

-- (optional) simple RLS off for now:
alter table public.assets enable row level security;
alter table public.variants enable row level security;
alter table public.posts enable row level security;
alter table public.metrics enable row level security;
-- dev policy (open):
do $$ begin
  create policy dev_all_assets on public.assets for all using (true) with check (true);
  create policy dev_all_variants on public.variants for all using (true) with check (true);
  create policy dev_all_posts on public.posts for all using (true) with check (true);
  create policy dev_all_metrics on public.metrics for all using (true) with check (true);
exception when duplicate_object then null; end $$;