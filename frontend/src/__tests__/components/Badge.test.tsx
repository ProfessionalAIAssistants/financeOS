import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { Badge } from '../../components/ui/Badge';

// ── Basic rendering ───────────────────────────────────────────────────────────

describe('Badge – rendering', () => {
  test('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('renders as a <span> element', () => {
    const { container } = render(<Badge>Label</Badge>);
    expect(container.firstChild?.nodeName).toBe('SPAN');
  });

  test('renders without variant prop (defaults to "default")', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });
});

// ── Variants ─────────────────────────────────────────────────────────────────

describe('Badge – variants', () => {
  const variants = ['default', 'success', 'warning', 'danger', 'info', 'purple'] as const;

  for (const variant of variants) {
    test(`renders ${variant} variant without crashing`, () => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
    });
  }

  test('success variant is in the document', () => {
    render(<Badge variant="success">Paid</Badge>);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  test('danger variant is in the document', () => {
    render(<Badge variant="danger">Error</Badge>);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  test('warning variant is in the document', () => {
    render(<Badge variant="warning">Pending</Badge>);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});

// ── Custom className ─────────────────────────────────────────────────────────

describe('Badge – className prop', () => {
  test('applies custom className', () => {
    const { container } = render(<Badge className="my-custom-badge">Label</Badge>);
    expect(container.firstChild).toHaveClass('my-custom-badge');
  });

  test('does not override core classes when className is provided', () => {
    const { container } = render(<Badge className="extra">Label</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('inline-flex');
    expect(el.className).toContain('extra');
  });
});

// ── Inline styles (variant-specific) ─────────────────────────────────────────

describe('Badge – inline styles', () => {
  test('applies inline style from variant map', () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    const el = container.firstChild as HTMLElement;
    // The style attribute should be set (not empty)
    expect(el.getAttribute('style')).toBeTruthy();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('Badge – accessibility', () => {
  test('renders text content visible to screen readers', () => {
    render(<Badge variant="danger">3 errors</Badge>);
    expect(screen.getByText('3 errors')).toBeVisible();
  });
});

// ── Content types ─────────────────────────────────────────────────────────────

describe('Badge – content types', () => {
  test('renders numeric children', () => {
    render(<Badge>{42}</Badge>);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('renders JSX children', () => {
    render(
      <Badge>
        <span data-testid="inner">inner</span>
      </Badge>
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  test('renders empty string without crashing', () => {
    render(<Badge>{''}</Badge>);
    // Should not throw; badge renders but has no visible text
  });
});
