import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { Button } from '../../components/ui/Button';

// ── Basic rendering ───────────────────────────────────────────────────────────

describe('Button – rendering', () => {
  test('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  test('is enabled by default', () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});

// ── Variants ──────────────────────────────────────────────────────────────────

describe('Button – variants (snapshot style checks)', () => {
  const variants = ['primary', 'secondary', 'ghost', 'danger', 'success'] as const;

  for (const variant of variants) {
    test(`renders ${variant} variant without crashing`, () => {
      render(<Button variant={variant}>Label</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  }
});

// ── Sizes ─────────────────────────────────────────────────────────────────────

describe('Button – sizes', () => {
  const sizes = ['sm', 'md', 'lg'] as const;

  for (const size of sizes) {
    test(`renders ${size} size without crashing`, () => {
      render(<Button size={size}>Label</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  }
});

// ── Disabled state ────────────────────────────────────────────────────────────

describe('Button – disabled state', () => {
  test('is disabled when disabled prop is set', () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Submit</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('Button – loading state', () => {
  test('is disabled when loading', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('renders spinner instead of children icon when loading', () => {
    // When loading, icon is replaced with Loader2 spinner
    // We check the button still renders (no crash) and is disabled
    const { container } = render(<Button loading icon={<span data-testid="icon" />}>Save</Button>);
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    // Lucide Loader2 renders an svg
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('renders custom icon when not loading', () => {
    render(<Button icon={<span data-testid="icon" />}>Save</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});

// ── Click handler ─────────────────────────────────────────────────────────────

describe('Button – click handler', () => {
  test('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('does not throw when no onClick is provided', () => {
    render(<Button>Click</Button>);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});

// ── Custom className ─────────────────────────────────────────────────────────

describe('Button – className prop', () => {
  test('applies custom className', () => {
    render(<Button className="custom-class">Label</Button>);
    expect(screen.getByRole('button').className).toContain('custom-class');
  });
});

// ── HTML attributes ───────────────────────────────────────────────────────────

describe('Button – HTML attribute passthrough', () => {
  test('passes type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  test('passes aria-label attribute', () => {
    render(<Button aria-label="close dialog">×</Button>);
    expect(screen.getByRole('button', { name: /close dialog/i })).toBeInTheDocument();
  });
});
