-- Monthly base programs - the fixed exercises for each month
CREATE TABLE monthly_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL, -- '2026-02' format
  name text NOT NULL, -- 'February 2026 Base'
  active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Exercises assigned to a monthly program with session slots
CREATE TABLE program_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES monthly_programs(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES exercises(id),
  session_slot text NOT NULL, -- 'morning', 'midday', 'evening', 'gym'
  sets integer DEFAULT 2,
  reps integer DEFAULT 10,
  hold_seconds integer,
  side text DEFAULT 'bilateral', -- 'bilateral', 'left', 'right', 'left_focus'
  order_index integer DEFAULT 0,
  mandatory boolean DEFAULT true, -- must be included in plan
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Coach-assigned exercises that override or supplement the base
CREATE TABLE coach_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_date date, -- NULL = ongoing
  expires_date date, -- NULL = until removed
  exercise_id uuid REFERENCES exercises(id),
  session_slot text, -- which session, NULL = any
  sets integer,
  reps integer,
  hold_seconds integer,
  side text,
  priority text DEFAULT 'normal', -- 'high' = must do today, 'normal' = include when possible
  coach_notes text,
  source text DEFAULT 'coach', -- 'coach', 'physio', 'self'
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS policies (open for now, no auth)
ALTER TABLE monthly_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_monthly_programs" ON monthly_programs FOR SELECT USING (true);
CREATE POLICY "public_write_monthly_programs" ON monthly_programs FOR ALL USING (true);
CREATE POLICY "public_read_program_exercises" ON program_exercises FOR SELECT USING (true);
CREATE POLICY "public_write_program_exercises" ON program_exercises FOR ALL USING (true);
CREATE POLICY "public_read_coach_assignments" ON coach_assignments FOR SELECT USING (true);
CREATE POLICY "public_write_coach_assignments" ON coach_assignments FOR ALL USING (true);
