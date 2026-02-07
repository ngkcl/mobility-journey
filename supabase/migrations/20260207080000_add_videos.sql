-- Add videos table for movement/exercise video tracking with AI analysis
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  duration_seconds integer,
  storage_path text not null,
  public_url text not null,
  thumbnail_url text,
  label text,
  category text not null default 'other',
  notes text,
  analysis_status text not null default 'pending',
  analysis_result jsonb,
  tags text[]
);

-- Index for common queries
create index if not exists idx_videos_recorded_at on public.videos (recorded_at desc);
create index if not exists idx_videos_category on public.videos (category);
create index if not exists idx_videos_analysis_status on public.videos (analysis_status);

-- Enable RLS (permissive for single-user app)
alter table public.videos enable row level security;

create policy "Allow all access to videos"
  on public.videos
  for all
  using (true)
  with check (true);
