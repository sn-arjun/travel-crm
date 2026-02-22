import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { TokenPayload } from './utils/jwt';

export interface Env {
  // D1 Databases
  MASTER_DB: D1Database;

  // R2 Buckets
  FILE_STORAGE: R2Bucket;

  // KV Namespaces
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;

  // Queues
  EMAIL_QUEUE: Queue;
  SMS_QUEUE: Queue;
  PUSH_NOTIFICATION_QUEUE: Queue;
  WP_PROVISION_QUEUE: Queue;

  // Durable Objects
  REALTIME: DurableObjectNamespace;

  // Environment Variables (Secrets)
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_VERIFY_SERVICE_SID: string;
  TWILIO_SMS_FROM_NUMBER: string;
  TWILIO_WHATSAPP_FROM_NUMBER: string;
  SENDGRID_API_KEY: string;
  FCM_SERVER_KEY: string;

  // Dynamic tenant D1 bindings — resolved at runtime
  [key: `TENANT_DB_${string}`]: D1Database;
}

export interface AppContext {
  Bindings: Env;
  Variables: {
    userId: string;
    tenantId: string;
    tenantDb: D1Database;
    role: string;
    userName: string;
    jwtPayload: TokenPayload;
    clientIp: string;
  };
}
