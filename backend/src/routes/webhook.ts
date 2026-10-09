import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext } from '../types';
import { handleWebForm } from './inbound';

const webhookRoutes = new Hono<AppContext>();

// Public CORS for webhooks
webhookRoutes.use('/*', cors({ origin: '*' }));

// POST /api/v1/leads/webhook — website enquiry form (same handler as /webhooks/inbound/web-form)
webhookRoutes.post('/leads/webhook', handleWebForm);

export default webhookRoutes;
