import { query } from '../db/client';
import { createAlert } from './ntfy';
import logger from '../lib/logger';

export interface AlertEvent {
  type: string;
  userId?: string;
  institution?: string;
  accountName?: string;
  amount?: number;
  balance?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

export async function evaluateAlertRules(event: AlertEvent): Promise<void> {
  try {
    const rules = await query(
      `SELECT id, user_id, rule_type, name, threshold, account_filter, category_filter, enabled, notify_push
       FROM alert_rules WHERE enabled = true AND rule_type = $1 AND ($2::uuid IS NULL OR user_id = $2)`,
      [event.type, event.userId ?? null]
    );

    for (const rule of rules.rows) {
      let triggered = false;
      let title = '';
      let message = '';
      let severity = rule.severity ?? 'info';
      const tags: string[] = [];

      switch (event.type) {
        case 'low_balance':
          if (event.balance !== undefined && rule.threshold && event.balance < rule.threshold) {
            triggered = true;
            title = `⚠️ Low Balance Alert`;
            message = `${event.accountName ?? event.institution}: $${event.balance.toFixed(2)} (below $${rule.threshold})`;
            severity = 'high';
            tags.push('warning');
          }
          break;
        case 'large_transaction':
          if (event.amount !== undefined && rule.threshold && Math.abs(event.amount) > rule.threshold) {
            triggered = true;
            title = `💸 Large Transaction`;
            message = `$${Math.abs(event.amount).toFixed(2)} — ${event.description ?? event.institution}`;
            severity = 'medium';
            tags.push('moneybag');
          }
          break;
        case 'sync_failure':
          triggered = true;
          title = `🔴 Sync Failed`;
          message = `${event.institution}: ${event.description}`;
          severity = 'critical';
          tags.push('rotating_light');
          break;
        case 'new_subscription':
          triggered = true;
          title = `🔔 New Subscription Detected`;
          message = `${event.description} — $${event.amount?.toFixed(2) ?? '?'}/mo`;
          severity = 'medium';
          tags.push('bell');
          break;
        case 'asset_value_change':
          triggered = true;
          title = `🏠 Property Value Update`;
          message = event.description ?? 'Property value changed';
          severity = 'low';
          tags.push('chart_with_upwards_trend');
          break;
        case 'net_worth_milestone':
          triggered = true;
          title = `🎯 Net Worth Milestone!`;
          message = event.description ?? 'Net worth milestone reached';
          severity = 'low';
          tags.push('tada');
          break;
        case 'anomaly':
          triggered = true;
          title = `🚨 Unusual Transaction`;
          message = event.description ?? 'Unusual spending detected';
          severity = 'high';
          tags.push('rotating_light');
          break;
      }

      if (triggered) {
        await createAlert({
          title,
          message,
          priority: severity === 'critical' ? 'max' : severity === 'high' ? 'high' : 'default',
          tags,
          ruleType: event.type,
          severity,
          metadata: event.metadata,
          userId: event.userId ?? rule.user_id,
        }, rule.notify_push !== false);
      }
    }
  } catch (err) {
    logger.error({ err }, '[AlertRules] Error');
  }
}
