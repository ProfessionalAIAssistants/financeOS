import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEffect, useCallback, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    // Focus the dialog for keyboard accessibility
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: 'var(--bg-modal-overlay)' }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Dialog'}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={cn('relative w-full glass p-6 z-10 outline-none', sizes[size])}
            style={{ background: 'var(--bg-modal)', boxShadow: 'var(--shadow-xl)' }}
          >
            {/* Header */}
            {title && (
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = '';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {!title && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }}
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-end gap-3 mt-6 pt-5', className)}
      style={{ borderTop: '1px solid var(--border)' }}
    >
      {children}
    </div>
  );
}
