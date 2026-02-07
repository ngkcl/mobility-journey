-- Rework metrics table: drop mm-based measurements, add functional tracking
-- Old columns: shoulder_diff, hip_diff, cobb_angle, flexibility
-- New columns: posture_score, exercise_adherence, functional_milestone, rom_score, symmetry_score

ALTER TABLE metrics
  DROP COLUMN IF EXISTS shoulder_diff,
  DROP COLUMN IF EXISTS hip_diff,
  DROP COLUMN IF EXISTS cobb_angle,
  DROP COLUMN IF EXISTS flexibility;

ALTER TABLE metrics
  ADD COLUMN IF NOT EXISTS posture_score integer,          -- AI comparative score 1-10
  ADD COLUMN IF NOT EXISTS exercise_done boolean,          -- did protocol today?
  ADD COLUMN IF NOT EXISTS exercise_minutes integer,       -- how long
  ADD COLUMN IF NOT EXISTS exercise_names text,            -- which exercises
  ADD COLUMN IF NOT EXISTS functional_milestone text,      -- freetext: "held plank 60s"
  ADD COLUMN IF NOT EXISTS rom_forward_bend integer,       -- range of motion degrees
  ADD COLUMN IF NOT EXISTS rom_lateral integer,            -- lateral flexion degrees
  ADD COLUMN IF NOT EXISTS symmetry_score integer,         -- AI symmetry assessment 1-10
  ADD COLUMN IF NOT EXISTS rib_hump text,                  -- none/mild/moderate/severe
  ADD COLUMN IF NOT EXISTS energy_level integer;           -- 1-10 how you feel

-- Keep: pain_level (1-10), notes, entry_date
