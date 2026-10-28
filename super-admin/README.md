# TravelCRM operator console

The platform operator's console (agencies, plans and pricing, subscriptions, reports, audit log). It is a thin
Next.js client of the backend's super admin API (`/api/v1/admin/*`). It has no database or storage access and no
credentials of its own.

- Sign in: `POST /admin/auth/login` on the backend. The 2 hour token is kept in the httpOnly, SameSite=Strict
  `sa_token` cookie (Secure everywhere except localhost). `middleware.ts` verifies it (HS256, audience
  `super-admin`) with `SUPER_ADMIN_JWT_SECRET`, which must be the same value as the backend's.
- Data: browser code calls `/api/<area>/...`; `src/app/api/[...path]/route.ts` forwards it to the backend with the
  token (`src/lib/backend.ts`).
- Roles come from the backend: `viewer` reads, `support` reads and starts support sessions, `super_admin` does everything.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `SUPER_ADMIN_JWT_SECRET` | secret | Same value as the backend. Missing: the console answers 500 and logs why. |
| `BACKEND_API_URL` | plain var | Backend base URL including `/api/v1`. Default for local work: `http://localhost:8787/api/v1`. |
| `NEXT_PUBLIC_DESKTOP_URL` | build time, optional | Where "Open in the agency app" points for support sessions (default `http://localhost:3000`). |

`.dev.vars.example` lists the names. Never commit values.

## Run locally against the fix stack

```bash
# 1. backend + agency web app (slot 1: API 8797, web 3110)
node desktop/scripts/fix-stack.mjs up --slot 1 --reset-db

# 2. first operator (once per database)
cd backend && node scripts/create-super-admin.mjs --local   # follow its prompts

# 3. the console
cd super-admin
printf 'SUPER_ADMIN_JWT_SECRET=<same value as backend/.dev.vars>\nBACKEND_API_URL=http://localhost:8797/api/v1\n' > .env.local
npm run dev          # http://localhost:3000
```

Do not run `npm install` inside `super-admin/`; install from the repository root.

## Build and deploy (OpenNext for Cloudflare Workers)

```bash
npm run build        # plain Next build (type and route check)
npm run preview      # opennextjs-cloudflare build && preview, reads .dev.vars
npm run deploy       # opennextjs-cloudflare build && deploy (uses wrangler.toml)
wrangler secret put SUPER_ADMIN_JWT_SECRET   # once per environment
```

Set `BACKEND_API_URL` in `wrangler.toml [vars]` (or the dashboard) to the deployed backend before the first deploy,
and attach the admin custom domain to the Worker. CI and Terraform are handled in R118.

## Pages

Dashboard, Tenants (list, detail, onboarding wizard), Subscriptions, Plans and Pricing, Platform Reports, Audit Log,
System Health. WordPress shows "coming soon" (ships later). Announcements, Support and SEO are hidden and redirect to
the dashboard because the backend has no API for them.
