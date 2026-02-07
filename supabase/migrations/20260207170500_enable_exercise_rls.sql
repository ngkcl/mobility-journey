-- Enable RLS for exercises

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_exercises" ON exercises FOR ALL USING (true) WITH CHECK (true);
