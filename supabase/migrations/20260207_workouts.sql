create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer,
  notes text,
  energy_level_before integer,
  energy_level_after integer,
  pain_level_before integer,
  pain_level_after integer,
  created_at timestamptz not null default now()
);

create index if not exists workouts_date_idx
  on public.workouts (date desc);

create index if not exists workouts_type_idx
  on public.workouts (type);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  order_index integer not null default 0,
  sets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_exercises_workout_idx
  on public.workout_exercises (workout_id);

create index if not exists workout_exercises_exercise_idx
  on public.workout_exercises (exercise_id);
