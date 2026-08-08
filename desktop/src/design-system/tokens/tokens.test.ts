import { describe, it, expect } from 'vitest';
import { colors } from './colors';
import { fontFamily, fontSize, fontWeight } from './typography';
import { spacing, borderRadius, shadows, zIndex, transitions, breakpoints, componentRadii } from './spacing';

describe('Design System Tokens', () => {
  describe('Color Tokens', () => {
    it('should define primary color scale (50-950)', () => {
      expect(colors.primary[50]).toBeDefined();
      expect(colors.primary[500]).toBe('#FF5C38');
      expect(colors.primary[950]).toBeDefined();
    });

    it('should define secondary color scale', () => {
      expect(colors.secondary[500]).toBe('#8B5CF6');
    });

    it('should define semantic colors', () => {
      expect(colors.success.DEFAULT).toBe('#22C55E');
      expect(colors.warning.DEFAULT).toBe('#F59E0B');
      expect(colors.error.DEFAULT).toBe('#EF4444');
      expect(colors.info.DEFAULT).toBe('#3B82F6');
    });

    it('should define semantic color variations', () => {
      for (const semantic of [colors.success, colors.warning, colors.error, colors.info]) {
        expect(semantic.light).toBeDefined();
        expect(semantic.bg).toBeDefined();
        expect(semantic.DEFAULT).toBeDefined();
        expect(semantic.text).toBeDefined();
      }
    });

    it('should define neutral gray scale', () => {
      expect(colors.gray[50]).toBe('#FAFAF9');
      expect(colors.gray[950]).toBe('#0C0A09');
    });

    it('should define lead priority colors', () => {
      expect(colors.leadPriority.hot).toBe('#EF4444');
      expect(colors.leadPriority.warm).toBe('#F59E0B');
      expect(colors.leadPriority.cold).toBe('#3B82F6');
      expect(colors.leadPriority.lost).toBe('#78716C');
      expect(colors.leadPriority.won).toBe('#22C55E');
    });

    it('should define pipeline stage colors', () => {
      expect(colors.pipeline.new).toBeDefined();
      expect(colors.pipeline.contacted).toBeDefined();
      expect(colors.pipeline.qualified).toBeDefined();
      expect(colors.pipeline.proposalSent).toBeDefined();
      expect(colors.pipeline.negotiation).toBeDefined();
      expect(colors.pipeline.won).toBeDefined();
      expect(colors.pipeline.lost).toBeDefined();
      expect(colors.pipeline.onHold).toBeDefined();
    });

    it('should define task priority colors', () => {
      expect(colors.taskPriority.urgent).toBe('#EF4444');
      expect(colors.taskPriority.normal).toBe('#F59E0B');
      expect(colors.taskPriority.low).toBe('#22C55E');
    });

    it('should have valid hex color format for all primary colors', () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const) {
        expect(colors.primary[shade]).toMatch(hexRegex);
      }
    });
  });

  describe('Typography Tokens', () => {
    it('should define font families', () => {
      expect(fontFamily.sans).toContain('Geist');
      expect(fontFamily.display).toContain('DM Sans');
      expect(fontFamily.mono).toContain('Geist Mono');
    });

    it('should define all font size categories', () => {
      const categories = [
        'display-xl', 'display-lg', 'display',
        'heading-lg', 'heading', 'heading-sm',
        'body-lg', 'body', 'body-sm',
        'caption', 'caption-sm',
        'overline',
        'tabular', 'tabular-lg',
      ] as const;

      for (const cat of categories) {
        expect(fontSize[cat]).toBeDefined();
        expect(fontSize[cat][0]).toMatch(/^\d+(\.\d+)?px$/);
      }
    });

    it('should define font weights', () => {
      expect(fontWeight.regular).toBe('400');
      expect(fontWeight.medium).toBe('500');
      expect(fontWeight.semibold).toBe('600');
      expect(fontWeight.bold).toBe('700');
    });
  });

  describe('Spacing Tokens', () => {
    it('should define spacing scale', () => {
      expect(spacing[0]).toBe('0px');
      expect(spacing[1]).toBe('4px'); // 4px base grid
      expect(spacing[2]).toBe('8px');
      expect(spacing[4]).toBe('16px');
      expect(spacing[8]).toBe('32px');
    });

    it('should have 4px base grid', () => {
      // Verify key spacing values follow 4px grid
      expect(parseInt(spacing[1])).toBe(4);
      expect(parseInt(spacing[2])).toBe(8);
      expect(parseInt(spacing[3])).toBe(12);
      expect(parseInt(spacing[4])).toBe(16);
    });
  });

  describe('Border Radius Tokens', () => {
    it('should define radius scale', () => {
      expect(borderRadius.none).toBe('0px');
      expect(borderRadius.sm).toBe('6px');
      expect(borderRadius.DEFAULT).toBe('10px');
      expect(borderRadius.full).toBe('9999px');
    });
  });

  describe('Shadow Tokens', () => {
    it('should define shadow scale', () => {
      expect(shadows.xs).toBeDefined();
      expect(shadows.sm).toBeDefined();
      expect(shadows.md).toBeDefined();
      expect(shadows.lg).toBeDefined();
      expect(shadows.xl).toBeDefined();
      expect(shadows.card).toBeDefined();
      expect(shadows.cardHover).toBeDefined();
      expect(shadows.none).toBe('none');
    });
  });

  describe('Z-Index Tokens', () => {
    it('should define z-index scale in ascending order', () => {
      const zValues = [
        parseInt(zIndex.base),
        parseInt(zIndex.dropdown),
        parseInt(zIndex.sticky),
        parseInt(zIndex.overlay),
        parseInt(zIndex.modal),
        parseInt(zIndex.popover),
        parseInt(zIndex.toast),
        parseInt(zIndex.command),
      ];

      zValues.forEach((value, i) => {
        if (i === 0) return;
        expect(value).toBeGreaterThan(zValues[i - 1] as number);
      });
    });
  });

  describe('Transition Tokens', () => {
    it('should define transitions', () => {
      expect(transitions.fast).toBeDefined();
      expect(transitions.base).toBeDefined();
      expect(transitions.slow).toBeDefined();
      expect(transitions.enter).toBeDefined();
      expect(transitions.exit).toBeDefined();
      expect(transitions.spring).toBeDefined();
    });
  });

  describe('Breakpoint Tokens', () => {
    it('should define breakpoints', () => {
      expect(breakpoints.compact).toBe('1024px');
      expect(breakpoints.default).toBe('1280px');
      expect(breakpoints.wide).toBe('1536px');
    });
  });

  describe('Component Radii', () => {
    it('should define radii for common components', () => {
      expect(componentRadii.button).toBe('10px');
      expect(componentRadii.input).toBe('10px');
      expect(componentRadii.card).toBe('14px');
      expect(componentRadii.dialog).toBe('16px');
      expect(componentRadii.avatar).toBe('9999px');
    });
  });
});
