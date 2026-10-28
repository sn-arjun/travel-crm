// Build-time addresses baked into the installer (electron/dist/build-config.json and the electron-builder
// publish url). Pure so it can be tested; used by prepare-standalone.mjs and run-builder.mjs.
//
// DOMAIN is the one place the desktop build learns the public domain (docs/GO-LIVE.md phase 0). When it is set,
// the API address and the update feed are derived from it:
//   api.<DOMAIN>/api/v1   and   downloads.<DOMAIN>/win/
// TRAVELCRM_API_URL / TRAVELCRM_UPDATE_URL override the derived values. With neither, nothing is baked in
// (a local build then uses localhost and has no auto-update). There is deliberately no placeholder domain here:
// baking an address that does not exist would be worse than baking nothing.

export const PLACEHOLDER_FEED = 'https://updates.invalid/travelcrm/';

function clean(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

export function resolveBuildUrls(env = process.env) {
  const domain = clean(env.DOMAIN);
  const apiUrl = clean(env.TRAVELCRM_API_URL) ?? (domain ? `https://api.${domain}/api/v1` : undefined);
  const updateUrl = clean(env.TRAVELCRM_UPDATE_URL) ?? (domain ? `https://downloads.${domain}/win/` : undefined);
  return { domain, apiUrl, updateUrl };
}

/** The build-config.json the packaged app reads. */
export function buildConfigJson(env = process.env) {
  const { apiUrl, updateUrl } = resolveBuildUrls(env);
  return { ...(apiUrl ? { apiUrl } : {}), ...(updateUrl ? { updateUrl } : {}) };
}
