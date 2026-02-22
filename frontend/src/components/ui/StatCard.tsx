import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn, fmt } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  format?: 'currency' | 'percent' | 'decimal' | 'raw';
  glow?: 'blue' | 'green' | 'purple' | 'red' | 'none';
  delay?: number;
}

export function StatCard({ title, value, change, changeLabel, icon, format = 'currency', glow = 'none', delay = 0 }: StatCardProps) {
  const displayValue = format === 'raw'
    ? String(value)
    : format === 'percent'
    ? fmt(value, { style: 'percent', maximumFractionDigits: 1 })
    : fmt(value, { style: format === 'currency' ? 'currency' : 'decimal' });

  const glowClass = glow !== 'none' ? `card-glow-${glow === 'green' ? 'emerald' : glow}` : '';

  const trendColor = change === undefined ? ''
    : change > 0 ? 'text-emerald-500'
    : change < 0 ? 'text-red-500'
    : '';

  const TrendIcon = change === undefined ? null : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      className={cn('glass p-5', glowClass)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            {title}
          </p>
          <motion.p
            key={String(value)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-2xl font-bold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {displayValue}
          </motion.p>
          {change !== undefined && (
            <div className={cn('flex items-center gap-1 mt-1.5 text-xs font-medium', trendColor)}>
              {TrendIcon && <TrendIcon className="w-3 h-3" />}
              <span>{Math.abs(change).toFixed(1)}% {changeLabel ?? 'vs last month'}</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className="ml-3 p-2.5 rounded-xl shrink-0"
            style={{
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </motion.div>
  );
}
