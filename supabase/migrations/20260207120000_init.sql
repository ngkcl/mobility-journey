-- Initial schema for Mobility Journey

create extension if not exists "pgcrypto";

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  taken_at timestamptz not null default now(),
  view text not null check (view in ('front', 'back', 'left', 'right')),
  storage_path text,
  public_url text,
  notes text
);

create index if not exists photos_taken_at_idx on public.photos (taken_at desc);

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entry_date date not null,
  cobb_angle numeric,
  pain_level numeric,
  shoulder_diff numeric,
  hip_diff numeric,
  flexibility numeric,
  notes text
);

create index if not exists metrics_entry_date_idx on public.metrics (entry_date desc);

create table if not exists public.analysis_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entry_date date not null,
  category text not null check (category in ('ai', 'personal', 'specialist')),
  title text,
  content text not null
);

create index if not exists analysis_logs_entry_date_idx on public.analysis_logs (entry_date desc);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  details text,
  completed boolean not null default false,
  completed_at timestamptz,
  due_date date,
  category text
);

create index if not exists todos_completed_idx on public.todos (completed, created_at desc);
