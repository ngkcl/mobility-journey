-- Add indexes to support exercise library ordering queries

create index if not exists exercises_created_at_idx on public.exercises (created_at desc);
create index if not exists exercises_name_idx on public.exercises (name);
