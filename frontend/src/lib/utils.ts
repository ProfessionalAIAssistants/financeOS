import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(value: number | string | null | undefined, opts?: {
  style?: 'currency' | 'percent' | 'decimal';
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  compact?: boolean;
}): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return '—';

  const {
    style = 'currency',
    maximumFractionDigits = 2,
    minimumFractionDigits = 0,
    compact = false,
  } = opts ?? {};

  if (compact && Math.abs(num) >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(num) >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('en-US', {
    style,
    currency: style === 'currency' ? 'USD' : undefined,
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(num);
}

export function fmtDate(dateStr: string | null | undefined, pattern = 'MMM d, yyyy'): string {
  if (!dateStr) return '—';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(d, pattern);
  } catch {
    return dateStr ?? '—';
  }
}

export function fmtRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr ?? '—';
  }
}

export function colorForValue(value: number, positive = true): string {
  if (value === 0) return 'text-slate-400';
  const isPositive = positive ? value > 0 : value < 0;
  return isPositive ? 'text-emerald-400' : 'text-red-400';
}

export function pctChange(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function gradientForType(type: string): string {
  const map: Record<string, string> = {
    checking:    'from-blue-500 to-cyan-500',
    savings:     'from-emerald-500 to-teal-500',
    credit:      'from-red-500 to-rose-500',
    investment:  'from-purple-500 to-violet-500',
    real_estate: 'from-orange-500 to-amber-500',
    vehicle:     'from-slate-400 to-slate-600',
    note:        'from-yellow-500 to-orange-500',
    insurance:   'from-sky-500 to-indigo-500',
  };
  return map[type] ?? 'from-slate-500 to-slate-700';
}

export function iconForInstitution(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('chase')) return '🏦';
  if (n.includes('usaa')) return '🎖️';
  if (n.includes('capital') || n.includes('capitalone')) return '💳';
  if (n.includes('fidelity')) return '📈';
  if (n.includes('m1')) return '🥧';
  if (n.includes('macu') || n.includes('mountain')) return '🏔️';
  return '🏛️';
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    critical: 'text-red-400 bg-red-400/10 border-red-400/20',
    high:     'text-orange-400 bg-orange-400/10 border-orange-400/20',
    medium:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    low:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
    info:     'text-slate-400 bg-slate-400/10 border-slate-400/20',
  };
  return map[severity] ?? map.info;
}

export function CHART_COLORS() {
  return ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f472b6', '#38bdf8', '#facc15', '#4ade80'];
}
