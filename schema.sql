create extension if not exists pgcrypto;

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  title text not null,
  summary text not null default '',
  category text not null default 'other',
  severity text not null default 'monitor',
  confidence text not null default 'low',
  review_status text not null default 'needs_review',
  location_text text,
  region text,
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  source_name text not null,
  source_url text not null,
  source_item_url text not null,
  source_excerpt text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incidents_last_seen_idx on public.incidents (last_seen_at desc);
create index if not exists incidents_category_idx on public.incidents (category);
create index if not exists incidents_status_idx on public.incidents (status);
create index if not exists incidents_review_status_idx on public.incidents (review_status);

create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_url text not null,
  status text not null default 'started',
  items_found integer not null default 0,
  items_saved integer not null default 0,
  error_message text
);

-- MVP uses server-side service-role access only. Do not expose the service key.
alter table public.incidents enable row level security;
alter table public.collection_runs enable row level security;
-- No public policies are created. Server-side routes use the service-role key.
