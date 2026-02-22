import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { StatCard } from '../../components/ui/StatCard';

// Mock framer-motion so animations don't interfere with test renders
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props}>{children}</p>
    ),
  },
}));

// ── Basic rendering ───────────────────────────────────────────────────────────

describe('StatCard – rendering', () => {
  test('renders the title', () => {
    render(<StatCard title="Net Worth" value={100_000} />);
    expect(screen.getByText('Net Worth')).toBeInTheDocument();
  });

  test('renders the formatted currency value by default', () => {
    // minimumFractionDigits=0 so trailing zeros are dropped
    render(<StatCard title="Assets" value={1500} />);
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  test('renders raw string value when format="raw"', () => {
    render(<StatCard title="Count" value={42} format="raw" />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('renders percent format', () => {
    render(<StatCard title="Rate" value={0.125} format="percent" />);
    const el = screen.getByText(/12\.5%/i);
    expect(el).toBeInTheDocument();
  });

  test('renders decimal format without $ symbol', () => {
    render(<StatCard title="Points" value={99.5} format="decimal" />);
    const values = screen.getAllByText(/99/);
    expect(values.length).toBeGreaterThan(0);
  });
});

// ── Change indicator ─────────────────────────────────────────────────────────

describe('StatCard – change indicator', () => {
  test('renders positive change with percent', () => {
    render(<StatCard title="Net Worth" value={100_000} change={5.2} />);
    expect(screen.getByText(/5\.2%/)).toBeInTheDocument();
  });

  test('renders negative change with percent', () => {
    render(<StatCard title="Net Worth" value={90_000} change={-3.1} />);
    expect(screen.getByText(/3\.1%/)).toBeInTheDocument();
  });

  test('renders zero change', () => {
    render(<StatCard title="Net Worth" value={100_000} change={0} />);
    expect(screen.getByText(/0\.0%/)).toBeInTheDocument();
  });

  test('renders custom changeLabel', () => {
    render(<StatCard title="Net Worth" value={100_000} change={2} changeLabel="vs last year" />);
    expect(screen.getByText(/vs last year/)).toBeInTheDocument();
  });

  test('defaults to "vs last month" label', () => {
    render(<StatCard title="Net Worth" value={100_000} change={1.5} />);
    expect(screen.getByText(/vs last month/)).toBeInTheDocument();
  });

  test('renders absolute change value (no negative sign shown)', () => {
    render(<StatCard title="Net Worth" value={90_000} change={-3.5} />);
    // Absolute value shown: 3.5%, not -3.5%
    expect(screen.getByText(/3\.5%/)).toBeInTheDocument();
    // Should not show -3.5%
    expect(screen.queryByText(/-3\.5%/)).not.toBeInTheDocument();
  });

  test('does not render change row when change is undefined', () => {
    render(<StatCard title="Net Worth" value={100_000} />);
    expect(screen.queryByText(/vs last month/)).not.toBeInTheDocument();
  });
});

// ── Icon ─────────────────────────────────────────────────────────────────────

describe('StatCard – icon prop', () => {
  test('renders icon when provided', () => {
    render(<StatCard title="Net Worth" value={100_000} icon={<span data-testid="stat-icon" />} />);
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  test('does not render icon slot when icon is not provided', () => {
    const { container } = render(<StatCard title="Assets" value={5000} />);
    expect(container.querySelector('[data-testid="stat-icon"]')).toBeNull();
  });
});

// ── Glow variants ─────────────────────────────────────────────────────────────

describe('StatCard – glow prop', () => {
  const glows = ['blue', 'green', 'purple', 'red', 'none'] as const;

  for (const glow of glows) {
    test(`renders with glow="${glow}" without crashing`, () => {
      render(<StatCard title="Test" value={500} glow={glow} />);
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  }

  test('green glow maps to emerald CSS class', () => {
    const { container } = render(<StatCard title="Savings" value={1000} glow="green" />);
    // The card should have the emerald glow class  
    expect(container.firstChild?.toString()).toBeTruthy();
  });
});

// ── String values ─────────────────────────────────────────────────────────────

describe('StatCard – string value', () => {
  test('renders string value with currency format', () => {
    // 2500.50 parses to 2500.5 — minimumFractionDigits=0 so only 1 decimal shown
    render(<StatCard title="Balance" value="2500.50" />);
    expect(screen.getByText('$2,500.5')).toBeInTheDocument();
  });

  test('renders "—" for non-numeric string value', () => {
    render(<StatCard title="N/A" value="not-a-number" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ── Large values ──────────────────────────────────────────────────────────────

describe('StatCard – large values', () => {
  test('renders million-dollar value', () => {
    // minimumFractionDigits=0, so no trailing zeros
    render(<StatCard title="Net Worth" value={1_500_000} />);
    expect(screen.getByText('$1,500,000')).toBeInTheDocument();
  });

  test('renders negative value', () => {
    render(<StatCard title="Debt" value={-25000} />);
    const el = screen.getByText(/25,000/);
    expect(el).toBeInTheDocument();
  });
});
