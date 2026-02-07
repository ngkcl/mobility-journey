-- Enable Row Level Security on all tables and add permissive policies.
-- Currently there is no auth integration, so we allow all operations.
-- Replace these with proper per-user policies once auth is wired up.

-- photos
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_photos" ON photos FOR ALL USING (true) WITH CHECK (true);

-- metrics
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_metrics" ON metrics FOR ALL USING (true) WITH CHECK (true);

-- analysis_logs
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_analysis_logs" ON analysis_logs FOR ALL USING (true) WITH CHECK (true);

-- todos
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_todos" ON todos FOR ALL USING (true) WITH CHECK (true);
