import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

const PROVISIONER_SECRET = process.env.PROVISIONER_SECRET || 'change-me';
const DATA_DIR = process.env.DATA_DIR || '/opt/wp-data';
const MAX_SITES = parseInt(process.env.MAX_SITES || '50');

// Auth middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== PROVISIONER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    const { stdout } = await execAsync('docker ps --filter "name=wp-site-" --format "{{.Names}}" | wc -l');
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      activeSites: parseInt(stdout.trim()) || 0,
      maxSites: MAX_SITES,
    });
  } catch (e) {
    res.json({ status: 'ok', uptime: process.uptime(), activeSites: 0, maxSites: MAX_SITES });
  }
});

// Deploy new WordPress site
app.post('/api/deploy', async (req, res) => {
  const { siteId, subdomain, domain, template, companyName, ownerEmail } = req.body;

  if (!subdomain || !domain) {
    return res.status(400).json({ error: 'subdomain and domain are required' });
  }

  const dataDir = `${DATA_DIR}/${subdomain}`;
  const dbPassword = crypto.randomBytes(16).toString('hex');
  const wpAdminPassword = crypto.randomBytes(12).toString('base64url');

  try {
    // Check site limit
    const { stdout: countStr } = await execAsync('docker ps --filter "name=wp-site-" --format "{{.Names}}" | wc -l');
    if (parseInt(countStr.trim()) >= MAX_SITES) {
      return res.status(503).json({ error: 'Maximum site limit reached' });
    }

    // Create data directories
    await fs.mkdir(`${dataDir}/db`, { recursive: true });
    await fs.mkdir(`${dataDir}/uploads`, { recursive: true });

    // Find available port
    const wpPort = await findAvailablePort(8080, 9000);

    // Generate docker-compose.yml
    const composeContent = `version: '3.8'
services:
  db:
    image: mariadb:10.11
    container_name: wp-db-${subdomain}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${dbPassword}
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wp_user
      MYSQL_PASSWORD: ${dbPassword}
    volumes:
      - ${dataDir}/db:/var/lib/mysql
    networks:
      - wp-network
    deploy:
      resources:
        limits:
          memory: 256M

  wordpress:
    image: wordpress:6-php8.2-apache
    container_name: wp-site-${subdomain}
    restart: unless-stopped
    depends_on:
      - db
    environment:
      WORDPRESS_DB_HOST: wp-db-${subdomain}
      WORDPRESS_DB_USER: wp_user
      WORDPRESS_DB_PASSWORD: ${dbPassword}
      WORDPRESS_DB_NAME: wordpress
    ports:
      - "${wpPort}:80"
    volumes:
      - ${dataDir}/uploads:/var/www/html/wp-content/uploads
    networks:
      - wp-network
    deploy:
      resources:
        limits:
          memory: 512M

networks:
  wp-network:
    external: true
`;

    await fs.writeFile(`${dataDir}/docker-compose.yml`, composeContent);

    // Ensure wp-network exists
    try {
      await execAsync('docker network create wp-network');
    } catch {
      // Network may already exist
    }

    // Start containers
    await execAsync(`docker compose -f ${dataDir}/docker-compose.yml up -d`);

    // Update Caddy config for this site
    await updateCaddyConfig(subdomain, domain, wpPort);

    res.json({
      containerId: `wp-site-${subdomain}`,
      wpAdminUser: 'admin',
      wpAdminPassword,
      port: wpPort,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

// Stop site containers
app.post('/api/stop/:subdomain', async (req, res) => {
  const { subdomain } = req.params;
  try {
    await execAsync(`docker stop wp-site-${subdomain} wp-db-${subdomain}`);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

// Start stopped containers
app.post('/api/start/:subdomain', async (req, res) => {
  const { subdomain } = req.params;
  try {
    await execAsync(`docker start wp-db-${subdomain} wp-site-${subdomain}`);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

// Destroy site containers and volumes
app.delete('/api/destroy/:subdomain', async (req, res) => {
  const { subdomain } = req.params;
  try {
    await execAsync(`docker rm -f wp-site-${subdomain} wp-db-${subdomain}`);
    // Remove Caddy config
    try {
      await fs.unlink(`/opt/caddy/sites/${subdomain}.caddy`);
      await execAsync('docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile');
    } catch {
      // Caddy config may not exist
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

// Get site status
app.get('/api/status/:subdomain', async (req, res) => {
  const { subdomain } = req.params;
  try {
    const { stdout } = await execAsync(
      `docker inspect --format '{{.State.Status}}' wp-site-${subdomain}`
    );
    res.json({ subdomain, status: stdout.trim() });
  } catch {
    res.json({ subdomain, status: 'not found' });
  }
});

async function findAvailablePort(start: number, end: number): Promise<number> {
  const { stdout } = await execAsync("docker ps --format '{{.Ports}}'");
  const usedPorts = new Set<number>();
  const portRegex = /0\.0\.0\.0:(\d+)/g;
  let match;
  while ((match = portRegex.exec(stdout)) !== null) {
    usedPorts.add(parseInt(match[1]));
  }
  for (let port = start; port <= end; port++) {
    if (!usedPorts.has(port)) return port;
  }
  throw new Error('No available ports');
}

async function updateCaddyConfig(subdomain: string, domain: string, port: number) {
  const caddySnippet = `${domain} {
  reverse_proxy localhost:${port}
  encode gzip
  header {
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    Referrer-Policy strict-origin-when-cross-origin
  }
}
`;
  try {
    await fs.mkdir('/opt/caddy/sites', { recursive: true });
    await fs.writeFile(`/opt/caddy/sites/${subdomain}.caddy`, caddySnippet);
    await execAsync('docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile');
  } catch (e) {
    console.warn('Failed to update Caddy config:', e);
  }
}

const PORT = parseInt(process.env.PORT || '9090');
app.listen(PORT, () => {
  console.log(`WP Provisioner running on :${PORT}`);
});
