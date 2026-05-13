-- Durable analytics snapshots produced by the read-only Python sidecar.
-- The app reads the latest successful payload for each kind; POS never depends on this table.

CREATE TABLE IF NOT EXISTS analytics_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_results_kind_generated
  ON analytics_results (kind, generated_at DESC);

ALTER TABLE analytics_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analytics_results'
      AND policyname = 'Allow all operations on analytics_results'
  ) THEN
    CREATE POLICY "Allow all operations on analytics_results"
      ON analytics_results FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
