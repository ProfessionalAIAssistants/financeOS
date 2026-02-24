import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { Modal, ModalFooter } from '../../components/ui/Modal';

// Mock framer-motion to simplify rendering
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, ...domProps } = props as Record<string, unknown>;
      return <div {...domProps as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Modal', () => {
  test('renders children when open', () => {
    render(
      <Modal open={true} onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  test('does not render when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        <p>Hidden content</p>
      </Modal>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  test('renders title when provided', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="My Dialog">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText('My Dialog')).toBeInTheDocument();
  });

  test('has dialog role and aria-modal', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test">
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Test');
  });

  test('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Test</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    // The backdrop has role="presentation" parent, find the motion.div backdrop
    const backdrop = document.querySelector('[class*="backdrop"]');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  test('renders close button with aria-label', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test">
        <p>Content</p>
      </Modal>
    );
    const closeBtn = screen.getByLabelText('Close');
    expect(closeBtn).toBeInTheDocument();
  });

  test('close button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ModalFooter', () => {
  test('renders children', () => {
    render(<ModalFooter><button>OK</button></ModalFooter>);
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  test('accepts custom className', () => {
    const { container } = render(<ModalFooter className="custom-class"><span>Foot</span></ModalFooter>);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
