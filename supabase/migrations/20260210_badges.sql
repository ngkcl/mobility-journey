-- GL-006: Badges table for goal achievement tracking
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying badges by type (uniqueness check)
CREATE INDEX badges_type_idx ON badges (type);

-- Index for ordering by earned date
CREATE INDEX badges_earned_at_idx ON badges (earned_at DESC);
