// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';

// The domain is named once, in public/config.js (or LANDING_DOMAIN). Until it is set the build uses the placeholder
// token, which scripts/postbuild.mjs replaces in dist/ the same way the old build did.
const configText = fs.readFileSync(new URL('./public/config.js', import.meta.url), 'utf8');
const fromConfig = /var TRAVELCRM_DOMAIN = '([^']+)'/.exec(configText)?.[1];
const domain = (process.env.LANDING_DOMAIN || fromConfig || 'YOUR-DOMAIN.example').trim();

const markets = { in: 'en-IN', uk: 'en-GB', eu: 'en-NL', us: 'en-US', au: 'en-AU' };

export default defineConfig({
  site: `https://${domain}`,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize(item) {
        // Home and the region pages are one cluster of alternates (hreflang), the same set the pages declare.
        const path = new URL(item.url).pathname;
        const isCluster = path === '/' || Object.keys(markets).some((k) => path === `/${k}/`);
        if (isCluster) {
          item.links = [
            { lang: 'x-default', url: `https://${domain}/` },
            ...Object.entries(markets).map(([k, lang]) => ({ lang, url: `https://${domain}/${k}/` })),
            { lang: 'en-IE', url: `https://${domain}/eu/` },
          ];
        }
        return item;
      },
    }),
  ],
});
