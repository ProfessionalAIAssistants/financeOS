import pino from 'pino';
import { config } from '../config';

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    config.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  base: { service: 'sync-service' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password', 'password_hash', 'accessToken', 'refreshToken',
      'access_token', 'access_token_enc', 'token',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
