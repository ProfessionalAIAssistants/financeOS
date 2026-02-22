import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--bg-badge)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  success: { background: 'var(--success-subtle)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' },
  warning: { background: 'var(--warning-subtle)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' },
  danger:  { background: 'var(--danger-subtle)',  color: 'var(--danger)',  border: '1px solid rgba(239,68,68,0.3)' },
  info:    { background: 'var(--accent-subtle)',  color: 'var(--accent)',  border: '1px solid var(--border-active)' },
  purple:  { background: 'var(--purple-subtle)',  color: 'var(--purple)',  border: '1px solid rgba(168,85,247,0.3)' },
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}
