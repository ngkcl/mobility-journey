-- Add exercise logs for per-exercise notes and metrics

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  todo_id uuid not null references public.todos(id) on delete cascade,
  exercise_title text not null,
  log_date date not null,
  pain_level integer check (pain_level between 0 and 10),
  felt_tight boolean,
  modified_form text,
  notes text
);

create index if not exists exercise_logs_todo_idx on public.exercise_logs (todo_id, log_date desc);
create index if not exists exercise_logs_date_idx on public.exercise_logs (log_date desc);

alter table exercise_logs enable row level security;
create policy "allow_all_exercise_logs" on exercise_logs for all using (true) with check (true);
