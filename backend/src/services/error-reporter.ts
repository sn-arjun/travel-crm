/**
 * Error reporting hook. The default reporter writes a structured error line; when ERROR_REPORTER_DSN is
 * set, errors are also posted as a Sentry-compatible envelope (fetch, fire-and-forget). No SDK needed.
 * Only the error name/message/stack and the request/tenant ids are sent: never bodies or personal data.
 */
import type { Env } from '../types';
import { log } from '../utils/logger';

export interface ErrorContext {
  requestId?: string;
  tenantId?: string;
  source?: string; // 'http' | 'queue' | 'scheduled' | 'cron-job' ...
}

export interface ErrorReporter {
  /** Never throws. May return a promise the caller can hand to waitUntil. */
  report(err: unknown, ctx?: ErrorContext): Promise<void> | void;
}

type ReporterEnv = Pick<Env, 'ERROR_REPORTER_DSN' | 'ENVIRONMENT'>;

function describe(err: unknown): { type: string; message: string; stack?: string } {
  if (err instanceof Error) return { type: err.name, message: err.message.slice(0, 500), stack: err.stack?.slice(0, 4000) };
  return { type: 'NonError', message: String(err).slice(0, 500) };
}

export class ConsoleReporter implements ErrorReporter {
  report(err: unknown, ctx: ErrorContext = {}): void {
    const d = describe(err);
    log('error', 'error.reported', {
      source: ctx.source,
      requestId: ctx.requestId,
      tenantId: ctx.tenantId,
      errorType: d.type,
      errorMessage: d.message,
      stack: d.stack?.split('\n').slice(0, 6).join(' | '),
    });
  }
}

/** Parses https://<publicKey>@<host>/<projectId> into the envelope endpoint. Null when malformed. */
export function parseDsn(dsn: string): { url: string; key: string; dsn: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username, dsn };
  } catch {
    return null;
  }
}

export function buildEnvelope(dsn: string, err: unknown, ctx: ErrorContext, env?: { ENVIRONMENT?: string }): string {
  const d = describe(err);
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: 'error',
    environment: env?.ENVIRONMENT ?? 'unknown',
    exception: { values: [{ type: d.type, value: d.message }] },
    extra: d.stack ? { stack: d.stack } : undefined,
    tags: { source: ctx.source ?? 'unknown', requestId: ctx.requestId, tenantId: ctx.tenantId },
  };
  return [JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
}

export class HttpReporter implements ErrorReporter {
  private readonly target: NonNullable<ReturnType<typeof parseDsn>>;

  constructor(
    dsn: string,
    private readonly env: { ENVIRONMENT?: string } = {},
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {
    const t = parseDsn(dsn);
    if (!t) throw new Error('invalid ERROR_REPORTER_DSN');
    this.target = t;
  }

  async report(err: unknown, ctx: ErrorContext = {}): Promise<void> {
    new ConsoleReporter().report(err, ctx);
    try {
      await this.fetcher(this.target.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=travelcrm/1.0, sentry_key=${this.target.key}`,
        },
        body: buildEnvelope(this.target.dsn, err, ctx, this.env),
      });
    } catch {
      /* reporting must never break the request */
    }
  }
}

export function getReporter(env: ReporterEnv): ErrorReporter {
  if (env.ERROR_REPORTER_DSN) {
    try {
      return new HttpReporter(env.ERROR_REPORTER_DSN, env);
    } catch {
      /* fall through to console */
    }
  }
  return new ConsoleReporter();
}

/** Report an error; hands the delivery promise to waitUntil when an execution context is available. */
export function reportError(
  env: ReporterEnv,
  err: unknown,
  ctx: ErrorContext = {},
  waitUntil?: (p: Promise<unknown>) => void,
): void {
  try {
    const r = getReporter(env).report(err, ctx);
    if (r && typeof (r as Promise<void>).then === 'function') {
      if (waitUntil) waitUntil(r as Promise<void>);
      else (r as Promise<void>).catch(() => {});
    }
  } catch {
    /* never throw from reporting */
  }
}
