-- ═══════════════════════════════════════════════════════════════════════════════
-- FinanceOS — Complete Database Schema
-- Single-file init: users, auth, Plaid, core data, indexes
-- Run order: this is the ONLY init script in docker-entrypoint-initdb.d
-- ═══════════════════════════════════════════════════════════════════════════════

-- Required Postgres extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USERS & AUTH
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   TEXT UNIQUE NOT NULL,
  password_hash           TEXT NOT NULL,
  name                    TEXT,
  plan                    TEXT NOT NULL DEFAULT 'free'
                          CHECK (plan IN ('free', 'pro', 'lifetime')),
  force_password_change   BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  subscription_status     TEXT NOT NULL DEFAULT 'inactive'
                          CHECK (subscription_status IN (
                            'active','inactive','trialing','past_due','canceled','unpaid'
                          )),
  trial_ends_at           TIMESTAMPTZ,
  canceled_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- email is already UNIQUE → implicit index; explicit one kept for legacy compat
CREATE INDEX IF NOT EXISTS idx_users_email       ON app_users (email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_cust ON app_users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_stripe_sub  ON app_users (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- JWT refresh token rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens (user_id);
-- token_hash already UNIQUE → implicit index

-- Per-user encrypted bank credentials (AES)
CREATE TABLE IF NOT EXISTS user_bank_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  institution       TEXT NOT NULL,
  username_enc      TEXT NOT NULL,
  password_enc      TEXT NOT NULL,
  sync_method       TEXT NOT NULL DEFAULT 'finance_dl'
                    CHECK (sync_method IN ('ofx_direct','finance_dl','manual')),
  enabled           BOOLEAN NOT NULL DEFAULT true,
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, institution)
);
CREATE INDEX IF NOT EXISTS idx_user_creds_user ON user_bank_credentials (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PLAID INTEGRATION
-- ─────────────────────────────────────────────────────────────────────────────

-- Bank connections via Plaid Link
CREATE TABLE IF NOT EXISTS plaid_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_id             TEXT UNIQUE NOT NULL,
  access_token_enc    TEXT NOT NULL,
  institution_id      TEXT,
  institution_name    TEXT,
  institution_logo    TEXT,
  institution_color   TEXT,
  status              TEXT NOT NULL DEFAULT 'good'
                      CHECK (status IN ('good','error','login_required','pending')),
  error_code          TEXT,
  error_message       TEXT,
  consent_expires_at  TIMESTAMPTZ,
  cursor              TEXT,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plaid_items_user         ON plaid_items (user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_user_created ON plaid_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plaid_items_item_user    ON plaid_items (item_id, user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_status       ON plaid_items (status)
  WHERE status != 'login_required';

-- Accounts within each Plaid connection
CREATE TABLE IF NOT EXISTS plaid_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id     UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id        TEXT NOT NULL,
  name              TEXT,
  official_name     TEXT,
  type              TEXT,
  subtype           TEXT,
  mask              TEXT,
  current_balance   NUMERIC(14,2),
  available_balance NUMERIC(14,2),
  credit_limit      NUMERIC(14,2),
  currency_code     TEXT NOT NULL DEFAULT 'USD',
  hidden            BOOLEAN NOT NULL DEFAULT false,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plaid_item_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_item ON plaid_accounts (plaid_item_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user ON plaid_accounts (user_id);

-- Transactions synced from Plaid
CREATE TABLE IF NOT EXISTS plaid_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plaid_account_id  UUID REFERENCES plaid_accounts(id) ON DELETE SET NULL,
  transaction_id    TEXT UNIQUE NOT NULL,
  account_id_plaid  TEXT NOT NULL,
  amount            NUMERIC(14,2) NOT NULL,
  currency_code     TEXT NOT NULL DEFAULT 'USD',
  name              TEXT,
  merchant_name     TEXT,
  category          TEXT[],
  primary_category  TEXT,
  detailed_category TEXT,
  pending           BOOLEAN NOT NULL DEFAULT false,
  date              DATE NOT NULL,
  authorized_date   DATE,
  payment_channel   TEXT,
  logo_url          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plaid_txn_user_date ON plaid_transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_plaid_txn_acct      ON plaid_transactions (plaid_account_id);

-- Plaid account → Firefly III account mapping
CREATE TABLE IF NOT EXISTS plaid_firefly_map (
  plaid_account_id    TEXT PRIMARY KEY,
  firefly_account_id  TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INSTITUTION SYNC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS institution_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES app_users(id) ON DELETE CASCADE,
  institution_name    TEXT NOT NULL,
  sync_method         TEXT NOT NULL
                      CHECK (sync_method IN ('ofx_direct', 'finance_dl', 'manual')),
  last_sync_at        TIMESTAMPTZ,
  last_sync_status    TEXT CHECK (last_sync_status IN ('success', 'error', 'pending', 'skipped')),
  firefly_account_map JSONB NOT NULL DEFAULT '{}',
  config              JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, institution_name)
);
CREATE INDEX IF NOT EXISTS idx_inst_cfg_user ON institution_config (user_id);

-- Seed default institution configs (user_id NULL = system defaults)
INSERT INTO institution_config (institution_name, sync_method) VALUES
  ('chase',     'ofx_direct'),
  ('usaa',      'ofx_direct'),
  ('capitalone','finance_dl'),
  ('macu',      'finance_dl'),
  ('m1finance', 'finance_dl'),
  ('fidelity',  'manual')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SYNC LOG
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES app_users(id) ON DELETE SET NULL,
  institution_name      TEXT,
  sync_method           TEXT,
  status                TEXT NOT NULL CHECK (status IN ('success', 'error', 'running')),
  transactions_added    INT NOT NULL DEFAULT 0,
  transactions_skipped  INT NOT NULL DEFAULT 0,
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);
-- Composite: per-user listing sorted by start time
CREATE INDEX IF NOT EXISTS idx_sync_log_user_started
  ON sync_log (user_id, started_at DESC);
-- Composite: DISTINCT ON institution_name per user (status page)
CREATE INDEX IF NOT EXISTS idx_sync_log_user_inst_completed
  ON sync_log (user_id, institution_name, completed_at DESC);
-- Composite: upload log by method
CREATE INDEX IF NOT EXISTS idx_sync_log_user_method_completed
  ON sync_log (user_id, sync_method, completed_at DESC);
-- Background job: find running syncs
CREATE INDEX IF NOT EXISTS idx_sync_log_inst_status
  ON sync_log (institution_name, status)
  WHERE status = 'running';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. NET WORTH SNAPSHOTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  user_id           UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  total_assets      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_liabilities NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_worth         NUMERIC(14,2) NOT NULL DEFAULT 0,
  breakdown         JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snapshot_date)
);
-- Covering index for common "latest N snapshots" query
CREATE INDEX IF NOT EXISTS idx_nw_user_date
  ON net_worth_snapshots (user_id, snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  merchant_name       TEXT,
  amount              NUMERIC(14,2),
  frequency           TEXT CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'annual', 'irregular')),
  next_expected_date  DATE,
  firefly_account_id  TEXT,
  category            TEXT,
  ai_recommendation   TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'cancelled', 'paused', 'unknown')),
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_charged_at     TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_user_status
  ON subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_user_amount
  ON subscriptions (user_id, amount DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. INSURANCE POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS insurance_policies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  policy_type             TEXT NOT NULL
                          CHECK (policy_type IN ('home', 'auto', 'life', 'health', 'umbrella', 'disability', 'other')),
  provider                TEXT NOT NULL,
  policy_number           TEXT,
  insured_name            TEXT,
  coverage_amount         NUMERIC(14,2),
  premium_amount          NUMERIC(14,2),
  premium_frequency       TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (premium_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual')),
  deductible              NUMERIC(14,2),
  renewal_date            DATE,
  start_date              DATE,
  notes                   TEXT,
  ai_review               TEXT,
  ai_review_generated_at  TIMESTAMPTZ,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_user_type
  ON insurance_policies (user_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_insurance_user_active
  ON insurance_policies (user_id)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ALERT RULES & HISTORY
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  rule_type       TEXT NOT NULL CHECK (rule_type IN (
    'large_transaction', 'low_balance', 'unusual_spend', 'bill_due',
    'subscription_detected', 'subscription_cancelled_charge',
    'insurance_renewal', 'asset_value_change', 'net_worth_milestone',
    'note_payment_overdue', 'vehicle_value_reminder', 'sync_failure'
  )),
  name            TEXT NOT NULL,
  threshold       NUMERIC(14,2),
  account_filter  TEXT,
  category_filter TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  notify_push     BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user
  ON alert_rules (user_id);
-- Partial index: only enabled rules matter for evaluation
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled_type
  ON alert_rules (user_id, rule_type)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS alert_history (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  rule_type TEXT,
  title     TEXT NOT NULL,
  message   TEXT NOT NULL,
  severity  TEXT NOT NULL DEFAULT 'info'
            CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  metadata  JSONB,
  link_url  TEXT,
  read_at   TIMESTAMPTZ,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Primary read pattern: list alerts for user sorted by time
CREATE INDEX IF NOT EXISTS idx_alert_history_user_sent
  ON alert_history (user_id, sent_at DESC);
-- Unread count per user (partial index — only unread rows)
CREATE INDEX IF NOT EXISTS idx_alert_history_user_unread
  ON alert_history (user_id, sent_at DESC)
  WHERE read_at IS NULL;
-- Insights query: filter by user + rule_type
CREATE INDEX IF NOT EXISTS idx_alert_history_user_rule_sent
  ON alert_history (user_id, rule_type, sent_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. FORECASTING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  generated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  horizon_months          INT NOT NULL,
  base_monthly_income     NUMERIC(14,2),
  base_monthly_expenses   NUMERIC(14,2),
  current_net_worth       NUMERIC(14,2),
  scenarios               JSONB NOT NULL
);
-- Main query: latest forecast for user + horizon
CREATE INDEX IF NOT EXISTS idx_forecast_user_horizon_gen
  ON forecast_snapshots (user_id, horizon_months, generated_at DESC);
-- Secondary: latest forecast for user regardless of horizon
CREATE INDEX IF NOT EXISTS idx_forecast_user_gen
  ON forecast_snapshots (user_id, generated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. MANUAL ASSETS (real estate, vehicles, notes, other)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS manual_assets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  asset_type            TEXT NOT NULL
                        CHECK (asset_type IN ('real_estate', 'vehicle', 'note_receivable', 'note_payable', 'business', 'other')),
  current_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
  value_source          TEXT NOT NULL DEFAULT 'manual'
                        CHECK (value_source IN ('homesage_api', 'rentcast_api', 'fhfa_index', 'manual', 'amortization')),
  value_as_of           DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Real estate
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  zip                   TEXT,
  property_type         TEXT CHECK (property_type IN ('primary', 'rental', 'commercial', 'land', 'other')),
  purchase_price        NUMERIC(14,2),
  purchase_date         DATE,
  linked_mortgage_account TEXT,
  -- Vehicle
  vin                   TEXT,
  year                  INT,
  make                  TEXT,
  model                 TEXT,
  trim                  TEXT,
  mileage               INT,
  mileage_updated_date  DATE,
  -- Notes receivable / payable
  note_principal        NUMERIC(14,2),
  note_rate             NUMERIC(7,5),
  note_start_date       DATE,
  note_term_months      INT,
  note_payment_monthly  NUMERIC(14,2),
  note_borrower_name    TEXT,
  -- General
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Primary query: active assets for a user
CREATE INDEX IF NOT EXISTS idx_manual_assets_user_active
  ON manual_assets (user_id, is_active)
  WHERE is_active = true;
-- Filtered by type (forecasting, property refresh jobs)
CREATE INDEX IF NOT EXISTS idx_manual_assets_user_type_active
  ON manual_assets (user_id, asset_type)
  WHERE is_active = true;
-- Background job: property value refresh across all users
CREATE INDEX IF NOT EXISTS idx_manual_assets_real_estate_active
  ON manual_assets (asset_type)
  WHERE asset_type = 'real_estate' AND is_active = true;

-- Asset value history for trend charts
CREATE TABLE IF NOT EXISTS asset_value_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL REFERENCES manual_assets(id) ON DELETE CASCADE,
  value           NUMERIC(14,2) NOT NULL,
  value_source    TEXT,
  recorded_date   DATE NOT NULL,
  api_response    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, recorded_date)
);
CREATE INDEX IF NOT EXISTS idx_asset_value_history_asset
  ON asset_value_history (asset_id, recorded_date DESC);

-- Note payment log (amortization)
CREATE TABLE IF NOT EXISTS note_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES manual_assets(id) ON DELETE CASCADE,
  payment_date      DATE NOT NULL,
  amount_paid       NUMERIC(14,2) NOT NULL,
  principal_portion NUMERIC(14,2),
  interest_portion  NUMERIC(14,2),
  balance_after     NUMERIC(14,2),
  payment_method    TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_payments_asset
  ON note_payments (asset_id, payment_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. AI & IMPORT SUPPORT
-- ─────────────────────────────────────────────────────────────────────────────

-- Merchant → category memory (AI learns over time)
CREATE TABLE IF NOT EXISTS merchant_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_name   TEXT UNIQUE NOT NULL,
  category        TEXT NOT NULL,
  subcategory     TEXT,
  source          TEXT NOT NULL DEFAULT 'ai'
                  CHECK (source IN ('ai', 'user', 'rule')),
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- merchant_name UNIQUE already creates an index

-- De-duplication ledger for imports
CREATE TABLE IF NOT EXISTS imported_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id             TEXT NOT NULL,
  institution_name        TEXT NOT NULL,
  firefly_transaction_id  TEXT,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_id, institution_name)
);
-- The UNIQUE constraint creates the covering index for the lookup pattern

-- Merchant transaction history for anomaly detection
CREATE TABLE IF NOT EXISTS merchant_transaction_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES app_users(id) ON DELETE CASCADE,
  merchant_name     TEXT NOT NULL,
  amount            NUMERIC(14,2) NOT NULL,
  transaction_date  DATE NOT NULL,
  institution_name  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merchant_history_name_date
  ON merchant_transaction_history (merchant_name, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_history_user
  ON merchant_transaction_history (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. UPDATED_AT AUTO-TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
-- Single reusable trigger function instead of manual updated_at = now()

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'app_users', 'user_bank_credentials', 'plaid_items', 'plaid_accounts',
      'institution_config', 'subscriptions', 'insurance_policies',
      'manual_assets', 'merchant_categories'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
      tbl, tbl
    );
  END LOOP;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- triggers already exist on re-run
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- Default admin user: admin@financeos.local / changeme123
-- ⚠ force_password_change is TRUE — user must change password on first login
INSERT INTO app_users (email, password_hash, name, plan, subscription_status, force_password_change)
VALUES (
  'admin@financeos.local',
  '$2a$12$0w06lsBJK/7uU0oF8d6G1.qM4sqP06I3ufRtz9IiZQcrGAvzj96x6',
  'Admin',
  'pro',
  'active',
  true
) ON CONFLICT DO NOTHING;

-- Seed default alert rules for the admin user
INSERT INTO alert_rules (user_id, rule_type, name, threshold, enabled, notify_push)
SELECT u.id, v.rule_type, v.name, v.threshold, true, true
FROM app_users u,
(VALUES
  ('large_transaction',  'Large Transaction Alert',   500.00),
  ('low_balance',        'Low Balance Warning',       1000.00),
  ('sync_failure',       'Sync Failure Notification', NULL),
  ('net_worth_milestone','Net Worth Milestone',       NULL),
  ('asset_value_change', 'Property Value Change',     NULL)
) AS v(rule_type, name, threshold)
WHERE u.email = 'admin@financeos.local'
ON CONFLICT DO NOTHING;

-- Default alert rules for future users are inserted at registration time (in auth.ts).
