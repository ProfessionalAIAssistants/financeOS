import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type BtnSize = 'sm' | 'md' | 'lg';

const sizeStyles: Record<BtnSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

/* Inline styles for theme-awareness */
const variantInlineStyles: Record<BtnVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--gradient-brand)',
    color: '#ffffff',
    border: '1px solid transparent',
    boxShadow: '0 2px 12px var(--accent-glow)',
  },
  secondary: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger-subtle)',
    color: 'var(--danger)',
    border: '1px solid rgba(239,68,68,0.3)',
  },
  success: {
    background: 'var(--success-subtle)',
    color: 'var(--success)',
    border: '1px solid rgba(16,185,129,0.3)',
  },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children, variant = 'primary', size = 'md', loading, icon,
  className, disabled, style, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'hover:opacity-90 active:scale-[0.97]',
        sizeStyles[size],
        className
      )}
      style={{ ...variantInlineStyles[variant], ...style }}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
