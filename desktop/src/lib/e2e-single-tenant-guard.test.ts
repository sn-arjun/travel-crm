// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * R133: on a single-tenant stack every "agency" shares one database. A spec that changes the document numbering
 * prefix (the onboarding wizard or the numbering settings) therefore changes it for every later spec; the invoices
 * specs look for INV-/PI- numbers and failed (10 tests) after first-login.spec.ts set the prefix to TRV.
 * Specs that write the invoice prefix must either skip on a single-tenant stack or be the numbering settings spec,
 * which runs after the invoices specs (alphabetical order) and owns that setting.
 */
const E2E_DIR = path.resolve(__dirname, '../../e2e');
const OWNERS_OF_THE_PREFIX = new Set(['settings-company.spec.ts', 'reports.spec.ts']);

describe('e2e specs that change the invoice prefix', () => {
  const specs = readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(10);
  });

  for (const spec of specs.filter((f) => !OWNERS_OF_THE_PREFIX.has(f))) {
    const source = readFileSync(path.join(E2E_DIR, spec), 'utf8');
    if (!/#invoice_prefix|#invoicePrefix|\/settings\/numbering/.test(source)) continue;
    it(`${spec} skips on a single-tenant stack`, () => {
      expect(source).toMatch(/isMultiTenantStack/);
    });
  }
});
