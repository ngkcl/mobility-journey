alter table if exists public.todos
  add column if not exists schedule_days text[];
