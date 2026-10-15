import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLocaleContext } from './locale';
import { cn, formatCurrency, formatDate, formatRelativeTime, truncate, getInitials, debounce } from './utils';

describe('cn (className merge)', () => {
  it('should merge simple classes', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('should resolve conflicting Tailwind classes', () => {
    // tailwind-merge should pick the last conflicting class
    const result = cn('px-4', 'px-8');
    expect(result).toBe('px-8');
  });

  it('should handle undefined/null/empty values', () => {
    expect(cn('base', undefined, null, '', 'end')).toBe('base end');
  });

  it('should handle arrays', () => {
    expect(cn(['px-4', 'py-2'])).toBe('px-4 py-2');
  });
});

describe('formatCurrency', () => {
  it('should format INR amount', () => {
    const result = formatCurrency(100000, 'INR', 'en-IN');
    // Should contain the rupee symbol and formatted number
    expect(result).toContain('1,00,000');
  });

  it('should format USD amount', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US');
    expect(result).toContain('$');
    expect(result).toContain('1,234.56');
  });

  it('should handle zero amount', () => {
    const result = formatCurrency(0, 'INR', 'en-IN');
    expect(result).toContain('0');
  });

  it('should handle negative amounts', () => {
    const result = formatCurrency(-5000, 'INR', 'en-IN');
    expect(result).toContain('5,000');
  });

  it('should default to the active agency currency and locale (not a fixed INR)', () => {
    // test-setup.ts starts every test as an Indian agency
    expect(formatCurrency(100000)).toBe('₹1,00,000');
    setLocaleContext({ currency: 'GBP', locale: 'en-GB' });
    expect(formatCurrency(100000)).toBe('£100,000');
    setLocaleContext({ currency: 'USD', locale: 'en-US' });
    expect(formatCurrency(1000)).toBe('$1,000');
  });
});

describe('formatDate', () => {
  it('should format ISO date string', () => {
    const result = formatDate('2025-03-15T10:30:00Z');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    // Should contain "Mar" and "2025"
    expect(result).toContain('Mar');
    expect(result).toContain('2025');
  });

  it('should format Date object', () => {
    const result = formatDate(new Date(2025, 0, 1)); // Jan 1, 2025
    expect(result).toContain('Jan');
    expect(result).toContain('2025');
  });

  it('should accept custom options', () => {
    const result = formatDate('2025-06-15', { month: 'long' });
    expect(result).toContain('June');
  });

  it('should use the active locale', () => {
    expect(formatDate('2025-06-15T12:00:00Z')).toBe('15 Jun 2025');
    setLocaleContext({ locale: 'en-US' });
    expect(formatDate('2025-06-15T12:00:00Z')).toBe('Jun 15, 2025');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "Just now" for very recent times', () => {
    const result = formatRelativeTime(new Date('2025-06-15T11:59:45Z'));
    expect(result).toBe('Just now');
  });

  it('should return minutes ago', () => {
    const result = formatRelativeTime(new Date('2025-06-15T11:30:00Z'));
    expect(result).toBe('30m ago');
  });

  it('should return hours ago', () => {
    const result = formatRelativeTime(new Date('2025-06-15T09:00:00Z'));
    expect(result).toBe('3h ago');
  });

  it('should return days ago', () => {
    const result = formatRelativeTime(new Date('2025-06-12T12:00:00Z'));
    expect(result).toBe('3d ago');
  });

  it('should return formatted date for > 7 days', () => {
    const result = formatRelativeTime(new Date('2025-05-01T12:00:00Z'));
    expect(result).toContain('May');
  });

  it('should accept string input', () => {
    const result = formatRelativeTime('2025-06-15T11:50:00Z');
    expect(result).toBe('10m ago');
  });
});

describe('truncate', () => {
  it('should not truncate short text', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('should truncate long text with ellipsis', () => {
    expect(truncate('Hello World, this is a long text', 12)).toBe('Hello World…');
  });

  it('should handle exact length', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('should handle maxLength of 1', () => {
    expect(truncate('Hello', 1)).toBe('…');
  });
});

describe('getInitials', () => {
  it('should get initials from two-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('should get initials from single name', () => {
    expect(getInitials('Madonna')).toBe('M');
  });

  it('should limit to two initials for long names', () => {
    expect(getInitials('John Michael Smith')).toBe('JM');
  });

  it('should handle extra whitespace', () => {
    expect(getInitials('  John   Doe  ')).toBe('JD');
  });

  it('should uppercase initials', () => {
    expect(getInitials('alice bob')).toBe('AB');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce function calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('hello', 42);
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });

  it('should use latest arguments when debounced', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });
});
