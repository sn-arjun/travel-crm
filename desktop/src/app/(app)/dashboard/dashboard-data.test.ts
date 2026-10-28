import { describe, it, expect } from 'vitest';
import { moneyTone } from './dashboard-data';

describe('moneyTone (R135-8)', () => {
  it('shows a zero amount in the neutral colour, whatever signal colour the figure normally carries', () => {
    expect(moneyTone(0, 'text-ds-danger')).toBeUndefined();
    expect(moneyTone(0, 'text-ds-warning')).toBeUndefined();
    expect(moneyTone(0, 'text-ds-success')).toBeUndefined();
  });

  it('keeps the signal colour for a real overdue amount', () => {
    expect(moneyTone(1250, 'text-ds-danger')).toBe('text-ds-danger');
    expect(moneyTone(40, 'text-ds-success')).toBe('text-ds-success');
  });

  it('treats missing or unreadable amounts as neutral and negative amounts as danger', () => {
    expect(moneyTone(undefined, 'text-ds-danger')).toBeUndefined();
    expect(moneyTone(null, 'text-ds-danger')).toBeUndefined();
    expect(moneyTone(Number.NaN, 'text-ds-danger')).toBeUndefined();
    expect(moneyTone(-5, 'text-ds-success')).toBe('text-ds-danger');
  });
});
