create table if not exists public.posture_sessions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null,
  good_posture_pct numeric,
  slouch_count integer,
  avg_pitch numeric,
  baseline_pitch numeric,
  created_at timestamptz not null default now()
);

create index if not exists posture_sessions_started_at_idx
  on public.posture_sessions (started_at desc);
