import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_DOMAIN, readWebConfig } from './web-config';

describe('readWebConfig (agency web app, request-time Worker variables)', () => {
  it('derives the API and downloads addresses from PLATFORM_DOMAIN, the single place the domain is named', () => {
    const c = readWebConfig({ PLATFORM_DOMAIN: 'acme.test' });
    expect(c.domain).toBe('acme.test');
    expect(c.domainIsPlaceholder).toBe(false);
    expect(c.apiUrl).toBe('https://api.acme.test/api/v1');
    expect(c.downloadsBase).toBe('https://downloads.acme.test/win/');
  });

  it('falls back to the clearly marked placeholder when no domain is configured', () => {
    const c = readWebConfig({});
    expect(c.domain).toBe(PLACEHOLDER_DOMAIN);
    expect(c.domainIsPlaceholder).toBe(true);
    expect(c.apiUrl).toBe(`https://api.${PLACEHOLDER_DOMAIN}/api/v1`);
  });

  it('lets TRAVELCRM_API_URL override the derived API address and trims the trailing slash', () => {
    expect(readWebConfig({ PLATFORM_DOMAIN: 'acme.test', TRAVELCRM_API_URL: 'https://api-staging.workers.dev/api/v1/' }).apiUrl).toBe(
      'https://api-staging.workers.dev/api/v1',
    );
  });

  it('ignores an API override that is not an http(s) address', () => {
    expect(readWebConfig({ PLATFORM_DOMAIN: 'acme.test', TRAVELCRM_API_URL: 'javascript:alert(1)' }).apiUrl).toBe('https://api.acme.test/api/v1');
  });

  it('reads the installer and driver app links only when they are http(s) addresses', () => {
    const c = readWebConfig({ INSTALLER_URL: 'https://downloads.acme.test/win/Setup.exe', DRIVER_APP_URL: 'not a url' });
    expect(c.installerUrl).toBe('https://downloads.acme.test/win/Setup.exe');
    expect(c.driverAppUrl).toBeNull();
    expect(readWebConfig({}).installerUrl).toBeNull();
  });
});
