-- Staff Sessions Table for Shop POS Login
CREATE TABLE IF NOT EXISTS staff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Index for quick token lookup
CREATE INDEX IF NOT EXISTS idx_staff_sessions_token ON staff_sessions(token_hash);

-- Index for employee lookup
CREATE INDEX IF NOT EXISTS idx_staff_sessions_employee ON staff_sessions(employee_id);

-- Auto-cleanup of expired sessions (optional, can be run periodically)
-- DELETE FROM staff_sessions WHERE expires_at < NOW();
