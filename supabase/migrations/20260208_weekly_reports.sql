-- Weekly Reports table for storing generated progress summaries
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  week_end DATE NOT NULL,
  report_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  shared_at TIMESTAMPTZ DEFAULT NULL
);

-- Index for quick lookups by week
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week_start ON weekly_reports(week_start DESC);

-- Enable RLS
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (single user app)
CREATE POLICY "Allow all for authenticated users" ON weekly_reports
  FOR ALL USING (true);
