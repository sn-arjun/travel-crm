import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { buildConfigJson, resolveBuildUrls } from '../scripts/build-urls.mjs';
import { isUsableFeedUrl, resolveUpdateFeed } from './update-feed';

let dist = '';
beforeEach(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'update-feed-'));
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

const bake = (obj: object) => writeFileSync(path.join(dist, 'build-config.json'), JSON.stringify(obj));

describe('resolveUpdateFeed (packaged app on a customer PC)', () => {
  it('uses the feed baked into build-config.json when TRAVELCRM_UPDATE_URL is not in the environment', () => {
    bake({ updateUrl: 'https://downloads.acme.test/win/' });
    expect(resolveUpdateFeed({}, dist)).toEqual({ url: 'https://downloads.acme.test/win/', source: 'build-config' });
  });

  it('lets TRAVELCRM_UPDATE_URL override the baked feed (testing)', () => {
    bake({ updateUrl: 'https://downloads.acme.test/win/' });
    expect(resolveUpdateFeed({ TRAVELCRM_UPDATE_URL: 'http://127.0.0.1:9000/' }, dist)).toEqual({
      url: 'http://127.0.0.1:9000/',
      source: 'env',
    });
  });

  it('has no feed when nothing was baked and nothing is set', () => {
    bake({ apiUrl: 'https://api.acme.test/api/v1' });
    expect(resolveUpdateFeed({}, dist)).toEqual({ url: null, source: null });
  });

  it('has no feed when build-config.json is missing or broken', () => {
    expect(resolveUpdateFeed({}, dist).url).toBeNull();
    writeFileSync(path.join(dist, 'build-config.json'), '{not json');
    expect(resolveUpdateFeed({}, dist).url).toBeNull();
  });

  it('never treats the build placeholder as a feed', () => {
    bake({ updateUrl: 'https://updates.invalid/travelcrm/' });
    expect(resolveUpdateFeed({}, dist).url).toBeNull();
    expect(isUsableFeedUrl('https://updates.invalid/x')).toBe(false);
    expect(isUsableFeedUrl('ftp://downloads.acme.test/')).toBe(false);
    expect(isUsableFeedUrl('')).toBe(false);
  });
});

describe('build-time URLs written into build-config.json', () => {
  it('bakes TRAVELCRM_UPDATE_URL and TRAVELCRM_API_URL', () => {
    expect(buildConfigJson({ TRAVELCRM_UPDATE_URL: 'https://d.test/win/', TRAVELCRM_API_URL: 'https://a.test/api/v1' })).toEqual({
      apiUrl: 'https://a.test/api/v1',
      updateUrl: 'https://d.test/win/',
    });
  });

  it('derives both from DOMAIN, and explicit values win', () => {
    expect(resolveBuildUrls({ DOMAIN: 'acme.test' })).toMatchObject({
      apiUrl: 'https://api.acme.test/api/v1',
      updateUrl: 'https://downloads.acme.test/win/',
    });
    expect(resolveBuildUrls({ DOMAIN: 'acme.test', TRAVELCRM_UPDATE_URL: 'https://x.test/' }).updateUrl).toBe('https://x.test/');
  });

  it('bakes nothing without a domain or explicit values (no invented address)', () => {
    expect(buildConfigJson({})).toEqual({});
  });

  it('what is baked is what the app resolves', () => {
    bake(buildConfigJson({ DOMAIN: 'acme.test' }));
    expect(resolveUpdateFeed({}, dist).url).toBe('https://downloads.acme.test/win/');
  });
});
