import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import type { AppContext, Env } from './types';
import { error } from './utils/response';
import { handleQueue, type QueueMessage } from './queues/index';
import { RealtimeRoom } from './durable-objects/realtime';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import activityLogRoutes from './routes/activity-logs';
import settingsRoutes from './routes/settings';

const app = new Hono<AppContext>();

// --- Global Middleware ---

app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:8080',
      'https://*.pages.dev',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
    credentials: true,
  })
);

// --- Health Check ---

app.get('/api/v1/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// --- Auth & Tenant Middleware ---

app.use('/api/v1/*', authMiddleware);
app.use('/api/v1/*', tenantMiddleware);

// --- Route Registration ---

app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/activity-logs', activityLogRoutes);
app.route('/api/v1/settings', settingsRoutes);

// --- 404 Handler ---

app.notFound((c) => {
  return error(c, 'Not found', 404);
});

// --- Global Error Handler ---

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return error(c, 'Internal server error', 500);
});

// --- WebSocket Upgrade Route ---

app.get('/api/v1/ws', async (c) => {
  const tenantId = c.get('tenantId') || 'default';
  const userId = c.req.query('userId') || 'anonymous';

  const id = c.env.REALTIME.idFromName(tenantId);
  const room = c.env.REALTIME.get(id);

  const url = new URL(c.req.url);
  url.pathname = '/';
  url.searchParams.set('userId', userId);

  return room.fetch(new Request(url.toString(), c.req.raw));
});

// --- Export ---

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    await handleQueue(batch, env);
  },
};

// Re-export Durable Object class for wrangler
export { RealtimeRoom };
