import dotenv from 'dotenv';
dotenv.config();

function get(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
function require_env(key: string): string {
  const v = process.env[key];
  if (!v) console.warn(`[Config] Warning: ${key} not set`);
  return v ?? '';
}

export const config = {
  nodeEnv:        get('NODE_ENV', 'development'),
  port:           parseInt(get('PORT', '3010')),
  databaseUrl:    get('DATABASE_URL', 'postgresql://financeos:changeme@postgres:5432/financeos'),
  fireflyUrl:     get('FIREFLY_URL', 'http://firefly:8080'),
  fireflyToken:   get('FIREFLY_TOKEN'),
  encryptionKey:  get('ENCRYPTION_KEY', 'dev-key-change-in-production-32ch'),
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
};
