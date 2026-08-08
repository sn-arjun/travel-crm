import { describe, expect, it } from 'vitest';

import { WCAG_AA_NORMAL, contrastRatio, hexToRgb, relativeLuminance } from './contrast';
import { chartColors, contrastPairs, semanticColors } from './semantic';

describe('contrast utilities', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#4F46E5')).toEqual([79, 70, 229]);
  });

  it('rejects malformed hex', () => {
    expect(() => hexToRgb('#GGGGGG')).toThrow();
    expect(() => hexToRgb('nope')).toThrow();
  });

  it('computes known luminance endpoints', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('computes the known black-on-white ratio of 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#4F46E5', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#4F46E5'),
      10,
    );
  });
});

describe('semantic tokens', () => {
  it('defines both a light and a dark value for every token', () => {
    for (const [name, value] of Object.entries({ ...semanticColors, ...chartColors })) {
      expect(value.light, `${name}.light`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(value.dark, `${name}.dark`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('has no light-only token (light and dark must actually differ)', () => {
    // Pure white/black foregrounds legitimately repeat across accent roles,
    // but a token whose light and dark values are identical for a *surface*
    // role means dark mode was never authored for it.
    const surfaceRoles = [
      'background',
      'surface',
      'surface-raised',
      'surface-sunken',
      'border',
      'border-strong',
      'foreground',
      'foreground-muted',
      'foreground-subtle',
    ] as const;

    for (const role of surfaceRoles) {
      expect(semanticColors[role].light, role).not.toBe(semanticColors[role].dark);
    }
  });
});

describe('WCAG AA contrast (hard requirement: 4.5:1 in BOTH themes)', () => {
  for (const [fg, bg] of contrastPairs) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${fg} on ${bg} — ${theme}`, () => {
        const ratio = contrastRatio(semanticColors[fg][theme], semanticColors[bg][theme]);
        expect(
          ratio,
          `${fg} (${semanticColors[fg][theme]}) on ${bg} (${semanticColors[bg][theme]}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }
  }
});
