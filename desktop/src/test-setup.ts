import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { setLocaleContext, resetLocaleContext } from '@/lib/locale';

// Every test starts as a signed-in Indian agency (rupees, en-IN grouping; the viewer's own time zone, as before), the same tenant the
// e2e demo uses. The locale store itself has no India default (lib/locale.test.ts proves it), so a test that
// wants another agency calls setLocaleContext() or resetLocaleContext() itself.
beforeEach(() => {
  resetLocaleContext();
  setLocaleContext({ currency: 'INR', locale: 'en-IN', timeZone: '', country: 'IN', phoneDefaultCountry: 'IN' });
});
