import { Modal, ModalFooter } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
  danger = true,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5"
          style={{ background: danger ? 'var(--danger-subtle)' : 'var(--warning-subtle)' }}
        >
          <AlertTriangle
            className="w-4 h-4"
            style={{ color: danger ? 'var(--danger)' : 'var(--warning)' }}
          />
        </div>
        <p className="text-sm leading-relaxed pt-1.5" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => { onConfirm(); onClose(); }}
          style={danger ? {
            background: 'var(--danger)',
            color: '#fff',
          } : undefined}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
