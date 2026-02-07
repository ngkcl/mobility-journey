create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  target_muscles text[],
  description text,
  instructions text,
  sets_default integer,
  reps_default integer,
  duration_seconds_default integer,
  side_specific boolean not null default false,
  video_url text,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists exercises_name_idx
  on public.exercises (name);

create index if not exists exercises_category_idx
  on public.exercises (category);

create index if not exists exercises_target_muscles_idx
  on public.exercises using gin (target_muscles);

insert into public.exercises (
  name,
  category,
  target_muscles,
  description,
  instructions,
  sets_default,
  reps_default,
  duration_seconds_default,
  side_specific,
  video_url,
  image_url
)
select *
from (
  values
    (
      'Bird Dogs',
      'corrective',
      array['core', 'glutes', 'back'],
      'Core stability with spinal alignment focus.',
      'Brace core, extend opposite arm/leg, hold briefly, return with control.',
      3,
      8,
      null,
      false,
      null,
      null
    ),
    (
      'Cat-Cow',
      'mobility',
      array['spine', 'thoracic', 'lumbar'],
      'Spinal mobility and breathing coordination.',
      'Move slowly between flexion and extension, inhale on cow, exhale on cat.',
      2,
      10,
      null,
      false,
      null,
      null
    ),
    (
      'Dead Bugs',
      'corrective',
      array['core', 'obliques'],
      'Anti-extension core control.',
      'Keep low back flat, alternate arm/leg extensions without arching.',
      3,
      10,
      null,
      false,
      null,
      null
    ),
    (
      'Side Plank (Left Focus)',
      'strengthening',
      array['left obliques', 'left glute med', 'core'],
      'Build left-side lateral stability.',
      'Hold side plank on left side, keep hips stacked and ribs down.',
      3,
      null,
      30,
      true,
      null,
      null
    ),
    (
      'Clamshells (Left Focus)',
      'strengthening',
      array['left glute med', 'hip abductors'],
      'Activate left glute med for pelvic balance.',
      'Side-lying, keep feet together, open knee without rolling pelvis.',
      3,
      12,
      null,
      true,
      null,
      null
    ),
    (
      'Hip Flexor Stretch',
      'stretching',
      array['hip flexors', 'quads'],
      'Reduce anterior hip tightness.',
      'Half-kneel, posteriorly tilt pelvis, shift forward gently.',
      2,
      null,
      45,
      false,
      null,
      null
    ),
    (
      'Thoracic Rotations',
      'mobility',
      array['thoracic spine', 'obliques'],
      'Open thoracic rotation and rib mobility.',
      'From quadruped, rotate and reach, keep hips stable.',
      2,
      8,
      null,
      false,
      null,
      null
    ),
    (
      'Foam Rolling (Right QL/Lat)',
      'mobility',
      array['right QL', 'right lat', 'back'],
      'Release right-side tightness.',
      'Slow rolling on right side, pause on tender spots and breathe.',
      2,
      null,
      60,
      true,
      null,
      null
    ),
    (
      'Schroth Breathing',
      'corrective',
      array['diaphragm', 'intercostals'],
      'Breathing pattern for scoliosis correction.',
      'Inhale into concave side, elongate spine, exhale with control.',
      3,
      null,
      60,
      false,
      null,
      null
    ),
    (
      'Wall Angels',
      'mobility',
      array['thoracic', 'shoulders', 'scapular stabilizers'],
      'Improve shoulder alignment and thoracic extension.',
      'Back to wall, ribs down, slide arms overhead without shrugging.',
      2,
      10,
      null,
      false,
      null,
      null
    ),
    (
      'Band Pull-Aparts',
      'strengthening',
      array['rear delts', 'mid back', 'scapular stabilizers'],
      'Strengthen upper back for posture.',
      'Arms straight, pull band apart to chest, squeeze shoulder blades.',
      3,
      15,
      null,
      false,
      null,
      null
    ),
    (
      'Single-Leg Glute Bridges',
      'strengthening',
      array['glutes', 'hamstrings', 'core'],
      'Unilateral glute activation.',
      'Drive through heel, keep pelvis level, pause at top.',
      3,
      10,
      null,
      true,
      null,
      null
    ),
    (
      'Back Squat',
      'gym_compound',
      array['quads', 'glutes', 'core'],
      'Full-body compound strength.',
      'Brace core, sit between hips, drive up through mid-foot.',
      4,
      6,
      null,
      false,
      null,
      null
    ),
    (
      'Bench Press',
      'gym_compound',
      array['chest', 'triceps', 'front delts'],
      'Horizontal press strength.',
      'Feet planted, shoulder blades tucked, press bar to lockout.',
      4,
      6,
      null,
      false,
      null,
      null
    ),
    (
      'Deadlift',
      'gym_compound',
      array['glutes', 'hamstrings', 'back'],
      'Posterior chain strength.',
      'Hinge at hips, keep bar close, stand tall with neutral spine.',
      3,
      5,
      null,
      false,
      null,
      null
    ),
    (
      'Barbell Row',
      'gym_compound',
      array['lats', 'mid back', 'biceps'],
      'Horizontal pull strength.',
      'Hinge forward, pull bar to lower ribs, control the descent.',
      4,
      8,
      null,
      false,
      null,
      null
    ),
    (
      'Overhead Press',
      'gym_compound',
      array['shoulders', 'triceps', 'core'],
      'Vertical press strength.',
      'Squeeze glutes, press overhead without leaning back.',
      3,
      6,
      null,
      false,
      null,
      null
    ),
    (
      'Lat Pulldown',
      'gym_isolation',
      array['lats', 'biceps'],
      'Vertical pull accessory.',
      'Pull bar to upper chest, keep ribs down.',
      3,
      10,
      null,
      false,
      null,
      null
    ),
    (
      'Walking Lunges',
      'gym_compound',
      array['quads', 'glutes', 'core'],
      'Unilateral leg strength and balance.',
      'Step forward, drop back knee, keep torso tall.',
      3,
      10,
      null,
      true,
      null,
      null
    ),
    (
      'Hip Thrust',
      'gym_isolation',
      array['glutes', 'hamstrings'],
      'Glute-focused strength.',
      'Chin tucked, drive hips up, pause at top.',
      4,
      8,
      null,
      false,
      null,
      null
    ),
    (
      'Bicep Curl',
      'gym_isolation',
      array['biceps'],
      'Arm isolation exercise.',
      'Elbows tucked, curl with control, avoid swinging.',
      3,
      12,
      null,
      false,
      null,
      null
    ),
    (
      'Triceps Extension',
      'gym_isolation',
      array['triceps'],
      'Arm isolation exercise.',
      'Keep elbows fixed, extend fully, control back down.',
      3,
      12,
      null,
      false,
      null,
      null
    ),
    (
      'Calf Raise',
      'gym_isolation',
      array['calves'],
      'Lower leg strength.',
      'Pause at top, lower slowly, full range of motion.',
      3,
      15,
      null,
      false,
      null,
      null
    ),
    (
      'Plank',
      'strengthening',
      array['core', 'obliques'],
      'Anti-extension core endurance.',
      'Elbows under shoulders, squeeze glutes, keep body straight.',
      3,
      null,
      45,
      false,
      null,
      null
    ),
    (
      'Treadmill Run',
      'cardio',
      array['cardio', 'legs'],
      'Steady-state cardio conditioning.',
      'Run or walk at steady pace, maintain upright posture.',
      null,
      null,
      900,
      false,
      null,
      null
    )
) as seed (
  name,
  category,
  target_muscles,
  description,
  instructions,
  sets_default,
  reps_default,
  duration_seconds_default,
  side_specific,
  video_url,
  image_url
)
where not exists (
  select 1 from public.exercises existing where existing.name = seed.name
);
