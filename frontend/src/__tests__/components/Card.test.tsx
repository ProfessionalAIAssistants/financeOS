import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, ...domProps } = props as Record<string, unknown>;
      return <div {...domProps as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    },
  },
}));

describe('Card', () => {
  test('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  test('accepts custom className', () => {
    const { container } = render(<Card className="my-class">Content</Card>);
    expect(container.querySelector('.my-class')).toBeInTheDocument();
  });

  test('handles click events', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Clickable</Card>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('adds cursor-pointer class when onClick is provided', () => {
    render(<Card onClick={vi.fn()}>Click me</Card>);
    const cardEl = screen.getByText('Click me').closest('.glass');
    expect(cardEl).toHaveClass('cursor-pointer');
  });

  test('renders without animation when animate=false', () => {
    render(<Card animate={false}>Static</Card>);
    expect(screen.getByText('Static')).toBeInTheDocument();
  });

  test('renders with glow class', () => {
    const { container } = render(<Card glow="blue">Glowing</Card>);
    expect(container.querySelector('[class*="card-glow"]')).toBeInTheDocument();
  });

  test('no glow class when glow=none', () => {
    const { container } = render(<Card glow="none">No glow</Card>);
    expect(container.querySelector('[class*="card-glow"]')).not.toBeInTheDocument();
  });
});

describe('CardHeader', () => {
  test('renders children', () => {
    render(<CardHeader><span>Header text</span></CardHeader>);
    expect(screen.getByText('Header text')).toBeInTheDocument();
  });

  test('accepts custom className', () => {
    const { container } = render(<CardHeader className="custom"><span>H</span></CardHeader>);
    expect(container.firstChild).toHaveClass('custom');
  });
});

describe('CardTitle', () => {
  test('renders as h3', () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  test('applies uppercase tracking styles', () => {
    render(<CardTitle>Title</CardTitle>);
    const el = screen.getByText('Title');
    expect(el).toHaveClass('uppercase');
    expect(el).toHaveClass('tracking-wider');
  });
});
