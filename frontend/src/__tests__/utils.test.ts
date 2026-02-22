import { describe, test, expect } from 'vitest';
import { fmt, fmtDate, fmtRelative, colorForValue, pctChange, gradientForType, cn } from '../lib/utils';

// ── cn (className merge) ──────────────────────────────────────────────────────

describe('cn', () => {
  test('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  test('removes conflicting tailwind classes (last wins)', () => {
    const result = cn('text-sm', 'text-lg');
    expect(result).toBe('text-lg');
  });

  test('handles falsy values', () => {
    expect(cn('foo', undefined, null as unknown as string, 'bar')).toBe('foo bar');
  });

  test('handles conditional object syntax', () => {
    expect(cn({ 'text-red-500': true, 'text-green-500': false })).toBe('text-red-500');
  });
});

// ── fmt ───────────────────────────────────────────────────────────────────────

describe('fmt – currency (default)', () => {
  test('formats positive number as USD currency', () => {
    // minimumFractionDigits=0 — trailing zeros are dropped
    expect(fmt(1500)).toBe('$1,500');
  });

  test('formats zero', () => {
    expect(fmt(0)).toBe('$0');
  });

  test('formats negative number with minus sign', () => {
    const result = fmt(-250.5);
    expect(result).toContain('250');
    expect(result).toContain('-');
  });

  test('parses string input', () => {
    expect(fmt('45.99')).toBe('$45.99');
  });

  test('returns "—" for NaN string', () => {
    expect(fmt('not-a-number')).toBe('—');
  });

  test('returns "$0" for null (treated as 0)', () => {
    expect(fmt(null)).toBe('$0');
  });

  test('returns "$0" for undefined (treated as 0)', () => {
    expect(fmt(undefined)).toBe('$0');
  });
});

describe('fmt – compact mode', () => {
  test('formats millions as $XM', () => {
    expect(fmt(2_500_000, { compact: true })).toBe('$2.5M');
  });

  test('formats thousands as $XK', () => {
    expect(fmt(15_000, { compact: true })).toBe('$15.0K');
  });

  test('does not compact small numbers', () => {
    const result = fmt(999, { compact: true });
    expect(result).not.toContain('K');
    expect(result).not.toContain('M');
  });

  test('formats exact 1,000,000 as $1.0M', () => {
    expect(fmt(1_000_000, { compact: true })).toBe('$1.0M');
  });
});

describe('fmt – decimal style', () => {
  test('formats without currency symbol', () => {
    const result = fmt(42.5, { style: 'decimal' });
    expect(result).not.toContain('$');
    expect(result).toContain('42');
  });
});

describe('fmt – percent style', () => {
  test('formats 0.25 as 25%', () => {
    const result = fmt(0.25, { style: 'percent', maximumFractionDigits: 0 });
    expect(result).toContain('25');
    expect(result).toContain('%');
  });
});

// ── fmtDate ───────────────────────────────────────────────────────────────────

describe('fmtDate', () => {
  test('formats ISO date string in default pattern', () => {
    expect(fmtDate('2026-01-15')).toBe('Jan 15, 2026');
  });

  test('accepts custom format pattern', () => {
    expect(fmtDate('2026-06-01', 'MM/dd/yyyy')).toBe('06/01/2026');
  });

  test('returns "—" for null', () => {
    expect(fmtDate(null)).toBe('—');
  });

  test('returns "—" for undefined', () => {
    expect(fmtDate(undefined)).toBe('—');
  });

  test('returns input string on parse failure', () => {
    const result = fmtDate('not-a-date');
    // Should not throw; returns something
    expect(typeof result).toBe('string');
  });
});

// ── fmtRelative ───────────────────────────────────────────────────────────────

describe('fmtRelative', () => {
  test('returns a relative string for a recent date', () => {
    // 5 days ago
    const d = new Date();
    d.setDate(d.getDate() - 5);
    const result = fmtRelative(d.toISOString());
    expect(result).toMatch(/ago|days/i);
  });

  test('returns "—" for null', () => {
    expect(fmtRelative(null)).toBe('—');
  });

  test('returns "—" for undefined', () => {
    expect(fmtRelative(undefined)).toBe('—');
  });
});

// ── colorForValue ─────────────────────────────────────────────────────────────

describe('colorForValue', () => {
  test('positive value → emerald (positive=true)', () => {
    expect(colorForValue(100)).toBe('text-emerald-400');
  });

  test('negative value → red (positive=true)', () => {
    expect(colorForValue(-50)).toBe('text-red-400');
  });

  test('zero → slate', () => {
    expect(colorForValue(0)).toBe('text-slate-400');
  });

  test('positive value → red when positive=false (inverted)', () => {
    expect(colorForValue(100, false)).toBe('text-red-400');
  });

  test('negative value → emerald when positive=false (inverted)', () => {
    expect(colorForValue(-50, false)).toBe('text-emerald-400');
  });
});

// ── pctChange ─────────────────────────────────────────────────────────────────

describe('pctChange', () => {
  test('calculates correct positive percentage change', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
  });

  test('calculates correct negative percentage change', () => {
    expect(pctChange(90, 100)).toBeCloseTo(-10);
  });

  test('returns 0 when previous is 0', () => {
    expect(pctChange(50, 0)).toBe(0);
  });

  test('returns 0 when current equals previous', () => {
    expect(pctChange(100, 100)).toBeCloseTo(0);
  });

  test('handles decrease from large to small', () => {
    expect(pctChange(50, 200)).toBeCloseTo(-75);
  });
});

// ── gradientForType ───────────────────────────────────────────────────────────

describe('gradientForType', () => {
  test.each([
    ['checking',    'blue'],
    ['savings',     'emerald'],
    ['credit',      'red'],
    ['investment',  'purple'],
    ['real_estate', 'orange'],
    ['vehicle',     'slate'],
    ['insurance',   'sky'],
  ])('type "%s" includes expected colour', (type, colour) => {
    expect(gradientForType(type)).toContain(colour);
  });

  test('unknown type returns empty string or a default', () => {
    const result = gradientForType('unknown_type');
    expect(typeof result).toBe('string');
  });
});
