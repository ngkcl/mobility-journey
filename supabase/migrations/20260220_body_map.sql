-- Body Map Entries — stores pain, tension, and discomfort logs per anatomical zone
CREATE TABLE body_map_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  zone text NOT NULL,
  intensity smallint NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  sensation text NOT NULL DEFAULT 'pain',
  notes text,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_body_map_zone ON body_map_entries(zone);
CREATE INDEX idx_body_map_date ON body_map_entries(recorded_at);
