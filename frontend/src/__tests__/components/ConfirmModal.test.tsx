import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { ConfirmModal } from '../../components/ui/ConfirmModal';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, ...domProps } = props as Record<string, unknown>;
      return <div {...domProps as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ConfirmModal', () => {
  const defaultProps = {
    open: true,
    message: 'Are you sure you want to delete this item?',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  test('renders title and message', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument();
  });

  test('renders custom title', () => {
    render(<ConfirmModal {...defaultProps} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  test('renders custom confirm label', () => {
    render(<ConfirmModal {...defaultProps} confirmLabel="Remove" />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  test('calls onConfirm and onClose when confirm clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not render when closed', () => {
    render(<ConfirmModal {...defaultProps} open={false} />);
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  test('shows alert triangle icon', () => {
    const { container } = render(<ConfirmModal {...defaultProps} />);
    // lucide-react renders an SVG
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
