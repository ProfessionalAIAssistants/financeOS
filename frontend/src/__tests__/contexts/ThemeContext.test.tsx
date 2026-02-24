import { render, screen, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';

function ThemeConsumer() {
  const { theme, resolvedTheme, isDark, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <span data-testid="isDark">{isDark.toString()}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('system')}>Set System</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  test('defaults to dark theme', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('isDark')).toHaveTextContent('true');
  });

  test('reads stored theme from localStorage', () => {
    localStorage.setItem('theme', 'light');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('isDark')).toHaveTextContent('false');
  });

  test('toggleTheme switches from dark to light', async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');

    await act(async () => {
      screen.getByText('Toggle').click();
    });

    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  test('setTheme updates theme', async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    await act(async () => {
      screen.getByText('Set Light').click();
    });

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('isDark')).toHaveTextContent('false');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('persists theme to localStorage', async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    await act(async () => {
      screen.getByText('Set Light').click();
    });

    expect(localStorage.getItem('theme')).toBe('light');
  });

  test('sets data-theme attribute on light', async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    await act(async () => {
      screen.getByText('Set Light').click();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('removes data-theme attribute on dark', async () => {
    localStorage.setItem('theme', 'light');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    await act(async () => {
      screen.getByText('Set Dark').click();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  test('handles invalid localStorage value', () => {
    localStorage.setItem('theme', 'invalid');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark'); // defaults to dark
  });
});
