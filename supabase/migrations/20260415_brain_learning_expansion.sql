-- Brain Learning Rules Table
-- Stores user-defined expense classification rules that the brain learns from
CREATE TABLE IF NOT EXISTS brain_learning_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('expense_filter', 'expense_tag', 'threshold', 'category_map', 'personal_marker')),
  match_pattern TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'title',
  action TEXT NOT NULL,
  action_value TEXT,
  category TEXT,
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  times_triggered INTEGER DEFAULT 0,
  notes TEXT
);

-- Expansion Analysis Table
-- Stores planned expansion nodes with feasibility calculations
CREATE TABLE IF NOT EXISTS expansion_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_name TEXT NOT NULL,
  location TEXT,
  location_type TEXT CHECK (location_type IN ('new_location', 'existing_shop', 'mobile', 'kiosk', 'warehouse')),
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'feasibility', 'approved', 'rejected', 'active')),
  rent_budget DECIMAL(12, 2) DEFAULT 0,
  employees_planned INTEGER DEFAULT 0,
  avg_salary DECIMAL(10, 2) DEFAULT 0,
  initial_investment DECIMAL(12, 2) DEFAULT 0,
  projected_revenue DECIMAL(12, 2) DEFAULT 0,
  monthly_overhead DECIMAL(12, 2) DEFAULT 0,
  break_even_months INTEGER,
  feasibility_score INTEGER,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);

-- Expansion Routes Table
-- Stores route analysis for expansion planning
CREATE TABLE IF NOT EXISTS expansion_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expansion_id UUID REFERENCES expansion_analysis(id) ON DELETE CASCADE,
  route_name TEXT,
  distance_km DECIMAL(8, 2),
  daily_traffic INTEGER,
  competitor_count INTEGER,
  avg_transaction DECIMAL(10, 2) DEFAULT 0,
  rent_per_sqm DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain Feedback Table
-- Stores user feedback on flagged expenses
CREATE TABLE IF NOT EXISTS brain_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id TEXT NOT NULL,
  expense_source TEXT NOT NULL,
  original_classification TEXT,
  feedback_action TEXT NOT NULL CHECK (feedback_action IN ('approve', 'reject', 'reclassify', 'ignore', 'create_rule')),
  new_classification TEXT,
  new_category TEXT,
  created_rule_id UUID REFERENCES brain_learning_rules(id),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_brain_rules_type ON brain_learning_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_brain_rules_active ON brain_learning_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brain_rules_pattern ON brain_learning_rules(match_pattern);
CREATE INDEX IF NOT EXISTS idx_expansion_status ON expansion_analysis(status);
CREATE INDEX IF NOT EXISTS idx_feedback_expense ON brain_feedback(expense_id, expense_source);
