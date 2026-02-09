create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  description text,
  target_value numeric not null,
  starting_value numeric not null,
  current_value numeric not null,
  deadline date not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'active',
  constraint goals_type_check check (
    type in (
      'pain_reduction',
      'symmetry_improvement',
      'posture_score',
      'workout_consistency',
      'workout_streak',
      'custom'
    )
  ),
  constraint goals_status_check check (
    status in ('active', 'completed', 'failed', 'paused')
  )
);

create index if not exists goals_status_idx
  on public.goals (status);

create index if not exists goals_deadline_idx
  on public.goals (deadline);

create table if not exists public.goal_progress (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  value numeric not null,
  notes text
);

create index if not exists goal_progress_goal_id_idx
  on public.goal_progress (goal_id);

create index if not exists goal_progress_recorded_at_idx
  on public.goal_progress (recorded_at desc);
