-- Exercise library schema + seed data

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  category text not null check (category in ('stretching', 'strengthening', 'mobility', 'posture')),
  target_area text not null check (target_area in ('shoulders', 'spine', 'hips', 'core')),
  instructions text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  default_sets integer,
  default_reps integer,
  default_duration_minutes integer
);

create index if not exists exercises_category_idx on public.exercises (category);
create index if not exists exercises_target_area_idx on public.exercises (target_area);

insert into public.exercises
  (name, category, target_area, instructions, difficulty, default_sets, default_reps, default_duration_minutes)
values
  (
    'Schroth Rotational Breathing',
    'posture',
    'spine',
    'Inhale into the concave side of the ribcage, expand laterally, then exhale while maintaining spinal elongation.',
    'intermediate',
    null,
    null,
    5
  ),
  (
    'Thoracic Extension on Foam Roller',
    'mobility',
    'spine',
    'Support mid-back on a foam roller, gently extend over it, pause, and return to neutral.',
    'beginner',
    2,
    8,
    null
  ),
  (
    'Cat-Cow Flow',
    'mobility',
    'spine',
    'On hands and knees, alternate between spinal flexion and extension with controlled breathing.',
    'beginner',
    2,
    10,
    null
  ),
  (
    'Wall Angels',
    'posture',
    'shoulders',
    'Keep back and arms against a wall, slide arms up and down without arching the low back.',
    'beginner',
    2,
    10,
    null
  ),
  (
    'Scapular Retraction Holds',
    'strengthening',
    'shoulders',
    'Squeeze shoulder blades down and back, hold, then release slowly.',
    'beginner',
    3,
    8,
    null
  ),
  (
    'Bird Dog',
    'strengthening',
    'core',
    'From quadruped, extend opposite arm and leg, keep hips level, return with control.',
    'beginner',
    3,
    8,
    null
  ),
  (
    'Side Plank (Knee)',
    'strengthening',
    'core',
    'From side-lying, support on forearm and knees, lift hips and hold.',
    'intermediate',
    2,
    null,
    1
  ),
  (
    'Hip Flexor Stretch',
    'stretching',
    'hips',
    'Half-kneeling, tuck pelvis and gently shift forward to stretch front hip.',
    'beginner',
    null,
    null,
    2
  ),
  (
    'Glute Bridge',
    'strengthening',
    'hips',
    'Lie on back, feet planted, drive through heels to lift hips, pause, lower slowly.',
    'beginner',
    3,
    10,
    null
  ),
  (
    'Doorway Pec Stretch',
    'stretching',
    'shoulders',
    'Place forearm on doorway, step forward until a stretch is felt across the chest.',
    'beginner',
    null,
    null,
    2
  );
