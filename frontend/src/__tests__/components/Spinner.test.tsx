import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { Spinner, PageSpinner } from '../../components/ui/Spinner';

describe('Spinner', () => {
  test('renders a spinning element', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  test('accepts custom className', () => {
    const { container } = render(<Spinner className="my-spinner" />);
    expect(container.firstChild).toHaveClass('my-spinner');
  });
});

describe('PageSpinner', () => {
  test('renders a spinning element', () => {
    const { container } = render(<PageSpinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  test('shows Loading text', () => {
    render(<PageSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
