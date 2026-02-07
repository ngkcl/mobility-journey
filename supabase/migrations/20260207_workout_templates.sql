create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  exercises jsonb not null default '[]'::jsonb,
  estimated_duration_minutes integer,
  created_at timestamptz not null default now()
);

create index if not exists workout_templates_name_idx
  on public.workout_templates (name);

create index if not exists workout_templates_type_idx
  on public.workout_templates (type);

insert into public.workout_templates (
  name,
  type,
  exercises,
  estimated_duration_minutes
)
select *
from (
  values
    (
      'Morning Corrective',
      'corrective',
      jsonb_build_array(
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Foam Rolling (Right QL/Lat)' limit 1),
          'sets', 2,
          'reps', null,
          'duration', 60,
          'side', 'right',
          'order', 1
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Thoracic Rotations' limit 1),
          'sets', 2,
          'reps', 8,
          'duration', null,
          'side', 'bilateral',
          'order', 2
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Schroth Breathing' limit 1),
          'sets', 3,
          'reps', null,
          'duration', 60,
          'side', 'bilateral',
          'order', 3
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Bird Dogs' limit 1),
          'sets', 3,
          'reps', 8,
          'duration', null,
          'side', 'bilateral',
          'order', 4
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Dead Bugs' limit 1),
          'sets', 3,
          'reps', 10,
          'duration', null,
          'side', 'bilateral',
          'order', 5
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Wall Angels' limit 1),
          'sets', 2,
          'reps', 10,
          'duration', null,
          'side', 'bilateral',
          'order', 6
        )
      ),
      20
    ),
    (
      'Midday Corrective',
      'corrective',
      jsonb_build_array(
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Hip Flexor Stretch' limit 1),
          'sets', 2,
          'reps', null,
          'duration', 45,
          'side', 'bilateral',
          'order', 1
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Thoracic Rotations' limit 1),
          'sets', 2,
          'reps', 8,
          'duration', null,
          'side', 'bilateral',
          'order', 2
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Side Plank (Left Focus)' limit 1),
          'sets', 3,
          'reps', null,
          'duration', 30,
          'side', 'left',
          'order', 3
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Band Pull-Aparts' limit 1),
          'sets', 3,
          'reps', 15,
          'duration', null,
          'side', 'bilateral',
          'order', 4
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Wall Angels' limit 1),
          'sets', 2,
          'reps', 8,
          'duration', null,
          'side', 'bilateral',
          'order', 5
        )
      ),
      15
    ),
    (
      'Evening Corrective',
      'corrective',
      jsonb_build_array(
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Cat-Cow' limit 1),
          'sets', 2,
          'reps', 10,
          'duration', null,
          'side', 'bilateral',
          'order', 1
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Foam Rolling (Right QL/Lat)' limit 1),
          'sets', 2,
          'reps', null,
          'duration', 60,
          'side', 'right',
          'order', 2
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Clamshells (Left Focus)' limit 1),
          'sets', 3,
          'reps', 12,
          'duration', null,
          'side', 'left',
          'order', 3
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Single-Leg Glute Bridges' limit 1),
          'sets', 3,
          'reps', 10,
          'duration', null,
          'side', 'left',
          'order', 4
        ),
        jsonb_build_object(
          'exercise_id', (select id from public.exercises where name = 'Schroth Breathing' limit 1),
          'sets', 3,
          'reps', null,
          'duration', 60,
          'side', 'bilateral',
          'order', 5
        )
      ),
      20
    )
) as seed (
  name,
  type,
  exercises,
  estimated_duration_minutes
)
where not exists (
  select 1 from public.workout_templates existing where existing.name = seed.name
);
