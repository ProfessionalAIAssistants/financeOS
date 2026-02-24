# FinanceOS

A self-hosted, all-in-one personal finance platform that consolidates every bank account, brokerage, asset, and liability into a single real-time dashboard. Built around [Firefly III](https://www.firefly-iii.org/) as the double-entry bookkeeping engine, FinanceOS adds automated bank syncing, AI-powered insights, FIRE forecasting, anomaly detection, and push notifications — all running on your own hardware inside Docker.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Required Variables](#required-variables)
  - [Bank Credentials (OFX Direct Connect)](#bank-credentials-ofx-direct-connect)
  - [Bank Credentials (finance-dl Scraper)](#bank-credentials-finance-dl-scraper)
  - [AI & Valuation APIs](#ai--valuation-apis)
  - [Auth & SaaS](#auth--saas)
  - [Stripe Billing](#stripe-billing)
  - [Plaid](#plaid)
  - [Remote Access](#remote-access)
- [Service Ports](#service-ports)
- [Pages & UI](#pages--ui)
- [API Reference](#api-reference)
- [Automated Jobs (Cron Schedule)](#automated-jobs-cron-schedule)
- [Data Sync Methods](#data-sync-methods)
- [Manual Import](#manual-import)
- [AI Features](#ai-features)
- [Asset Tracking](#asset-tracking)
- [Alerts & Notifications](#alerts--notifications)
- [Database Schema](#database-schema)
- [Authentication & Authorization](#authentication--authorization)
- [Testing](#testing)
- [Development](#development)
- [Backup & Restore](#backup--restore)
- [Project Structure](#project-structure)

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Bank Sync** | OFX Direct Connect (Chase, USAA), Selenium scraping via finance-dl (Capital One, MACU, M1 Finance), Plaid Link (any supported institution), manual OFX/CSV upload |
| **Dashboard** | Real-time net worth, assets vs. liabilities, monthly income/expenses, savings rate, spending by category, emergency fund months |
| **Transactions** | Full CRUD backed by Firefly III double-entry accounting, filterable by type/account/category, transfer support |
| **Accounts** | All Firefly III accounts with live balance polling |
| **Net Worth** | Daily snapshots with historical chart, breakdown by account type |
| **Budgets** | Category-based budget limits with progress tracking |
| **Investments** | Brokerage positions from Fidelity CSV and M1 Finance imports |
| **Assets** | Real estate (auto-valuation via HomeSage/RentCast), vehicles (VIN decode via NHTSA), notes receivable/payable with full amortization schedules |
| **Subscriptions** | AI-detected recurring charges with cost summaries |
| **Insurance** | Policy tracker with optional AI review |
| **Forecasting** | FIRE number calculation, base/optimistic/pessimistic projections, Monte Carlo simulation (1000 trials, p10–p90 bands) |
| **Insights** | OpenAI-generated monthly financial narrative with savings rate, spending trends, and actionable advice |
| **Anomaly Detection** | Flags transactions that deviate significantly from 90-day merchant averages |
| **Alerts** | 12 configurable rule types with push notifications via ntfy |
| **AI Categorization** | Two-tier: regex rules first, OpenAI fallback, with merchant memory |
| **Auth** | JWT access/refresh tokens, httpOnly cookies, bcrypt passwords, plan-gated features |
| **Billing** | Stripe integration (monthly Pro + lifetime plans) |
| **PWA** | Installable on mobile with offline shell, Workbox service worker |
| **Remote Access** | Cloudflare Tunnel for secure HTTPS without port forwarding |
| **Backups** | Automated daily `pg_dump` with 14-day retention |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Compose                         │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ Frontend  │   │ Sync Service │   │   Firefly III    │    │
│  │ React 19  │──▶│  Express/TS  │──▶│  (Bookkeeping)   │    │
│  │  :57072   │   │   :57010     │   │     :57070       │    │
│  └──────────┘   └──────┬───────┘   └────────┬─────────┘    │
│                         │                     │              │
│                    ┌────▼─────────────────────▼────┐        │
│                    │       PostgreSQL 16            │        │
│                    │          :57432                │        │
│                    └──────────────────────────────┘         │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │   ntfy   │   │  Cloudflared │   │    DB Backup     │    │
│  │  :57073  │   │   (tunnel)   │   │  (daily pg_dump) │    │
│  └──────────┘   └──────────────┘   └──────────────────┘    │
│                                                             │
│  ┌──────────┐                                               │
│  │ Adminer  │  (dev profile only)                           │
│  │  :57071  │                                               │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. **Sync Service** pulls transactions from banks via OFX, finance-dl, or Plaid
2. Transactions are upserted into **Firefly III** (double-entry ledger)
3. AI categorization runs on new transactions
4. Anomaly detection compares against merchant history
5. **Frontend** queries the Sync Service API, which proxies Firefly III and reads from PostgreSQL
6. Scheduled jobs run forecasting, insights, net worth snapshots, and subscription detection
7. **ntfy** delivers push notifications for triggered alert rules

---

## Tech Stack

### Backend (sync-service)
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 4 |
| Database | PostgreSQL 16 (via `pg` driver) |
| Bookkeeping | Firefly III API |
| Bank Sync | OFX Direct Connect, finance-dl (Python/Selenium), Plaid SDK |
| AI | OpenAI GPT API |
| Auth | JWT (access + refresh), bcryptjs, httpOnly cookies |
| Billing | Stripe SDK |
| Notifications | ntfy.sh |
| Scheduling | node-cron (11 jobs) |
| File Parsing | PapaParse (CSV), custom OFX parser |
| Logging | Pino (structured JSON) |
| Security | Helmet, CORS, express-rate-limit |
| Testing | Jest 30 + ts-jest |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Components | Radix UI primitives |
| Charts | Recharts |
| Animation | Framer Motion |
| Icons | Lucide React |
| Data Fetching | TanStack React Query + Axios |
| Bank Linking | react-plaid-link |
| PWA | vite-plugin-pwa + Workbox |
| Testing | Vitest 4 + Testing Library |

### Infrastructure
| Component | Technology |
|-----------|-----------|
| Orchestration | Docker Compose |
| Database | PostgreSQL 16 Alpine |
| Reverse Proxy | nginx (frontend container) |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| Notifications | ntfy (self-hosted) |
| DB Admin | Adminer (dev profile) |

---

## Prerequisites

- **Docker** and **Docker Compose** (v2+)
- A machine that stays on (home server, NAS, old laptop, etc.)
- ~2 GB RAM, ~5 GB disk

**Optional:**
- OpenAI API key (for AI categorization, insights, insurance review)
- HomeSage / RentCast API keys (for property auto-valuation)
- Plaid API credentials (for Plaid Link bank connections)
- Stripe account (for billing/SaaS features)
- Cloudflare account (for remote HTTPS access)

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/your-org/financeOS.git
cd financeOS
cp .env.example .env
```

Edit `.env` with your values. At minimum set:
```dotenv
POSTGRES_PASSWORD=choose_a_strong_password
FIREFLY_APP_KEY=any_32_character_random_string
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
```

### 2. Start all services

```bash
docker compose up -d
```

First build takes ~5 minutes. Watch progress:
```bash
docker compose logs -f
```

### 3. Set up Firefly III (one-time)

1. Open http://localhost:57070
2. Create your admin account
3. Go to **Profile → OAuth → Personal Access Tokens → Create**
4. Copy the token into `.env` as `FIREFLY_TOKEN=your_token_here`
5. Restart: `docker compose restart sync-service`

### 4. Access the dashboard

| Service | URL |
|---------|-----|
| **Dashboard** | http://localhost:57072 |
| **Firefly III** | http://localhost:57070 |
| **ntfy Alerts** | http://localhost:57073 |

Default login: `admin@financeos.local` / `changeme123` (you'll be prompted to change the password on first login).

### 5. Mobile access (optional)

Install [Tailscale](https://tailscale.com/) on both your server and phone for secure remote access without port forwarding. Or configure Cloudflare Tunnel (see [Remote Access](#remote-access)).

Subscribe to push alerts by installing the [ntfy app](https://ntfy.sh/) and subscribing to your configured topic (default: `financeos`).

---

## Configuration

All configuration is via environment variables in `.env`. See [.env.example](.env.example) for the full template.

### Required Variables

| Variable | Description | How to Generate |
|----------|-------------|----------------|
| `POSTGRES_PASSWORD` | Database password | Choose a strong passphrase |
| `FIREFLY_APP_KEY` | Firefly III encryption key | Any 32-character string |
| `ENCRYPTION_KEY` | AES key for bank credential storage | `openssl rand -hex 32` |
| `JWT_SECRET` | JWT signing secret | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Refresh token secret (defaults to `JWT_SECRET`) | `openssl rand -hex 32` |
| `FIREFLY_TOKEN` | Firefly III personal access token | Generated in Firefly III UI |

### Bank Credentials (OFX Direct Connect)

For banks that support OFX (Chase, USAA):

```dotenv
CHASE_USERNAME=your_chase_username
CHASE_PASSWORD=your_chase_password
USAA_USERNAME=your_usaa_member_id
USAA_PASSWORD=your_usaa_password
```

### Bank Credentials (finance-dl Scraper)

For banks accessed via Selenium scraping (Capital One, MACU, M1 Finance):

```dotenv
CAPITALONE_USERNAME=your_email
CAPITALONE_PASSWORD=your_password
MACU_USERNAME=your_username
MACU_PASSWORD=your_password
M1_USERNAME=your_m1_email
M1_PASSWORD=your_m1_password
```

### AI & Valuation APIs

```dotenv
OPENAI_API_KEY=sk-...                # Enables AI categorization, monthly insights, insurance review
HOMESAGE_API_KEY=...                  # Auto-values real estate (homesage.ai)
RENTCAST_API_KEY=...                  # Property value fallback (rentcast.io)
```

### Auth & SaaS

```dotenv
JWT_SECRET=...                        # Access token signing
JWT_REFRESH_SECRET=...                # Refresh token signing (separate secret recommended)
JWT_EXPIRES_IN=15m                    # Access token TTL (default: 15 minutes)
JWT_REFRESH_EXPIRES_IN=30d            # Refresh token TTL (default: 30 days)
APP_URL=http://localhost:57072        # Public URL (used for CORS, redirects)
```

### Stripe Billing

```dotenv
STRIPE_SECRET_KEY=sk_live_...         # Or sk_test_... for development
STRIPE_WEBHOOK_SECRET=whsec_...       # From Stripe Dashboard → Webhooks
STRIPE_PRO_PRICE_ID=price_...         # Monthly Pro subscription price ID
STRIPE_LIFETIME_PRICE_ID=price_...    # One-time lifetime purchase price ID
```

### Plaid

```dotenv
PLAID_CLIENT_ID=...                   # From Plaid Dashboard
PLAID_SECRET=...                      # From Plaid Dashboard
PLAID_ENV=sandbox                     # sandbox | development | production
PLAID_WEBHOOK_URL=...                 # Public URL for Plaid webhooks
PLAID_REDIRECT_URI=...                # OAuth redirect URI
```

### Remote Access

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=...           # From Cloudflare Zero Trust → Tunnels
```

### Other

```dotenv
TZ=America/Denver                     # Your timezone (affects cron schedules)
NTFY_TOPIC=financeos                  # Push notification topic name
POSTGRES_USER=financeos               # Database user (default: financeos)
POSTGRES_DB=financeos                 # Database name (default: financeos)
```

---

## Service Ports

| Service | Port | Binding |
|---------|------|---------|
| Dashboard (frontend) | 57072 | `0.0.0.0` |
| Firefly III | 57070 | `0.0.0.0` |
| Sync Service API | 57010 | `0.0.0.0` |
| ntfy (push notifications) | 57073 | `0.0.0.0` |
| PostgreSQL | 57432 | `127.0.0.1` only |
| Adminer (dev profile) | 57071 | `127.0.0.1` only |

---

## Pages & UI

The frontend is a single-page React application with 17 authenticated pages:

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Net worth chart, income/expenses, savings rate, spending by category, emergency fund, subscriptions summary |
| Net Worth | `/networth` | Historical net worth with breakdown by account type |
| Accounts | `/accounts` | All Firefly III accounts with live balances |
| Transactions | `/transactions` | Paginated list with filter/search, inline edit, transfer support |
| Budgets | `/budgets` | Category-based budget limits with progress bars |
| Investments | `/investments` | Brokerage positions and portfolio values |
| Assets | `/assets` | Real estate, vehicles, notes — with valuation history and amortization |
| Subscriptions | `/subscriptions` | AI-detected recurring charges with monthly/annual totals |
| Insurance | `/insurance` | Policy tracker with AI-powered coverage review |
| Forecasting | `/forecasting` | FIRE projections with Monte Carlo simulation charts |
| Insights | `/insights` | AI-generated monthly financial narrative |
| Alerts | `/alerts` | Alert history and configurable notification rules |
| Upload | `/upload` | Drag-and-drop OFX/CSV file import |
| Linked Banks | `/linked-banks` | Plaid Link connections management |
| Settings | `/settings` | Account preferences |
| Billing | `/billing` | Stripe subscription management (Pro/Lifetime) |
| Login | `/login` | Authentication (public) |

**Theme:** Dark mode by default with light mode toggle. Responsive design with mobile navigation.

---

## API Reference

All authenticated endpoints require a valid JWT (via `Authorization: Bearer <token>` header or httpOnly cookie).

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create new user account |
| `POST` | `/api/auth/login` | Login, returns JWT tokens in httpOnly cookies |
| `POST` | `/api/auth/refresh` | Rotate access + refresh tokens |
| `POST` | `/api/plaid/webhook` | Plaid webhook receiver |
| `GET` | `/health` | Health check (DB + Firefly III) |

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/transactions` | List transactions (paginated, filterable by type/account/category) |
| `POST` | `/api/transactions` | Create transaction |
| `PUT` | `/api/transactions/:id` | Update transaction |
| `DELETE` | `/api/transactions/:id` | Delete transaction |
| `GET` | `/api/transactions/meta/accounts` | List asset accounts (for dropdowns) |
| `GET` | `/api/transactions/meta/categories` | List categories (for dropdowns) |

### Net Worth

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/networth/current` | Current net worth with breakdown |
| `GET` | `/api/networth/history` | Historical snapshots (with `days` param) |
| `POST` | `/api/networth/snapshot` | Trigger manual snapshot |

### Insights

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/insights` | List saved insights |
| `GET` | `/api/insights/latest` | Most recent insight |
| `POST` | `/api/insights/generate` | Generate new AI insight |
| `GET` | `/api/insights/spending/categories` | Spending breakdown by category (date range) |
| `GET` | `/api/insights/savings-rate` | Current savings rate |
| `GET` | `/api/insights/emergency-fund` | Emergency fund months calculation |

### Forecasting

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/forecasting/latest` | Latest forecast snapshot |
| `GET` | `/api/forecasting/history` | Forecast history |
| `GET` | `/api/forecasting/:id` | Specific forecast by ID |
| `POST` | `/api/forecasting/generate` | Run new forecast |
| `POST` | `/api/forecasting/whatif` | What-if scenario simulation |

### Assets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/assets` | List all manual assets |
| `POST` | `/api/assets` | Create asset (real_estate, vehicle, note_receivable, note_payable, business, other) |
| `PUT` | `/api/assets/:id` | Update asset |
| `DELETE` | `/api/assets/:id` | Delete asset |
| `GET` | `/api/assets/:id/history` | Asset value history |
| `GET` | `/api/assets/:id/amortization` | Loan amortization schedule |
| `POST` | `/api/assets/:id/payments` | Record note payment |

### Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/alerts` | List alert history |
| `PUT` | `/api/alerts/:id/read` | Mark alert as read |
| `POST` | `/api/alerts/mark-all-read` | Mark all alerts as read |
| `GET` | `/api/alerts/rules` | List configured alert rules |
| `PUT` | `/api/alerts/rules/:id` | Update alert rule |
| `POST` | `/api/alerts/test` | Send test notification |

### Subscriptions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/subscriptions` | List detected subscriptions |
| `GET` | `/api/subscriptions/summary` | Subscription cost summary |
| `PUT` | `/api/subscriptions/:id` | Update subscription status |
| `DELETE` | `/api/subscriptions/:id` | Delete subscription |
| `POST` | `/api/subscriptions/detect` | Trigger AI subscription detection |

### Insurance

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/insurance` | List insurance policies |
| `POST` | `/api/insurance` | Add policy |
| `PUT` | `/api/insurance/:id` | Update policy |
| `DELETE` | `/api/insurance/:id` | Delete policy |
| `POST` | `/api/insurance/:id/ai-review` | AI coverage analysis |

### Budgets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/budgets` | List budget limits |
| `POST` | `/api/budgets` | Create budget limit |
| `PUT` | `/api/budgets/:id` | Update budget limit |
| `DELETE` | `/api/budgets/:id` | Delete budget limit |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tags` | List tags |
| `POST` | `/api/tags` | Create tag |
| `DELETE` | `/api/tags/:name` | Delete tag |
| `POST` | `/api/tags/:name/transactions` | Tag transactions |

### Sync

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sync/status` | Institution configs + last sync + Firefly health |
| `GET` | `/api/sync/log` | Paginated sync audit log |
| `POST` | `/api/sync/force` | Trigger manual sync (all or specific institution) |
| `POST` | `/api/sync/snapshot` | Trigger net worth snapshot |

### Upload

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload OFX/QFX/CSV file (multipart, 50 MB limit) |
| `GET` | `/api/upload/log` | Upload history |

### Plaid

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/plaid/link-token` | Create Plaid Link token |
| `POST` | `/api/plaid/exchange-token` | Exchange public token for access token |
| `GET` | `/api/plaid/items` | List connected Plaid institutions |
| `DELETE` | `/api/plaid/items/:id` | Disconnect Plaid institution |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/refresh` | Refresh tokens |
| `GET` | `/api/auth/me` | Current user info |
| `PUT` | `/api/auth/password` | Change password |
| `POST` | `/api/auth/logout` | Logout (clears cookies) |

### Billing

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/billing/checkout` | Create Stripe Checkout session |
| `POST` | `/api/billing/portal` | Create Stripe Customer Portal session |
| `POST` | `/api/billing/webhook` | Stripe webhook handler |

---

## Automated Jobs (Cron Schedule)

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 15 min | `refreshBalances` | Poll Firefly III for latest account balances, trigger low-balance alerts |
| Every 30 min | `refreshPlaidBalances` | Update balances for Plaid-linked accounts |
| Every 4 hours | `syncPlaidTransactions` | Pull new transactions from Plaid |
| 6 AM, 12 PM, 6 PM | `syncOFX` | OFX Direct Connect sync (Chase, USAA) + net worth snapshot |
| 7 AM daily | `runFinanceDL` | Selenium scraper sync (Capital One, MACU, M1 Finance) |
| 9 AM daily | `runAnomalyCheck` | Flag unusual transactions vs. 90-day merchant averages |
| Midnight | `snapshotNetWorth` | Daily net worth snapshot with full account breakdown |
| 1st of month, 1 AM | `generateMonthlyInsights` | AI-generated monthly financial narrative |
| Sunday 3 AM | `runForecasting` | Monte Carlo FIRE forecast update |
| Sunday 4 AM | `refreshPropertyValues` | Auto-update real estate valuations (HomeSage/RentCast) |
| Monday 8 AM | `detectSubscriptions` | AI scan for new recurring charges |

All jobs are multi-tenant: they iterate over all registered users. Legacy single-user mode is supported when no users exist.

---

## Data Sync Methods

FinanceOS supports four methods for getting bank data:

### 1. OFX Direct Connect
Direct protocol-level connection to banks that support OFX (e.g., Chase, USAA). The sync service sends OFX requests using your credentials and parses the XML response. Runs 3x daily on schedule and can be triggered manually.

### 2. finance-dl (Selenium Scraper)
For banks without OFX support, [finance-dl](https://github.com/jbms/finance-dl) drives a headless browser to log into banking websites and download transaction files. Requires username/password. Runs daily at 7 AM.

### 3. Plaid Link
Connect any Plaid-supported institution through the UI (Linked Banks page). Uses official Plaid SDK with access token encryption at rest (AES-256). Syncs transactions every 4 hours and balances every 30 minutes.

### 4. Manual Upload
Drag-and-drop file import on the Upload page. Supported formats:
- **OFX / QFX** — Standard bank export format
- **Fidelity CSV** — Positions and transaction history
- **M1 Finance CSV** — Holdings and activity
- **Generic CSV** — Auto-detected column mapping

---

## Manual Import

Navigate to **Upload** in the sidebar, then:
1. Select your institution from the dropdown
2. Drag and drop your OFX/QFX/CSV file (up to 50 MB)
3. Transactions are parsed, categorized by AI, and upserted into Firefly III
4. Duplicate detection prevents re-importing existing transactions

---

## AI Features

All AI features require an `OPENAI_API_KEY` and gracefully degrade without one.

### Transaction Categorization
Two-tier system:
1. **Rule-based** — 20+ regex patterns match common merchants to categories (instant, no API call)
2. **OpenAI fallback** — Unknown merchants are categorized by GPT with the result cached in `merchant_categories` for future use

**Categories:** groceries, dining, gas, utilities, rent/mortgage, insurance, healthcare, entertainment, shopping, travel, subscriptions, income, transfer, atm/cash, fees, investments, education, charity, home/garden, other

### Monthly Insights
On the 1st of each month, generates a narrative report including:
- Net worth change and trend
- Income vs. expenses breakdown
- Savings rate analysis
- Top spending categories
- Actionable financial advice

### Anomaly Detection
Runs daily at 9 AM. For each new transaction:
- Looks up the merchant's 90-day spending average
- Flags transactions significantly above the average
- Triggers `unusual_spend` alerts

### Subscription Detection
Runs weekly on Mondays. Scans transaction history to identify recurring charges and their frequency/amount.

### Insurance Review
On-demand AI analysis of insurance policy coverage, gaps, and recommendations.

---

## Asset Tracking

### Real Estate
- Add properties with address, purchase price, and details
- **Auto-valuation** via HomeSage AVM API (with confidence scores and price ranges)
- **Fallback** to RentCast API if HomeSage is unavailable
- Weekly refresh (Sunday 4 AM) with value change alerts (>5% triggers notification)
- Full value history tracking

### Vehicles
- **VIN decoding** via free NHTSA vPIC API (year, make, model, trim, body class, engine, fuel type)
- Manual value tracking with history

### Notes Receivable / Payable
- Track loans made to or owed by others
- Full **amortization schedule** calculator (principal, interest, balance per payment)
- Payment recording with overdue detection and alerts
- Auto-calculated current balance based on amortization

### Other Assets
Business interests, jewelry, collectibles, etc. with manual value tracking.

---

## Alerts & Notifications

Push notifications are delivered via [ntfy](https://ntfy.sh/) with configurable rules stored in the database.

### Alert Rule Types

| Type | Trigger |
|------|---------|
| `large_transaction` | Transaction exceeds configured dollar threshold |
| `low_balance` | Account balance drops below threshold |
| `unusual_spend` | Transaction significantly above 90-day merchant average |
| `bill_due` | Upcoming bill payment reminder |
| `subscription_detected` | New recurring charge identified |
| `subscription_cancelled_charge` | Charge from a previously cancelled subscription |
| `insurance_renewal` | Insurance policy approaching renewal date |
| `asset_value_change` | Real estate value changed >5% |
| `net_worth_milestone` | Net worth crosses a $50K milestone |
| `note_payment_overdue` | Loan payment past due date |
| `vehicle_value_reminder` | Periodic reminder to update vehicle value |
| `sync_failure` | Bank sync failed 3+ consecutive times |

### Notification Setup
1. Install the [ntfy app](https://ntfy.sh/docs/subscribe/phone/) on your phone
2. Subscribe to your topic (default: `financeos`, configurable via `NTFY_TOPIC`)
3. Alerts support priority levels: `max`, `high`, `default`, `low`, `min`

---

## Database Schema

PostgreSQL 16 with 20+ tables across these domains:

| Domain | Tables |
|--------|--------|
| **Users & Auth** | `app_users`, `refresh_tokens`, `user_bank_credentials` |
| **Plaid** | `plaid_items`, `plaid_accounts`, `plaid_transactions`, `plaid_firefly_map` |
| **Sync** | `institution_config`, `sync_log` |
| **Net Worth** | `net_worth_snapshots` (JSONB breakdown) |
| **Subscriptions** | `subscriptions` |
| **Insurance** | `insurance_policies` |
| **Alerts** | `alert_rules`, `alert_history` |
| **Forecasting** | `forecast_snapshots` (JSONB scenarios) |
| **Assets** | `manual_assets`, `asset_value_history`, `note_payments` |
| **AI Memory** | `merchant_categories`, `imported_transactions`, `merchant_transaction_history` |

**User plans:** `free`, `pro`, `lifetime`

Schema is initialized automatically via [postgres/init/01_schema.sql](postgres/init/01_schema.sql) on first `docker compose up`. A default admin user is seeded (`admin@financeos.local` / `changeme123`) with `force_password_change = true`.

---

## Authentication & Authorization

- **JWT-based** with separate access (15 min) and refresh (30 day) tokens
- Tokens delivered via **httpOnly secure cookies** (SameSite=Strict)
- Also accepted via `Authorization: Bearer <token>` header
- Refresh tokens use **rotation** — each refresh invalidates the old token
- Passwords hashed with **bcrypt** (cost factor 10)
- Rate limiting: 20 requests/15 min on auth endpoints, 200/15 min globally
- **Plan gating**: `requirePro` middleware restricts premium features to `pro` or `lifetime` plans

---

## Testing

### Backend (Jest)

```bash
cd sync-service
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npx jest "anomaly"          # Run specific test by pattern
```

**38 test suites, 450 tests** covering:
- API routes (auth, transactions, alerts, tags, networth, subscriptions, forecasting, insights, assets, insurance, sync, budgets)
- Auth middleware (requireAuth, requirePro, getUserId)
- Firefly III client (accounts, transactions)
- Plaid client (token encryption/decryption)
- All 11 scheduled jobs
- AI modules (categorizer, anomaly, forecasting, insights, subscriptions)
- Asset utilities (amortization, property valuation, VIN decoder)
- Parsers (OFX, CSV, Fidelity positions, M1 Finance)
- Alert system (rules evaluation, ntfy notifications)

### Frontend (Vitest)

```bash
cd frontend
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npm run test:ui             # Vitest UI in browser
```

**11 test suites, 188 tests** covering:
- UI components (Button, Badge, StatCard, Card, Modal, ConfirmModal, Toast, Spinner)
- Theme context (dark/light mode, persistence)
- API client module (all API endpoints)
- Utility functions

**Total: 49 test suites, 638 tests**

---

## Development

### Local development (without Docker)

**Backend:**
```bash
cd sync-service
npm install
cp ../.env.example ../.env  # Configure environment
npm run dev                 # Starts ts-node-dev with hot reload on :3010
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                 # Starts Vite dev server with HMR on :5173
```

### With Docker (dev profile)

```bash
docker compose --profile dev up -d
```

This also starts **Adminer** (database admin UI) on http://localhost:57071.

### Code quality

```bash
# Backend
cd sync-service
npm run typecheck           # TypeScript type check (no emit)

# Frontend
cd frontend
npm run lint                # ESLint
npm run build               # Full production build (type check + bundle)
```

---

## Backup & Restore

### Automated Backups
The `db-backup` container runs a daily `pg_dump` at 2 AM, saving compressed SQL dumps to `./backups/`. Backups older than 14 days are automatically deleted.

### Manual Backup
```bash
docker compose exec postgres pg_dump -U financeos financeos | gzip > backup.sql.gz
```

### Restore
```bash
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U financeos financeos
```

---

## Project Structure

```
financeOS/
├── docker-compose.yml              # All services orchestration
├── .env.example                    # Environment variable template
├── START.md                        # Quick-start guide
├── README.md                       # This file
│
├── frontend/                       # React 19 + Vite + TypeScript
│   ├── Dockerfile                  # Multi-stage build (build → nginx)
│   ├── nginx.conf                  # Reverse proxy config (API → sync-service)
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts            # Test configuration
│   ├── public/                     # Static assets
│   └── src/
│       ├── App.tsx                 # Router + providers
│       ├── main.tsx                # Entry point
│       ├── index.css               # Tailwind imports + global styles
│       ├── components/
│       │   ├── layout/             # Layout, Sidebar, TopBar, MobileNav
│       │   ├── ui/                 # Badge, Button, Card, Modal, Spinner, etc.
│       │   ├── TransactionEditModal.tsx
│       │   └── TransferModal.tsx
│       ├── contexts/
│       │   └── ThemeContext.tsx     # Dark/light mode
│       ├── hooks/
│       │   └── useQuery.ts         # TanStack Query wrapper
│       ├── lib/
│       │   ├── api.ts              # Axios API client (all endpoints)
│       │   └── utils.ts            # Formatting, colors, helpers
│       ├── pages/                  # 17 page components
│       │   ├── Dashboard.tsx
│       │   ├── Transactions.tsx
│       │   ├── NetWorth.tsx
│       │   ├── Budgets.tsx
│       │   ├── Investments.tsx
│       │   ├── Assets.tsx
│       │   ├── Subscriptions.tsx
│       │   ├── Insurance.tsx
│       │   ├── Forecasting.tsx
│       │   ├── Insights.tsx
│       │   ├── Alerts.tsx
│       │   ├── Upload.tsx
│       │   ├── Accounts.tsx
│       │   └── Settings.tsx
│       └── __tests__/              # Vitest test suites
│
├── sync-service/                   # Express + TypeScript backend
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.ts              # Test configuration
│   └── src/
│       ├── index.ts                # Express app, routes, startup
│       ├── config.ts               # Environment variable loader
│       ├── middleware/
│       │   └── auth.ts             # JWT auth, plan gating
│       ├── api/routes/
│       │   ├── auth.ts             # Registration, login, refresh, logout
│       │   ├── billing.ts          # Stripe checkout, portal, webhooks
│       │   ├── transactions.ts     # CRUD (proxies Firefly III)
│       │   ├── alerts.ts           # Alert history + rules
│       │   ├── assets.ts           # Asset CRUD + amortization
│       │   ├── budgets.ts          # Budget limits
│       │   ├── forecasting.ts      # FIRE forecasting
│       │   ├── insights.ts         # AI insights
│       │   ├── insurance.ts        # Insurance policies
│       │   ├── networth.ts         # Net worth snapshots
│       │   ├── plaid.ts            # Plaid Link integration
│       │   ├── subscriptions.ts    # Subscription management
│       │   ├── sync.ts             # Sync status, force sync
│       │   ├── tags.ts             # Tag management
│       │   └── upload.ts           # File upload + parsing
│       ├── ai/
│       │   ├── anomaly.ts          # Spending anomaly detection
│       │   ├── categorizer.ts      # AI transaction categorization
│       │   ├── forecasting.ts      # Monte Carlo FIRE simulation
│       │   ├── insights.ts         # Monthly AI insights
│       │   └── subscriptions.ts    # Recurring charge detection
│       ├── alerts/
│       │   ├── ntfy.ts             # Push notification sender
│       │   └── rules.ts            # Alert rule evaluation
│       ├── assets/
│       │   ├── amortization.ts     # Loan amortization calculator
│       │   ├── propertyValuation.ts# HomeSage/RentCast API
│       │   └── vinDecoder.ts       # NHTSA VIN decoder
│       ├── db/
│       │   └── client.ts           # PostgreSQL connection pool
│       ├── financedl/
│       │   ├── config.py           # finance-dl institution configs
│       │   └── watcher.ts          # Download directory watcher
│       ├── firefly/
│       │   ├── client.ts           # Firefly III API wrapper
│       │   ├── accounts.ts         # Account upsert + caching
│       │   └── transactions.ts     # Transaction upsert + dedup
│       ├── jobs/
│       │   ├── scheduler.ts        # Cron job registration (11 jobs)
│       │   ├── refreshBalances.ts  # Balance polling
│       │   ├── syncOFX.ts          # OFX Direct Connect sync
│       │   ├── runFinanceDL.ts     # Selenium scraper runner
│       │   ├── snapshotNetWorth.ts # Daily net worth snapshot
│       │   ├── runAnomalyCheck.ts  # Anomaly detection job
│       │   ├── runForecasting.ts   # FIRE forecast job
│       │   ├── detectSubscriptions.ts
│       │   └── refreshPropertyValues.ts
│       ├── lib/
│       │   ├── logger.ts           # Pino structured logger
│       │   └── plaidClient.ts      # Plaid SDK + token encryption
│       ├── ofx/
│       │   ├── client.py           # OFX protocol client (Python)
│       │   └── downloader.ts       # OFX download orchestrator
│       ├── parsers/
│       │   ├── ofxParser.ts        # OFX/QFX file parser
│       │   ├── csvParser.ts        # Generic CSV parser
│       │   ├── fidelityPositions.ts# Fidelity CSV parser
│       │   └── m1Finance.ts        # M1 Finance CSV parser
│       └── __tests__/              # Jest test suites (38 files)
│
├── postgres/
│   └── init/
│       └── 01_schema.sql           # Full database schema + seed data
│
├── downloads/                      # OFX/finance-dl download staging
├── uploads/                        # Manual file upload staging
└── backups/                        # Daily pg_dump compressed backups
```

---

## Stop / Restart

```bash
docker compose down                         # Stop all services
docker compose up -d                        # Start all services
docker compose restart sync-service         # Restart after .env changes
docker compose logs sync-service -f         # View sync service logs
docker compose logs -f                      # View all logs
docker compose --profile dev up -d          # Start with Adminer (dev tools)
```
