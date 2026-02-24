import dotenv from 'dotenv';
dotenv.config();

function get(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[Config] FATAL: Required env var ${key} is not set`);
    }
    console.warn(`[Config] ⚠ WARNING: ${key} not set — INSECURE DEFAULTS IN USE`);
  }
  return v ?? '';
}

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

export const config = {
  nodeEnv:        get('NODE_ENV', 'development'),
  port:           parseInt(get('PORT', '3010')),
  databaseUrl:    requireEnv('DATABASE_URL'),
  fireflyUrl:     get('FIREFLY_URL', 'http://firefly:8080'),
  fireflyToken:   get('FIREFLY_TOKEN'),
  encryptionKey:  requireEnv('ENCRYPTION_KEY'),
  openaiApiKey:   get('OPENAI_API_KEY'),
  ntfyUrl:        get('NTFY_URL', 'http://ntfy:80'),
  ntfyTopic:      get('NTFY_TOPIC', 'financeos'),
  homesageApiKey: get('HOMESAGE_API_KEY'),
  rentcastApiKey: get('RENTCAST_API_KEY'),
  downloadsDir:   get('DOWNLOADS_DIR', '/app/downloads'),
  chaseUsername:      get('CHASE_USERNAME'),
  chasePassword:      get('CHASE_PASSWORD'),
  usaaUsername:       get('USAA_USERNAME'),
  usaaPassword:       get('USAA_PASSWORD'),
  capitaloneUsername: get('CAPITALONE_USERNAME'),
  capitalonePassword: get('CAPITALONE_PASSWORD'),
  macuUsername:       get('MACU_USERNAME'),
  macuPassword:       get('MACU_PASSWORD'),
  m1Username:         get('M1_USERNAME'),
  m1Password:         get('M1_PASSWORD'),

  // ── SaaS / Auth ────────────────────────────────────────────────────────
  jwtSecret:              requireEnv('JWT_SECRET'),
  jwtRefreshSecret:       requireEnv('JWT_REFRESH_SECRET') || requireEnv('JWT_SECRET'),
  jwtExpiresIn:           get('JWT_EXPIRES_IN', '15m'),   // access token lifetime
  jwtRefreshExpiresIn:    get('JWT_REFRESH_EXPIRES_IN', '30d'),
  appUrl:                 get('APP_URL', 'http://localhost:57072'),
  isProd,

  // ── Stripe ────────────────────────────────────────────────────────────
  stripeSecretKey:        get('STRIPE_SECRET_KEY'),
  stripeWebhookSecret:    get('STRIPE_WEBHOOK_SECRET'),
  stripeProPriceId:       get('STRIPE_PRO_PRICE_ID'),   // monthly recurring price ID
  stripeLifetimePriceId:  get('STRIPE_LIFETIME_PRICE_ID'),

  // ── Plaid ──────────────────────────────────────────────────────────────
  plaidClientId:     get('PLAID_CLIENT_ID'),
  plaidSecret:       get('PLAID_SECRET'),
  plaidEnv:          get('PLAID_ENV', 'sandbox'),            // sandbox | development | production
  plaidWebhookUrl:   get('PLAID_WEBHOOK_URL'),               // e.g. https://yourdomain.com/api/plaid/webhook
  plaidRedirectUri:  get('PLAID_REDIRECT_URI'),               // for OAuth institutions
};
