# FinanceOS — Quick Start

## First-Time Setup

### 1. Fill in your credentials
Edit `.env` with your real values:
```
POSTGRES_PASSWORD=choose_a_strong_password
FIREFLY_APP_KEY=any_32_character_random_string
ENCRYPTION_KEY=any_32_character_random_string

CHASE_USERNAME=your_chase_email
CHASE_PASSWORD=your_chase_password
USAA_USERNAME=your_usaa_member_id
USAA_PASSWORD=your_usaa_password
CAPITALONE_USERNAME=your_email
CAPITALONE_PASSWORD=your_password
MACU_USERNAME=your_username
MACU_PASSWORD=your_password
M1_USERNAME=your_m1_email
M1_PASSWORD=your_m1_password

OPENAI_API_KEY=sk-...          # optional, enables AI features
HOMESAGE_API_KEY=...            # optional, auto-values property
RENTCAST_API_KEY=...            # optional, property value fallback
```

### 2. Start everything
```powershell
cd Desktop\Dashboard
docker compose up -d
```
First build takes ~5 minutes. Watch progress:
```powershell
docker compose logs -f
```

### 3. Set up Firefly III (one-time)
1. Open http://localhost:57070
2. Create your admin account
3. Go to **Profile → OAuth → Personal Access Tokens → Create**
4. Copy the token into `.env` as `FIREFLY_TOKEN=`
5. Restart sync-service: `docker compose restart sync-service`

### 4. Access the dashboard
- **Dashboard:**     http://localhost:57072
- **Firefly III:**   http://localhost:57070
- **DB Admin:**      http://localhost:57071
- **ntfy alerts:**   http://localhost:57073

### 5. Mobile access
Install **Tailscale** on both PC and phone for secure remote access.
Subscribe to push alerts by installing the **ntfy app** and subscribing to topic `financeos`.

---

## Daily Operation

Syncing happens automatically:
- Every **15 min** — balance refresh
- **6am/12pm/6pm** — OFX Direct Connect (Chase, USAA)
- **7am daily** — finance-dl scraper (Capital One, MACU, M1)
- **Midnight** — net worth snapshot
- **1st of month** — AI monthly insights
- **Sunday 3am** — Monte Carlo forecast update

## Manual Import (Fidelity / backup)
Go to **Import** page → drop OFX or CSV file → select institution.

## Ports Used
| Service       | Port  |
|---------------|-------|
| Dashboard     | 57072 |
| Firefly III   | 57070 |
| DB Admin      | 57071 |
| ntfy alerts   | 57073 |
| Sync API      | 57010 |
| PostgreSQL    | 57432 |

## Stop / Restart
```powershell
docker compose down        # stop
docker compose up -d       # start
docker compose restart sync-service   # restart after .env changes
docker compose logs sync-service -f   # view sync logs
```
