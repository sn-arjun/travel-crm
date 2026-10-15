import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Web build of the agency app (scripts/build-web.mjs). Same pattern as super-admin/: no cache bindings, no ISR.
//
// TRAVELCRM_WEB_BUNDLER=webpack is an escape hatch for building inside a git worktree whose node_modules is a link
// into another checkout: OpenNext pins Next's trace root to the worktree and Turbopack then rejects that link.
// Leave it unset in CI and in a normal checkout (Turbopack, the Next 16 default).
export default {
  ...defineCloudflareConfig(),
  ...(process.env.TRAVELCRM_WEB_BUNDLER === 'webpack' ? { buildCommand: 'npm run build -- --webpack' } : {}),
};
