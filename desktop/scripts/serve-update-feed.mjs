// Tiny static server for a folder holding latest.yml (+ installer). Used to prove the update check.
//   node scripts/serve-update-feed.mjs <folder> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function serveUpdateFeed(folder, port = 0) {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
    const file = path.resolve(folder, name);
    if (!file.startsWith(path.resolve(folder)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\/g, '/')}`) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('usage: node scripts/serve-update-feed.mjs <folder> [port]');
    process.exit(1);
  }
  const server = await serveUpdateFeed(folder, Number(process.argv[3] ?? 0));
  console.log(`update feed at http://127.0.0.1:${server.address().port}/`);
}
