import type { Env } from './types';

/**
 * The root Hono app, registered by index.ts.
 *
 * Automations perform their actions by calling the app's own API (same validation,
 * numbering, RBAC and logging as a click in the UI). Services cannot import index.ts
 * without a cycle, so index.ts hands the app over here.
 */
export interface RootApp {
  fetch(request: Request, env: Env, ctx?: ExecutionContext): Response | Promise<Response>;
}

let rootApp: RootApp | null = null;

export function setRootApp(app: RootApp): void {
  rootApp = app;
}

export function getRootApp(): RootApp {
  if (!rootApp) throw new Error('Root app is not registered');
  return rootApp;
}
