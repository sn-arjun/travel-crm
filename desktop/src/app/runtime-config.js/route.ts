import { readWebConfig } from '@/lib/web-config';

// Request-time, never cached or prerendered: the API address of the web build comes from the Worker's variables.
export const dynamic = 'force-dynamic';

/**
 * window.travelcrmConfig for the website, the same object the Electron preload provides. Only the website
 * build loads this script (see the root layout); in the desktop app the preload value always wins.
 */
export function GET() {
  const { apiUrl } = readWebConfig();
  const body = `window.travelcrmConfig = window.travelcrmConfig || ${JSON.stringify({ apiUrl })};\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
