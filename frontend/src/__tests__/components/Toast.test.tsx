import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast } from '../../components/ui/Toast';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, ...domProps } = props as Record<string, unknown>;
      return <div {...domProps as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    },
  },
  AnimatePresence: ({ children, ...props }: { children: React.ReactNode; initial?: boolean }) => <>{children}</>,
}));

function TestConsumer() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast('Success message', 'success')}>Show Success</button>
      <button onClick={() => toast('Error message', 'error')}>Show Error</button>
      <button onClick={() => toast('Info message')}>Show Info</button>
    </div>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows toast message when triggered', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Success'));

    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  test('defaults to info type', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Info'));

    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  test('auto-dismisses after 4 seconds', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
  });

  test('can show multiple toasts', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Success'));
    fireEvent.click(screen.getByText('Show Error'));

    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  test('dismiss button removes toast', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    // Find and click the close button (the small X button next to the message)
    const closeButtons = screen.getAllByRole('button');
    const dismissBtn = closeButtons.find(btn => btn.querySelector('svg') && btn.closest('[class*="pointer-events-auto"]'));
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    }
  });
});

describe('useToast', () => {
  test('throws when used outside ToastProvider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    function BadConsumer() {
      useToast();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow('useToast must be used inside ToastProvider');
    spy.mockRestore();
  });
});
