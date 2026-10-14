import { describe, it, expect } from 'vitest';
import { navigation, findActiveHref, getPageTitle } from './nav-config';

const hrefs = navigation.flatMap((group) => group.items.map((item) => item.href));

describe('navigation', () => {
  it('has one Assistant entry instead of separate AI tool entries', () => {
    expect(hrefs).toContain('/assistant');
    expect(hrefs.filter((href) => href === '/ai' || href.startsWith('/ai/'))).toEqual([]);
    expect(hrefs).not.toContain('/chatbot');
  });

  it('keeps the Assistant entry highlighted on the AI tool pages and the chatbot', () => {
    expect(findActiveHref('/assistant')).toBe('/assistant');
    expect(findActiveHref('/ai')).toBe('/assistant');
    expect(findActiveHref('/ai/compose')).toBe('/assistant');
    expect(findActiveHref('/ai/bi/briefings')).toBe('/assistant');
    expect(findActiveHref('/chatbot/conversations/abc')).toBe('/assistant');
  });

  it('has no Super Admin entry: the operator console is a separate app', () => {
    expect(hrefs.filter((href) => href.startsWith('/super-admin'))).toEqual([]);
    expect(findActiveHref('/super-admin')).toBeNull();
  });

  it('leaves other sections alone', () => {
    expect(findActiveHref('/leads/123')).toBe('/leads');
    expect(findActiveHref('/communication/templates')).toBe('/communication/templates');
  });

  it('titles the Assistant page and the tool pages', () => {
    expect(getPageTitle('/assistant')).toBe('Assistant');
    expect(getPageTitle('/ai')).toBe('AI tools');
  });
});
