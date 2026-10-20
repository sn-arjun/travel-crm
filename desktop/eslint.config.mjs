import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

// ─── Design-system enforcement ──────────────────────────────
// These fail the build. See desktop/audit/remake/CONTRACT.md for the rules
// and the sanctioned alternative for each.

/** Raw hex colors and rgb()/rgba() outside the design system. */
const RAW_COLOR_RE = String.raw`(#[0-9a-fA-F]{3,8}\b|\brgba?\s*\()`;

/** Hardcoded px values, e.g. "16px", "p-[12px]". */
const RAW_PX_RE = String.raw`\b\d+px\b`;

/**
 * Raw Tailwind palette classes (bg-gray-100, text-orange-600, from-primary-400 ...).
 * CONTRACT.md section 3 requires ds-* token classes instead.
 */
const RAW_PALETTE_RE =
  '\\b(?:bg|text|border|from|via|to|ring|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|primary)-\\d{2,3}\\b';

/**
 * mailto:, wa.me, tel: — all outbound comms go through the Communication Hub.
 * Forward slashes MUST stay escaped: esquery parses the selector's `/.../` as
 * a regex literal and an unescaped `/` terminates it early.
 */
const DIRECT_CHANNEL_RE = String.raw`(mailto:|wa\.me\/|api\.whatsapp\.com\/send|tel:)`;

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // Strict TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // React rules
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',

      // Import ordering
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },

  // ── Rules 1 & 3: no raw hex/rgb()/px/palette, no direct comms links ──
  // One block: ESLint flat config REPLACES a rule's options rather than
  // merging them, so these selectors must be declared together.
  // Allowed only in design-system/ and globals.css, which define the tokens.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/design-system/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${RAW_COLOR_RE}/]`,
          message:
            'Raw color literals are not allowed. Use a semantic token class (e.g. text-ds-foreground, bg-ds-surface) or import from @/design-system/tokens.',
        },
        {
          selector: `TemplateElement[value.raw=/${RAW_COLOR_RE}/]`,
          message:
            'Raw color literals are not allowed. Use a semantic token class or import from @/design-system/tokens.',
        },
        {
          selector: `Literal[value=/${RAW_PX_RE}/]`,
          message:
            'Hardcoded px values are not allowed. Use a spacing token class (p-ds-4, gap-ds-2) or import from @/design-system/tokens.',
        },
        {
          selector: `TemplateElement[value.raw=/${RAW_PX_RE}/]`,
          message:
            'Hardcoded px values are not allowed. Use a spacing token class or import from @/design-system/tokens.',
        },
        {
          selector: `Literal[value=/${RAW_PALETTE_RE}/]`,
          message:
            'Raw Tailwind palette classes are not allowed. Use ds-* token classes (CONTRACT.md section 3).',
        },
        {
          selector: `TemplateElement[value.raw=/${RAW_PALETTE_RE}/]`,
          message:
            'Raw Tailwind palette classes are not allowed. Use ds-* token classes (CONTRACT.md section 3).',
        },
        {
          selector: `Literal[value=/${DIRECT_CHANNEL_RE}/]`,
          message:
            'Direct mailto:/wa.me/tel: links are not allowed. Use SendMessageDialog so the message routes through the Communication Hub.',
        },
        {
          selector: `TemplateElement[value.raw=/${DIRECT_CHANNEL_RE}/]`,
          message:
            'Direct mailto:/wa.me/tel: links are not allowed. Use SendMessageDialog so the message routes through the Communication Hub.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(split|slice|substring)$/][callee.object.callee.property.name='toISOString']",
          message: 'Use toLocalDateString() from @/lib/dates',
        },
      ],
    },
  },

  // ── Rule 2: components/ui/ is domain-free ────────────────
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/api', '@/lib/api/*', '../../lib/api', '../../lib/api/*'],
              message:
                'Primitives in components/ui/ must be domain-free. Pass data in via props, or put the component in components/domain/.',
            },
          ],
        },
      ],
    },
  },

  // ── Rule 4: user-facing copy lives in design-system/copy/ ─
  // Warn-level: flags long literal strings in JSX text position.
  {
    // R210: the shell, auth screens and shared components are on the translation catalogue; scripts/i18n-check.mjs
    // is the hard gate for them, this keeps new literals visible in the editor.
    files: [
      'src/app/**/*.tsx',
      'src/components/domain/**/*.tsx',
      'src/components/layout/**/*.tsx',
      'src/components/ui/**/*.tsx',
      'src/components/auth/**/*.tsx',
    ],
    rules: {
      'react/jsx-no-literals': [
        'warn',
        {
          noStrings: false,
          allowedStrings: [],
          ignoreProps: true,
        },
      ],
    },
  },

  {
    // Config, tokens, tests and Electron are exempt from the token rules.
    files: [
      'src/design-system/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.config.{ts,mjs,js}',
      'e2e/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'react/jsx-no-literals': 'off',
    },
  },

  // Tests, configs and e2e specs: loose typing is fine, unused vars only warn.
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts', '**/*.config.{ts,mjs,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },

  {
    ignores: [
      '.next/**',
      '.open-next/**',
      'out/**',
      'node_modules/**',
      'electron/**',
      'release/**',
      'playwright-report/**',
      'test-results/**',
      'audit/**',
      'showcase/**',
      'storybook-static/**',
      'coverage/**',
      'scripts/**',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
