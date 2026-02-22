import axios from 'axios';
import { config } from '../config';
import { query } from '../db/client';

export type AlertPriority = 'max' | 'high' | 'default' | 'low' | 'min';

export interface AlertPayload {
  title: string;
  message: string;
  priority?: AlertPriority;
  tags?: string[];
  ruleType?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}

export async function sendPushNotification(payload: AlertPayload): Promise<void> {
  try {
    await axios.post(`${config.ntfyUrl}/${config.ntfyTopic}`, payload.message, {
      headers: {
        'Title':    payload.title,
        'Priority': payload.priority ?? 'default',
        'Tags':     (payload.tags ?? []).join(','),
        'Content-Type': 'text/plain',
      },
      timeout: 8000,
    });
  } catch (err) {
    console.error('[ntfy] Push failed:', err instanceof Error ? err.message : err);
  }
}

export async function createAlert(payload: AlertPayload, sendPush = true): Promise<void> {
  try {
    await query(
      `INSERT INTO alert_history (rule_type, title, message, severity, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        payload.ruleType ?? 'system',
        payload.title,
        payload.message,
        payload.severity ?? 'info',
        payload.metadata ? JSON.stringify(payload.metadata) : null,
      ]
    );
  } catch {
    // DB might not be ready
  }

  if (sendPush) {
    await sendPushNotification(payload);
  }
}
