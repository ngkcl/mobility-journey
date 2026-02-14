-- Training Programs: multi-week structured rehabilitation programs
create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  goal_type text not null,
  duration_weeks integer not null,
  current_week integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint tp_status_check check (
    status in ('active', 'completed', 'paused')
  ),
  constraint tp_goal_type_check check (
    goal_type in ('scoliosis_correction', 'pain_reduction', 'posture_improvement', 'general_mobility', 'custom')
  ),
  constraint tp_current_week_check check (current_week >= 1)
);

create index if not exists tp_status_idx on public.training_programs (status);

-- Program phases (release, activate, strengthen, integrate)
create table if not exists public.program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  name text not null,
  description text,
  phase_number integer not null,
  duration_weeks integer not null,
  focus text not null,
  constraint pp_focus_check check (
    focus in ('release', 'activate', 'strengthen', 'integrate')
  ),
  constraint pp_phase_number_check check (phase_number >= 1),
  unique (program_id, phase_number)
);

create index if not exists pp_program_id_idx on public.program_phases (program_id);

-- Program weeks
create table if not exists public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.program_phases(id) on delete cascade,
  week_number integer not null,
  is_deload boolean not null default false,
  intensity_pct integer not null default 100,
  notes text,
  constraint pw_week_number_check check (week_number >= 1),
  constraint pw_intensity_check check (intensity_pct between 0 and 100)
);

create index if not exists pw_phase_id_idx on public.program_weeks (phase_id);

-- Program sessions (specific day workouts within a week)
create table if not exists public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.program_weeks(id) on delete cascade,
  day_of_week integer not null,
  session_type text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  constraint ps_day_check check (day_of_week between 0 and 6),
  constraint ps_type_check check (
    session_type in ('corrective', 'gym', 'rest', 'active_recovery')
  )
);

create index if not exists ps_week_id_idx on public.program_sessions (week_id);

-- Exercise slots within a session
create table if not exists public.program_exercise_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.program_sessions(id) on delete cascade,
  exercise_id text not null,
  slot_order integer not null default 0,
  sets integer not null default 3,
  reps integer,
  hold_seconds integer,
  weight_pct_1rm integer,
  side text,
  rest_seconds integer not null default 60,
  notes text,
  progression_rule text,
  constraint pes_side_check check (
    side is null or side in ('left', 'right', 'both', 'alternating')
  )
);

create index if not exists pes_session_id_idx on public.program_exercise_slots (session_id);
