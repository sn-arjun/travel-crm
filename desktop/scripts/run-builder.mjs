// Runs electron-builder. TRAVELCRM_UPDATE_URL is the update feed baked into the installer
// (at go-live: the R2 bucket behind downloads.<domain>). Without it a placeholder is used so local
// builds work; the updater only runs when TRAVELCRM_UPDATE_URL is also set at runtime.
import { spawnSync } from 'node:child_process';

if (!process.env.TRAVELCRM_UPDATE_URL) {
  process.env.TRAVELCRM_UPDATE_URL = 'https://updates.invalid/travelcrm/';
  console.log('run-builder: TRAVELCRM_UPDATE_URL not set; using a placeholder feed (no auto-update until configured)');
}
const result = spawnSync('npx', ['electron-builder', '--config', 'electron-builder.yml', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
