import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'blue' | 'green' | 'purple' | 'red' | 'amber' | 'emerald' | 'none';
  animate?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, glow = 'none', animate = true, onClick }: CardProps) {
  const glowClass = glow !== 'none' ? `card-glow-${glow === 'green' ? 'emerald' : glow}` : '';

  const inner = (
    <div
      className={cn('glass p-5', glowClass, onClick && 'cursor-pointer', className)}
      onClick={onClick}
    >
      {children}
    </div>
  );

  if (!animate) return inner;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {inner}
    </motion.div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between mb-4', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={cn('text-xs font-semibold uppercase tracking-wider', className)}
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </h3>
  );
}
