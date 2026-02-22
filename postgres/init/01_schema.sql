-- FinanceOS Supplemental Schema
-- These tables extend Firefly III's database with sync, assets, AI, and alert data

-- Institution sync configuration
CREATE TABLE IF NOT EXISTS institution_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name TEXT UNIQUE NOT NULL,
  sync_method TEXT NOT NULL CHECK (sync_method IN ('ofx_direct', 'finance_dl', 'manual')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'error', 'pending', 'skipped')),
  firefly_account_map JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed institution configs
INSERT INTO institution_config (institution_name, sync_method) VALUES
  ('chase', 'ofx_direct'),
  ('usaa', 'ofx_direct'),
  ('capitalone', 'finance_dl'),
  ('macu', 'finance_dl'),
  ('m1finance', 'finance_dl'),
  ('fidelity', 'manual')
ON CONFLICT (institution_name) DO NOTHING;

-- Daily net worth snapshots for trend charts
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  snapshot_date DATE PRIMARY KEY,
  total_assets NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_liabilities NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_worth NUMERIC(14,2) NOT NULL DEFAULT 0,
  breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sync audit log
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name TEXT,
  sync_method TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'running')),
  transactions_added INT DEFAULT 0,
  transactions_skipped INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_institution ON sync_log(institution_name);

-- AI-detected subscriptions and recurring charges
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  merchant_name TEXT,
  amount NUMERIC(14,2),
  frequency TEXT CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'annual', 'irregular')),
  next_expected_date DATE,
  firefly_account_id TEXT,
  category TEXT,
  ai_recommendation TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'paused', 'unknown')),
  detected_at TIMESTAMPTZ DEFAULT now(),
  last_charged_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insurance policies
CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type TEXT NOT NULL CHECK (policy_type IN ('home', 'auto', 'life', 'health', 'umbrella', 'disability', 'other')),
  provider TEXT NOT NULL,
  policy_number TEXT,
  insured_name TEXT,
  coverage_amount NUMERIC(14,2),
  premium_amount NUMERIC(14,2),
  premium_frequency TEXT DEFAULT 'monthly' CHECK (premium_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual')),
  deductible NUMERIC(14,2),
  renewal_date DATE,
  start_date DATE,
  notes TEXT,
  ai_review TEXT,
  ai_review_generated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Alert rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'large_transaction', 'low_balance', 'unusual_spend', 'bill_due',
    'subscription_detected', 'subscription_cancelled_charge',
    'insurance_renewal', 'asset_value_change', 'net_worth_milestone',
    'note_payment_overdue', 'vehicle_value_reminder', 'sync_failure'
  )),
  name TEXT NOT NULL,
  threshold NUMERIC(14,2),
  account_filter TEXT,
  category_filter TEXT,
  enabled BOOLEAN DEFAULT true,
  notify_push BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default alert rules
INSERT INTO alert_rules (rule_type, name, threshold) VALUES
  ('large_transaction', 'Large transaction alert', 500),
  ('low_balance', 'Low balance warning', 1000),
  ('unusual_spend', 'Unusual spending detected', NULL),
  ('subscription_detected', 'New subscription detected', NULL),
  ('insurance_renewal', 'Insurance renewal reminder (30 days)', 30),
  ('asset_value_change', 'Property value change >5%', 5),
  ('sync_failure', 'Sync failure alert (3 consecutive)', 3)
ON CONFLICT DO NOTHING;

-- Alert history
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  link_url TEXT,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_history_sent ON alert_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_read ON alert_history(read_at) WHERE read_at IS NULL;

-- Forecasting snapshots
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ DEFAULT now(),
  horizon_months INT NOT NULL,
  base_monthly_income NUMERIC(14,2),
  base_monthly_expenses NUMERIC(14,2),
  current_net_worth NUMERIC(14,2),
  scenarios JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forecast_generated ON forecast_snapshots(generated_at DESC);

-- Manual assets (real estate, vehicles, notes, other)
CREATE TABLE IF NOT EXISTS manual_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('real_estate', 'vehicle', 'note_receivable', 'note_payable', 'business', 'other')),
  current_value NUMERIC(14,2) DEFAULT 0,
  value_source TEXT DEFAULT 'manual' CHECK (value_source IN ('homesage_api', 'rentcast_api', 'fhfa_index', 'manual', 'amortization')),
  value_as_of DATE DEFAULT CURRENT_DATE,
  -- Real estate fields
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  property_type TEXT CHECK (property_type IN ('primary', 'rental', 'commercial', 'land', 'other')),
  purchase_price NUMERIC(14,2),
  purchase_date DATE,
  linked_mortgage_account TEXT,  -- Firefly account ID for the mortgage
  -- Vehicle fields
  vin TEXT,
  year INT,
  make TEXT,
  model TEXT,
  trim TEXT,
  mileage INT,
  mileage_updated_date DATE,
  -- Note/loan fields (receivable or payable)
  note_principal NUMERIC(14,2),
  note_rate NUMERIC(7,5),
  note_start_date DATE,
  note_term_months INT,
  note_payment_monthly NUMERIC(14,2),
  note_borrower_name TEXT,
  -- General
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_assets_type ON manual_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_manual_assets_active ON manual_assets(is_active);

-- Asset value history for trend charts
CREATE TABLE IF NOT EXISTS asset_value_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES manual_assets(id) ON DELETE CASCADE,
  value NUMERIC(14,2) NOT NULL,
  value_source TEXT,
  recorded_date DATE NOT NULL,
  api_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, recorded_date)
);
CREATE INDEX IF NOT EXISTS idx_asset_value_history_asset ON asset_value_history(asset_id, recorded_date DESC);

-- Real estate note payment log
CREATE TABLE IF NOT EXISTS note_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES manual_assets(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount_paid NUMERIC(14,2) NOT NULL,
  principal_portion NUMERIC(14,2),
  interest_portion NUMERIC(14,2),
  balance_after NUMERIC(14,2),
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_payments_asset ON note_payments(asset_id, payment_date DESC);

-- Merchant category memory (AI learns over time)
CREATE TABLE IF NOT EXISTS merchant_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  source TEXT DEFAULT 'ai' CHECK (source IN ('ai', 'user', 'rule')),
  confidence NUMERIC(4,3) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merchant_categories_name ON merchant_categories(merchant_name);

-- Tracks transactions already imported to prevent duplicates
CREATE TABLE IF NOT EXISTS imported_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  firefly_transaction_id TEXT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(external_id, institution_name)
);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_ext ON imported_transactions(external_id, institution_name);

-- Merchant transaction history for anomaly detection
CREATE TABLE IF NOT EXISTS merchant_transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  transaction_date DATE NOT NULL,
  institution_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merchant_history_name ON merchant_transaction_history(merchant_name, transaction_date DESC);
