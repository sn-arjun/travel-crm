// Runs electron-builder. The update feed is baked into the installer in two places:
//   - electron-builder's publish url (app-update.yml), from TRAVELCRM_UPDATE_URL or DOMAIN (see build-urls.mjs), and
//   - electron/dist/build-config.json (written by prepare-standalone.mjs), which the app reads at start, so a
//     customer PC with no environment variable still checks for updates.
// Without either, a placeholder is used so local builds work; such an installer never auto-updates.
import { spawnSync } from 'node:child_process';
import { PLACEHOLDER_FEED, resolveBuildUrls } from './build-urls.mjs';

const { updateUrl } = resolveBuildUrls(process.env);
if (updateUrl) {
  process.env.TRAVELCRM_UPDATE_URL = updateUrl;
  console.log(`run-builder: update feed ${updateUrl}`);
} else {
  process.env.TRAVELCRM_UPDATE_URL = PLACEHOLDER_FEED;
  console.log('run-builder: neither TRAVELCRM_UPDATE_URL nor DOMAIN is set; using a placeholder feed (this installer will not auto-update)');
}
const result = spawnSync('npx', ['electron-builder', '--config', 'electron-builder.yml', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
