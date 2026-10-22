import { describe, expect, it } from 'vitest';
import { marginFiguresVisible, marginPreview, vatOnMargin, WORDING_PRESETS } from './margin-scheme';

describe('vatOnMargin', () => {
  it('takes the VAT contained in a VAT-inclusive margin, rounded half-up to the cent', () => {
    expect(vatOnMargin(400, 21)).toBe(69.42); // 400 x 21 / 121
    expect(vatOnMargin(300, 21)).toBe(52.07); // 52.066
    expect(vatOnMargin(1, 5)).toBe(0.05); // 0.0476
    expect(vatOnMargin(500, 21)).toBe(86.78);
  });

  it('is zero for a margin of zero or less, or without a rate', () => {
    expect(vatOnMargin(0, 21)).toBe(0);
    expect(vatOnMargin(-100, 21)).toBe(0);
    expect(vatOnMargin(400, 0)).toBe(0);
  });
});

describe('marginPreview', () => {
  it('works out the margin and the VAT on it when the cost and the rate are known', () => {
    expect(marginPreview({ price: 1000, cost: 600, vatRate: 21 })).toEqual({ margin: 400, vatOnMargin: 69.42, complete: true });
  });

  it('does not guess: no cost gives no margin, no rate gives no VAT', () => {
    expect(marginPreview({ price: 1000, cost: null, vatRate: 21 })).toEqual({ margin: null, vatOnMargin: null, complete: false });
    expect(marginPreview({ price: 1000, cost: undefined, vatRate: null })).toEqual({ margin: null, vatOnMargin: null, complete: false });
    expect(marginPreview({ price: 1000, cost: 600, vatRate: null })).toEqual({ margin: 400, vatOnMargin: null, complete: false });
  });

  it('keeps a loss as a negative margin and charges no VAT on it', () => {
    expect(marginPreview({ price: 300, cost: 400, vatRate: 21 })).toEqual({ margin: -100, vatOnMargin: 0, complete: true });
  });

  it('avoids floating point drift in the margin', () => {
    expect(marginPreview({ price: 0.3, cost: 0.1, vatRate: null }).margin).toBe(0.2);
  });
});

describe('wording presets', () => {
  it('offers the EU, Dutch and UK mentions and carries no rate', () => {
    expect(WORDING_PRESETS.map((p) => p.id)).toEqual(['eu', 'nl', 'uk']);
    expect(WORDING_PRESETS[0]!.wording).toBe('Margin scheme — Travel agents');
    expect(WORDING_PRESETS[1]!.wording).toBe('Bijzondere regeling reisbureaus');
    expect(WORDING_PRESETS[2]!.wording).toMatch(/^Tour Operators' Margin Scheme/);
    for (const p of WORDING_PRESETS) expect(p.wording).not.toMatch(/\d+\s*%/);
  });
});

describe('who sees the cost', () => {
  it('only staff who can edit invoices, and only on margin invoices', () => {
    expect(marginFiguresVisible(true, 'margin')).toBe(true);
    expect(marginFiguresVisible(false, 'margin')).toBe(false);
    expect(marginFiguresVisible(true, 'vat')).toBe(false);
  });
});
