import { describe, it, expect } from 'vitest';
import { allowPermission, appOrigin, isAppOrigin } from './permissions';

const APP = 'http://127.0.0.1:41873';

describe('microphone permission for the app window', () => {
  it('allows audio for the app\'s own loopback origin', () => {
    expect(allowPermission('media', `${APP}/dashboard`, APP, { mediaTypes: ['audio'] })).toBe(true);
    expect(allowPermission('media', 'http://localhost:3100/leads', 'http://localhost:3100', { mediaTypes: ['audio'] })).toBe(true);
    // A permission check (no request yet) names one media type.
    expect(allowPermission('media', APP, APP, { mediaType: 'audio' })).toBe(true);
    expect(allowPermission('media', APP, APP)).toBe(true);
  });

  it('refuses the camera, alone or together with the microphone', () => {
    expect(allowPermission('media', APP, APP, { mediaTypes: ['video'] })).toBe(false);
    expect(allowPermission('media', APP, APP, { mediaTypes: ['audio', 'video'] })).toBe(false);
    expect(allowPermission('media', APP, APP, { mediaType: 'video' })).toBe(false);
    expect(allowPermission('media', APP, APP, { mediaTypes: [] })).toBe(false);
  });

  it('refuses every other origin: another host, another port, another scheme, a lookalike', () => {
    for (const other of [
      'https://evil.example/page',
      'http://127.0.0.1:9999/',
      'https://127.0.0.1:41873/',
      'http://127.0.0.1.evil.example:41873/',
      'http://localhost:41873/',
      'file:///C:/x.html',
      'not a url',
      '',
    ]) {
      expect(allowPermission('media', other, APP, { mediaTypes: ['audio'] }), other).toBe(false);
    }
    expect(allowPermission('media', undefined, APP, { mediaTypes: ['audio'] })).toBe(false);
  });

  it('refuses every permission that is not the microphone, even for the app origin', () => {
    for (const p of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal', 'display-capture', 'fullscreen', 'camera']) {
      expect(allowPermission(p, APP, APP), p).toBe(false);
    }
  });

  it('never trusts an app URL that is not on the loopback address', () => {
    expect(appOrigin('https://crm.example.com')).toBeNull();
    expect(allowPermission('media', 'https://crm.example.com/', 'https://crm.example.com', { mediaTypes: ['audio'] })).toBe(false);
    expect(appOrigin(APP)).toBe(APP);
    expect(isAppOrigin('http://[::1]:3100/x', 'http://[::1]:3100')).toBe(true);
  });
});
