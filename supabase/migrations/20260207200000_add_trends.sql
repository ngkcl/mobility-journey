-- Add trends table for metric trend summaries

create table if not exists public.trends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  metric_key text not null,
  trend text not null check (trend in ('improving', 'worsening', 'stable')),
  change_value numeric,
  change_percent numeric,
  start_avg numeric,
  end_avg numeric,
  window_start date,
  window_end date,
  sample_size integer,
  lower_is_better boolean
);

create index if not exists trends_metric_window_idx on public.trends (metric_key, window_end desc);
create unique index if not exists trends_metric_window_unique on public.trends (metric_key, window_start, window_end);

alter table trends enable row level security;
create policy "allow_all_trends" on trends for all using (true) with check (true);
