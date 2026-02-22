import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Config per type ───────────────────────────────────────────────────────────

const CONFIG: Record<ToastType, { icon: React.ReactNode; border: string; iconColor: string }> = {
  success: {
    icon: <CheckCircle className="w-4 h-4 shrink-0" />,
    border: 'rgba(16,185,129,0.35)',
    iconColor: '#10b981',
  },
  error: {
    icon: <XCircle className="w-4 h-4 shrink-0" />,
    border: 'rgba(239,68,68,0.35)',
    iconColor: '#f87171',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
    border: 'rgba(245,158,11,0.35)',
    iconColor: '#fbbf24',
  },
  info: {
    icon: <Info className="w-4 h-4 shrink-0" />,
    border: 'rgba(59,130,246,0.35)',
    iconColor: '#60a5fa',
  },
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div
        className="fixed bottom-24 md:bottom-6 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 360 }}
      >
        <AnimatePresence initial={false}>
          {toasts.map(t => {
            const cfg = CONFIG[t.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'var(--bg-modal)',
                  border: `1px solid ${cfg.border}`,
                  boxShadow: 'var(--shadow-lg)',
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ color: cfg.iconColor }}>{cfg.icon}</span>
                <span className="flex-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  {t.message}
                </span>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 p-0.5 rounded transition-opacity opacity-50 hover:opacity-100"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}
