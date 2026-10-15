import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Web build of the agency app (scripts/build-web.mjs). Same pattern as super-admin/: no cache bindings, no ISR.
export default defineCloudflareConfig();
