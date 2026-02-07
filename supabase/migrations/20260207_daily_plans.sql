create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  plan jsonb not null default '{}'::jsonb,
  reasoning text[] null,
  status text not null default 'generated',
  model text null,
  created_at timestamptz not null default now()
);

create index if not exists daily_plans_date_idx
  on public.daily_plans (plan_date);

create index if not exists daily_plans_status_idx
  on public.daily_plans (status);
