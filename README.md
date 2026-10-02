# TravelCRM Pro

Multi-tenant SaaS CRM for tours & travels companies. **Electron + Next.js** desktop app, Flutter mobile apps, Cloudflare Workers backend, D1 (SQLite) database-per-tenant, Oracle Cloud for WordPress hosting, Terraform for infrastructure.

---

## Architecture

```
Desktop App (desktop/)                  Mobile Apps (packages/)              Super Admin (super-admin/)
  Electron + Next.js 16 + React 19        Flutter (iOS/Android)               Next.js + Tailwind + Shadcn
  Shadcn UI + TailwindCSS                 Riverpod + GoRouter + ScreenUtil    Zustand
          │                                         │                                   │
          └─────────────────────────────────────────┴───────────────────────────────┬──┘
                                                                                      │
                                                                                      ▼
                                                           Cloudflare Workers (backend/)
                                                           Hono.js + Zod validation + JWT auth
                                                                      │
                                                          ├── D1 (master)     ── tenant registry, subscriptions, billing
                                                          ├── D1 (per-tenant) ── isolated SQLite per customer
                                                          ├── R2              ── file storage
                                                          ├── KV              ── cache, sessions, report cache
                                                          ├── Queues          ── email, sms, push, import/export, campaigns
                                                          ├── Durable Objects ── real-time WebSocket rooms
                                                          └── Workers AI      ── AI bindings

                                                           Oracle Cloud (terraform/modules/oracle-cloud)
                                                           ARM instance ── WordPress hosting for tenant sites via Caddy + Docker
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Primary Frontend** | **Electron + Next.js 16 + React 19** (desktop) |
| **Mobile Frontend** | Flutter 3.41.1 / Dart 3.11.0 (iOS/Android) |
| UI Components | Shadcn UI + TailwindCSS |
| State Management | Zustand (desktop), Riverpod 2.0 (Flutter) |
| Routing | Next.js App Router (desktop), GoRouter (Flutter) |
| Backend | Cloudflare Workers + Hono.js 4.x |
| Validation | Zod 4.x |
| Database | Cloudflare D1 (SQLite), Drizzle ORM for schema, raw SQL in routes |
| Auth | JWT (jose) + bcrypt + Twilio Verify OTP |
| AI | Anthropic Claude (via Workers AI router) |
| Voice | Twilio Voice + Deepgram transcription |
| Email | SendGrid |
| Push | Firebase Cloud Messaging |
| IaC | Terraform (Oracle Cloud + Cloudflare) |
| CI/CD | GitHub Actions |
| Super Admin | Next.js 16 + React 19 + Zustand |
| Monorepo | npm workspaces |

---

## Repository Structure

```
.
├── desktop/                    # ★ PRIMARY FRONTEND: Electron + Next.js 16 + React 19
│   ├── src/
│   │   ├── app/               # Next.js App Router
│   │   │   ├── (auth)/        # Login, password reset
│   │   │   ├── (app)/         # CRM pages (contacts, leads, itineraries, etc.)
│   │   │   └── api/           # Internal API routes
│   │   ├── components/        # React components (domain + UI)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/api/           # API client methods (contacts.ts, leads.ts, etc.)
│   │   ├── lib/               # Utilities (format, validation, helpers)
│   │   ├── stores/            # Zustand state (auth, notifications, etc.)
│   │   └── styles/            # Global CSS, Tailwind config
│   ├── electron/              # Electron main + preload scripts
│   ├── e2e/                   # Playwright E2E tests (one per feature slice)
│   ├── public/                # Static assets
│   ├── desktop/audit/         # Milestone reports + coverage data
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── playwright.config.ts
│   └── package.json
│
├── backend/                    # Cloudflare Workers API
│   ├── src/
│   │   ├── index.ts           # Entry point — route mounts, queue consumers, cron
│   │   ├── db/
│   │   │   ├── master-schema.ts   # Master DB tables (tenants, subscriptions)
│   │   │   └── tenant-schema.ts   # Tenant DB tables (all feature tables)
│   │   ├── middleware/        # Auth, rate limiting, input validation
│   │   ├── routes/            # 45+ route files (one per feature)
│   │   ├── services/          # AI router, Twilio, Deepgram, call routing
│   │   ├── utils/             # JWT, response helpers, sanitize, business hours
│   │   ├── queues/            # Queue consumer handlers
│   │   └── types.ts           # Env bindings, AppContext type
│   ├── drizzle/
│   │   ├── master/            # 8 master DB migrations
│   │   └── tenant/            # 24 tenant DB migrations
│   ├── wrangler.toml          # Worker config (D1, R2, KV, Queues, DO, Crons)
│   ├── .dev.vars              # Local dev secrets (gitignored, auto-generated)
│   └── package.json
│
├── packages/
│   ├── shared-ts/             # Shared TypeScript types (used by desktop)
│   │   └── src/types/         # Shared model definitions
│   │
│   ├── shared/                # Shared Dart package (models + API client)
│   │   └── lib/
│   │       ├── api_client/
│   │       │   ├── api_client.dart      # Dio HTTP client
│   │       │   └── api_endpoints.dart   # All endpoint paths (centralized)
│   │       ├── models/        # 30+ Freezed model files
│   │       └── shared.dart    # Barrel export
│   │
│   ├── crm_app/               # Main CRM — Flutter (mobile: iOS/Android)
│   │   └── lib/
│   │       ├── app/
│   │       │   └── router.dart          # GoRouter routes
│   │       ├── core/
│   │       │   ├── constants/app_config.dart  # API URL, env, feature flags
│   │       │   ├── widgets/app_scaffold.dart  # Sidebar menu (kMenuItems)
│   │       │   ├── theme/               # Colors, typography
│   │       │   └── network/             # Interceptors, offline sync
│   │       ├── features/      # 27 feature modules
│   │       │   ├── leads/     # ★ Reference implementation
│   │       │   ├── contacts/
│   │       │   ├── invoices/
│   │       │   ├── itineraries/
│   │       │   ├── fleet/
│   │       │   ├── marketing/
│   │       │   ├── ai_assistant/
│   │       │   ├── calls/
│   │       │   ├── chatbot/
│   │       │   └── ...
│   │       └── l10n/          # Localization (en, hi)
│   │
│   └── driver_app/            # Driver companion app (Flutter mobile)
│
├── super-admin/               # Platform admin dashboard (Next.js)
│   ├── src/app/               # Next.js App Router
│   │   ├── (authenticated)/   # Tenant mgmt, subscriptions, reports, audit
│   │   ├── api/               # API routes (D1 direct access)
│   │   └── login/
│   ├── wrangler.toml
│   └── package.json
│
├── terraform/                 # Infrastructure as Code (single source of truth)
│   ├── main.tf                # Orchestrates Oracle Cloud + Cloudflare modules
│   ├── providers.tf           # Terraform + provider versions, R2 state backend
│   ├── variables.tf           # ALL config — infra IDs + API keys + secrets
│   ├── outputs.tf             # Resource IDs consumed by scripts/sync-config.sh
│   ├── terraform.tfvars.example   # ★ Copy this, fill in values
│   ├── environments/          # Per-env overrides (dev, staging, prod)
│   └── modules/
│       ├── oracle-cloud/      # VCN, subnet, ARM instance, cloud-init
│       └── cloudflare/        # DNS, D1, R2, KV, Queues, Pages projects
│
├── oci-provisioner/           # WordPress site provisioner (runs on OCI instance)
│   └── src/server.ts          # Express API — deploy/start/stop/destroy WP sites
│
├── scripts/
│   ├── sync-config.sh         # terraform.tfvars → .dev.vars + wrangler.toml IDs
│   └── push-secrets.sh        # terraform.tfvars → wrangler secret put
│
├── .github/workflows/         # CI/CD pipelines
│   ├── deploy-backend.yml     # API → Cloudflare Workers
│   ├── deploy-crm.yml         # Flutter web → Cloudflare Pages
│   ├── deploy-admin.yml       # Next.js → Cloudflare Pages
│   ├── terraform.yml          # Terraform plan/apply
│   ├── test.yml               # TypeScript check + dart analyze + tests
│   └── release.yml            # Android/iOS/Windows/Web release builds
│
├── CONTRIBUTING.md            # ★ 13-step guide for adding features
├── melos.yaml                 # Monorepo package config
└── package.json               # Root scripts (dev, build, deploy, infra)
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | >= 22 | Backend, tooling, super-admin |
| npm | >= 10 | Package management |
| Flutter | >= 3.41.1 | Frontend apps |
| Dart | >= 3.11.0 | Shared models, analysis |
| Terraform | >= 1.8 | Infrastructure provisioning |
| Wrangler | >= 4.x | Cloudflare Workers CLI (installed as devDep) |
| Melos | (via dart pub global) | Flutter monorepo management |
| Git | >= 2.40 | Version control |

Install Melos globally:

```bash
dart pub global activate melos
```

---

## Quick Start (Local Development)

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd CRM
npm run setup

# 2. Configure secrets (for local dev, defaults work without external services)
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit terraform.tfvars with your API keys, then:
npm run infra:sync       # generates backend/.dev.vars from terraform.tfvars

# 3. Run database migrations (local D1)
npm run db:migrate

# 4. Start everything (desktop app is default)
npm run dev
```

This starts concurrently:
- **Desktop app** (Electron + Next.js) at `http://localhost:3000`
- **Backend API** at `http://localhost:8787` (wrangler dev)

### Individual services

```bash
npm run dev:api          # Backend only
npm run dev:desktop      # Desktop app only (Electron + Next.js)
npm run dev:admin        # Super Admin only (Next.js on :3001)
npm run dev:flutter      # Flutter mobile (iOS/Android)
```

### Flutter mobile development

```bash
# Mobile apps (iOS/Android) — requires x86 PowerShell on Windows
"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd packages/crm_app && flutter run"
```

---

## Deploy (Production)

### One command — provisions infra + pushes secrets + deploys everything:

```bash
npm run deploy
```

This runs sequentially:
1. `infra` — `terraform apply` (creates D1, R2, KV, Queues, Pages, OCI) + syncs resource IDs into wrangler.toml
2. `secrets:push` — pushes all API keys from terraform.tfvars to Cloudflare Workers
3. `deploy:api` — deploys backend Worker (`wrangler deploy --env production`)
4. `deploy:web` — builds Flutter web + deploys to Cloudflare Pages
5. `deploy:admin` — builds Next.js + deploys to Cloudflare Pages

### Deploy individually

```bash
npm run infra            # Provision infrastructure only
npm run infra:plan       # Preview infrastructure changes
npm run secrets:push     # Push secrets to Cloudflare Workers
npm run deploy:api       # Deploy backend only
npm run deploy:web       # Build + deploy Flutter web only
npm run deploy:admin     # Build + deploy super admin only
```

### Build without deploying

```bash
npm run build            # Build all (typecheck + flutter web + next.js)
npm run build:api        # TypeScript check only
npm run build:web        # Flutter web build
npm run build:admin      # Next.js build
npm run build:android:crm    # Android APK
npm run build:windows        # Windows MSIX
```

---

## Configuration (Single Source of Truth)

All configuration lives in `terraform/terraform.tfvars`. This file is gitignored and contains:

- **Infrastructure** — Cloudflare account ID, OCI credentials, domain
- **API keys** — Twilio, SendGrid, Deepgram, Anthropic, FCM, Google Maps
- **App secrets** — JWT secrets, super admin credentials

```bash
# Copy template and fill in your values
cp terraform/terraform.tfvars.example terraform/terraform.tfvars

# After editing, sync to local dev config
npm run infra:sync       # generates backend/.dev.vars + updates wrangler.toml IDs

# For production, push secrets to Cloudflare
npm run secrets:push
```

### What `infra:sync` does

Reads `terraform/terraform.tfvars` and `terraform output` to:
1. Generate `backend/.dev.vars` — local dev secrets for `wrangler dev`
2. Update `backend/wrangler.toml` — replaces placeholder resource IDs (D1, KV) with real Terraform output values

### Required external services

| Service | Required | Free tier | Used for |
|---|---|---|---|
| Cloudflare | Yes | Workers free (100K req/day), D1 5GB, R2 10GB | Backend, DB, storage |
| Oracle Cloud | Optional | Always free ARM (4 OCPU, 24 GB) | WordPress hosting |
| Twilio | Optional | Trial $15 credit | SMS, WhatsApp, Voice, OTP |
| SendGrid | Optional | 100 emails/day free | Transactional email |
| Deepgram | Optional | $200 free credit | Call transcription |
| Anthropic | Optional | Pay-as-you-go | AI assistant, intelligence |
| Firebase | Optional | Free tier | Push notifications |
| Google Maps | Optional | $200/month free | Address autocomplete |

---

## Database

### Schema

- **Master DB** (`travelcrm-master`) — tenant registry, subscriptions, billing, feature flags
- **Tenant DBs** (`TENANT_DB_{id}`) — one D1 per customer, fully isolated

### Migrations

```bash
npm run db:migrate       # Apply migrations locally
npm run db:generate      # Generate new migration from schema changes
npm run db:studio        # Open Drizzle Studio (visual DB browser)
```

Migrations live in `backend/drizzle/master/` and `backend/drizzle/tenant/`.

### Data conventions

| Data type | SQLite type | Example |
|---|---|---|
| IDs | TEXT | UUIDv7 (`0190a1b2-...`) |
| Dates | TEXT | ISO 8601 (`2026-02-28T12:00:00Z`) |
| Money | REAL | `1299.50` |
| JSON | TEXT | `'{"key": "value"}'` |
| Booleans | INTEGER | `0` / `1` |

---

## Testing

```bash
npm run test             # Run all tests (API + Flutter)
npm run test:api         # Backend unit tests (vitest)
npm run test:flutter     # Flutter unit tests (melos)
npm run typecheck        # TypeScript type checking
npm run analyze          # Dart static analysis (shared + crm_app)
```

---

## Adding a New Feature

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the complete 13-step guide. Summary:

1. **Schema** — Add tables to `backend/src/db/tenant-schema.ts`
2. **Migration** — Create SQL in `backend/drizzle/tenant/`
3. **Backend route** — Create `backend/src/routes/<feature>.ts`
4. **Register route** — Add to `routeMounts` in `backend/src/index.ts`
5. **Shared model** — Create Freezed model in `packages/shared/lib/models/`
6. **API endpoints** — Add to `packages/shared/lib/api_client/api_endpoints.dart`
7. **Export** — Add to `packages/shared/lib/shared.dart`
8. **Repository** — Create `packages/crm_app/lib/features/<feature>/data/<feature>_repository.dart`
9. **Providers** — Riverpod providers for state
10. **Screens** — List, Form, Detail screens
11. **Router** — Add routes to `packages/crm_app/lib/app/router.dart`
12. **Sidebar** — Add menu item to `packages/crm_app/lib/core/widgets/app_scaffold.dart`
13. **Code gen** — Run `npm run dev:codegen`

Reference implementation: `features/leads/` is the most complete end-to-end example.

---

## Backend Patterns

### Route structure

Every route file exports a Hono router. Routes use raw D1 SQL (not Drizzle query builder):

```typescript
import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, error, notFound, paginated } from '../utils/response';
import { uuidv7 } from 'uuidv7';

const app = new Hono<AppContext>();

app.get('/', async (c) => {
  const db = c.get('tenantDb');          // tenant D1 database
  const userId = c.get('userId');        // from JWT middleware
  const { rows } = await db.prepare('SELECT * FROM items WHERE created_by = ?').bind(userId).all();
  return success(c, rows);
});

app.post('/', async (c) => {
  const db = c.get('tenantDb');
  const body = await c.req.json();
  const id = uuidv7();
  await db.prepare('INSERT INTO items (id, name) VALUES (?, ?)').bind(id, body.name).run();
  return success(c, { id }, 201);
});

export default app;
```

### Environment access

```typescript
c.env.ANTHROPIC_API_KEY   // env vars / secrets
c.get('tenantDb')         // tenant D1 database
c.get('userId')           // authenticated user ID
c.get('tenantId')         // current tenant ID
c.get('role')             // user role (admin, manager, agent)
```

### AI Router

```typescript
import { AIRouter } from '../services/ai-router';
const ai = new AIRouter(c.env);
const result = await ai.route('lead_scoring', inputText, systemPrompt);
// result: { result, model, inputTokens, outputTokens, cost }
```

---

## Flutter Patterns

### Model (Freezed)

```dart
@freezed
abstract class MyModel with _$MyModel {
  const factory MyModel({
    required String id,
    required String name,
    String? description,
    @Default(false) bool isActive,
  }) = _MyModel;

  factory MyModel.fromJson(Map<String, dynamic> json) => _$MyModelFromJson(json);
}
```

All models use `abstract class` with Freezed.

### Repository

```dart
final myRepoProvider = Provider((ref) {
  final client = ref.watch(apiClientProvider);
  return MyRepository(client);
});

class MyRepository {
  final ApiClient _client;
  MyRepository(this._client);

  Future<List<MyModel>> list({int page = 1}) async {
    final res = await _client.get(ApiEndpoints.myFeature, queryParams: {'page': '$page'});
    return (res['data'] as List).map((e) => MyModel.fromJson(e)).toList();
  }
}
```

### Build configuration

Flutter web builds use `--dart-define` for environment variables:

```bash
flutter build web --release --web-renderer canvaskit \
  --dart-define=API_BASE_URL=https://api.yourdomain.com \
  --dart-define=ENVIRONMENT=production
```

---

## Infrastructure

### Terraform resources

| Resource | Binding | Purpose |
|---|---|---|
| D1 `travelcrm-master` | `MASTER_DB` | Tenant registry |
| R2 `travelcrm-files` | `FILE_STORAGE` | Document/image storage |
| KV `travelcrm-cache` | `CACHE` | API response caching |
| KV `travelcrm-sessions` | `SESSIONS` | Session storage |
| KV `travelcrm-report-cache` | `REPORT_CACHE` | Report result caching |
| Queue `*-email-queue` | `EMAIL_QUEUE` | Async email delivery |
| Queue `*-sms-queue` | `SMS_QUEUE` | Async SMS delivery |
| Queue `*-push-queue` | `PUSH_NOTIFICATION_QUEUE` | Async push notifications |
| Queue `*-import-queue` | `IMPORT_QUEUE` | CSV/Excel import processing |
| Queue `*-export-queue` | `EXPORT_QUEUE` | Data export generation |
| Queue `*-campaign-queue` | `CAMPAIGN_QUEUE` | Marketing campaign sending |
| Queue `*-wp-provision-queue` | `WP_PROVISION_QUEUE` | WordPress site provisioning |
| Durable Object `RealtimeRoom` | `REALTIME` | WebSocket rooms |
| Pages `travelcrm-web` | — | Flutter CRM web hosting |
| Pages `travelcrm-admin` | — | Super Admin hosting |
| OCI ARM Instance | — | WordPress + Caddy reverse proxy |

### Terraform workflow

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill in values
terraform init                                  # first time only
terraform plan                                  # preview changes
terraform apply                                 # provision resources
```

State is stored in a Cloudflare R2 bucket (`terraform-state`). Create this bucket manually before first `terraform init`.

---

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `test.yml` | PR, push to main | TypeScript check, dart analyze, vitest, flutter test |
| `deploy-backend.yml` | Push to main (backend/**) | `wrangler deploy --env production` + health check |
| `deploy-crm.yml` | Push to main (packages/**) | Flutter web build + Cloudflare Pages deploy |
| `deploy-admin.yml` | Push to main (super-admin/**) | Next.js build + Cloudflare Pages deploy |
| `terraform.yml` | Push to main (terraform/**) | `terraform plan` (PR) / `terraform apply` (main) |
| `release.yml` | Push to release branch | Android, iOS, Windows, Web builds + artifacts |

### Required GitHub secrets

```
CLOUDFLARE_API_TOKEN       # Cloudflare API token
CLOUDFLARE_ACCOUNT_ID      # Cloudflare account ID
OCI_TENANCY_OCID           # Oracle Cloud tenancy
OCI_USER_OCID              # Oracle Cloud user
OCI_FINGERPRINT            # Oracle Cloud API key fingerprint
OCI_PRIVATE_KEY            # Oracle Cloud private key (PEM)
R2_ACCESS_KEY_ID           # R2 S3 compat (for TF state)
R2_SECRET_ACCESS_KEY       # R2 S3 compat (for TF state)
KEYSTORE_PASSWORD          # Android signing
KEY_ALIAS                  # Android signing
KEY_PASSWORD               # Android signing
```

GitHub variables: `API_BASE_URL`, `DOMAIN`

---

## All npm Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API + codegen + Flutter web (concurrent) |
| `npm run dev:api` | Start backend only (wrangler dev, port 8787) |
| `npm run dev:web` | Start Flutter web only (Chrome, port 8080) |
| `npm run dev:admin` | Start super admin only (Next.js, port 3000) |
| `npm run dev:codegen` | Run Freezed/Riverpod code generation once |
| `npm run build` | Build all (typecheck + web + admin) |
| `npm run build:web` | Flutter web release build |
| `npm run build:admin` | Next.js production build |
| `npm run build:android:crm` | Android APK release |
| `npm run build:windows` | Windows MSIX release |
| `npm run deploy` | Full deploy: infra + secrets + api + web + admin |
| `npm run deploy:api` | Deploy backend Worker to production |
| `npm run deploy:web` | Build + deploy CRM to Cloudflare Pages |
| `npm run deploy:admin` | Build + deploy super admin to Cloudflare Pages |
| `npm run infra` | Terraform apply + sync config |
| `npm run infra:plan` | Terraform plan (preview changes) |
| `npm run infra:sync` | Generate .dev.vars + update wrangler.toml from Terraform |
| `npm run secrets:push` | Push all secrets to Cloudflare Workers |
| `npm run typecheck` | Backend TypeScript check |
| `npm run analyze` | Dart static analysis |
| `npm run test` | Run all tests (API + Flutter) |
| `npm run db:migrate` | Apply D1 migrations locally |
| `npm run db:generate` | Generate migration from schema |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run setup` | First-time setup (install + bootstrap + codegen + sync) |
| `npm run clean` | Clean all build artifacts |

---

## Key File Locations

| What | Path |
|---|---|
| Backend entry point | `backend/src/index.ts` |
| Route mounts array | `backend/src/index.ts` → `routeMounts` |
| Env bindings type | `backend/src/types.ts` |
| Tenant DB schema | `backend/src/db/tenant-schema.ts` |
| Master DB schema | `backend/src/db/master-schema.ts` |
| Response helpers | `backend/src/utils/response.ts` |
| AI service | `backend/src/services/ai-router.ts` |
| All API endpoints | `packages/shared/lib/api_client/api_endpoints.dart` |
| Barrel export | `packages/shared/lib/shared.dart` |
| Flutter router | `packages/crm_app/lib/app/router.dart` |
| Sidebar menu | `packages/crm_app/lib/core/widgets/app_scaffold.dart` |
| App config | `packages/crm_app/lib/core/constants/app_config.dart` |
| Terraform variables | `terraform/variables.tf` |
| Terraform secrets template | `terraform/terraform.tfvars.example` |
| Feature dev guide | `CONTRIBUTING.md` |

---

## Cost Estimation & SaaS Pricing

### Platform Fixed Costs (Monthly)

These costs are incurred regardless of tenant count:

| Service | Plan | Monthly | Yearly | Notes |
|---------|------|---------|--------|-------|
| Cloudflare Workers Paid | Bundled | $5.00 | $60.00 | 10M requests/mo, D1, R2, KV, Queues included |
| SendGrid Essentials | 50K emails/mo | $19.95 | $239.40 | Shared across all tenants |
| Twilio Phone Number | 1 Indian number | $1.15 | $13.80 | Per number; add more as needed |
| Domain Name | .com | ~$0.83 | ~$10.00 | Annual registration |
| Oracle Cloud (WordPress) | Always Free | $0.00 | $0.00 | 4 OCPU ARM, 24GB RAM, 200GB storage |
| Cloudflare Pages | Free | $0.00 | $0.00 | Web + Admin hosting |
| Firebase FCM | Free | $0.00 | $0.00 | Push notifications |
| **Total Fixed** | | **~$27/mo** | **~$323/yr** | |

### Per-Tenant Variable Costs

Usage-based costs scale with tenant activity. Estimates assume a typical small travel agency (5 users, 200 leads/mo, moderate activity).

#### Non-AI Tenant (Standard Plan)

| Service | Usage/Month | Unit Cost | Monthly Cost |
|---------|-------------|-----------|-------------|
| D1 Database | ~500K reads, ~50K writes | Included in Workers Paid¹ | $0.00 |
| R2 Storage | ~1GB (documents, invoices) | 10GB free tier | $0.00 |
| KV Reads | ~10K | 100K/day free | $0.00 |
| SMS (Twilio) | ~100 messages | ₹6.90/msg ($0.0832) | $8.32 |
| WhatsApp (Twilio) | ~200 messages | $0.005 + ₹0.89 template | $3.14 |
| Email (SendGrid) | ~500 emails | Shared pool | $0.00² |
| **Per-Tenant Total** | | | **~$11.50/mo** |

#### AI-Enabled Tenant (Pro Plan)

All Standard costs plus:

| Service | Usage/Month | Unit Cost | Monthly Cost |
|---------|-------------|-----------|-------------|
| Standard plan costs | — | — | $11.50 |
| Claude Haiku 4.5 | ~2M input + 500K output tokens | $1/MTok in, $5/MTok out | $4.50 |
| Claude Sonnet (complex tasks) | ~200K input + 50K output tokens | $3/MTok in, $15/MTok out | $1.35 |
| Deepgram Transcription | ~60 min calls | $0.0058/min | $0.35 |
| VoIP Calls (Twilio) | ~120 min outbound | $0.044/min (India local) | $5.28 |
| Vectorize Queries | ~5K queries | $0.01/1K | $0.05 |
| **Per-Tenant Total** | | | **~$23/mo** |

> ¹ Cloudflare Workers Paid plan includes generous D1/R2/KV free tiers shared across all tenants. Costs only apply when aggregate usage exceeds free tier.
>
> ² SendGrid Essentials 50K/mo is shared. At 50+ tenants sending 500 emails each, you'd hit the limit and need to upgrade ($34.95/mo for 100K).

### Cost at Scale (Yearly)

| Tenants | Fixed/yr | Non-AI Tenants | AI Tenants | Total/yr | Cost per Tenant/yr |
|---------|----------|----------------|------------|----------|-------------------|
| **10** (8 std + 2 AI) | $323 | $1,104 | $552 | **$1,979** | ~$198 |
| **25** (18 std + 7 AI) | $323 | $2,484 | $1,932 | **$4,739** | ~$190 |
| **50** (35 std + 15 AI) | $563¹ | $4,830 | $4,140 | **$9,533** | ~$191 |
| **100** (70 std + 30 AI) | $803² | $9,660 | $8,280 | **$18,743** | ~$187 |
| **250** (175 std + 75 AI) | $1,283³ | $24,150 | $20,700 | **$46,133** | ~$185 |

> ¹ At 50 tenants: SendGrid upgrade to 100K emails ($34.95/mo), +1 Twilio number
> ² At 100 tenants: SendGrid 100K, +2 Twilio numbers, D1 may exceed free reads
> ³ At 250 tenants: SendGrid Pro ($89.95/mo for 250K), +4 Twilio numbers, D1 paid tier kicks in

### Recommended SaaS Pricing (INR)

Based on the cost analysis above, here are the recommended tiers:

| | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|
| **Price** | ₹12,000/yr (₹1,000/mo) | ₹18,000/yr (₹1,500/mo) | ₹30,000/yr (₹2,500/mo) |
| **Users** | Up to 3 | Up to 10 | Unlimited |
| **AI Features** | Limited (5 AI actions/day) | Full AI suite | Full AI + priority |
| **VoIP Calling** | — | 120 min/mo included | 300 min/mo included |
| **WhatsApp Messages** | 100/mo | 500/mo | 2,000/mo |
| **SMS Messages** | 50/mo | 200/mo | 500/mo |
| **Email** | 200/mo | 1,000/mo | 5,000/mo |
| **Storage** | 1 GB | 5 GB | 25 GB |
| **WordPress Site** | — | Included | Included + custom domain |
| **AI Chatbot** | — | Website only | Website + WhatsApp |
| **Support** | Email | Email + Chat | Priority + Phone |

### Margin Analysis

| Plan | Revenue/yr | Cost/yr | Gross Margin | Margin % |
|------|-----------|---------|-------------|----------|
| **Starter** (₹12K) | ~$143 | ~$138 (non-AI) | ~$5 | ~3.5% |
| **Professional** (₹18K) | ~$215 | ~$276 (AI) | -$61 | -28% ⚠️ |
| **Enterprise** (₹30K) | ~$358 | ~$350 (heavy AI) | ~$8 | ~2.2% |

> **⚠️ Pricing concern:** At ₹18K/yr for the AI plan, you're likely **losing money** per tenant due to Twilio VoIP + Claude API costs. Consider these adjustments:

### Pricing Recommendations

1. **Starter at ₹12K/yr is viable** — but only with message caps. Your cost is ~$11.50/mo (~₹960/mo), leaving thin margins. This works as a volume play at 50+ tenants.

2. **AI plan should be ₹24K–30K/yr** (₹2,000–2,500/mo) — The AI + VoIP costs alone are ~$23/mo (~₹1,920/mo), which exceeds ₹1,500/mo. Either:
   - Raise the AI plan price to ₹24K/yr minimum
   - Add VoIP minutes as a paid add-on (₹500/mo for 120 min)
   - Set strict AI usage caps (50 AI actions/day) and charge overages

3. **Metering is critical** — Track per-tenant usage of Claude tokens, Deepgram minutes, and Twilio calls. Bill overages or auto-upgrade plans.

4. **High-margin add-ons:**
   - Extra Twilio numbers: ₹200/mo each
   - WhatsApp message packs: ₹500 for 500 messages
   - VoIP minute packs: ₹500 for 120 minutes
   - Extra storage: ₹100/GB/mo
   - Custom WordPress themes: ₹5,000 one-time

5. **Break-even targets:**
   - **10 tenants:** ~₹1.65L revenue/yr, ~₹1.65L cost — break-even
   - **50 tenants:** ~₹8.5L revenue/yr, ~₹8L cost — ~6% margin
   - **100+ tenants:** Economies of scale kick in, 15-25% margins achievable

### Cost Optimization Tips

- **Prompt caching** — Reuse system prompts via Anthropic prompt caching (90% discount on cached tokens)
- **KV response cache** — Cache AI responses for identical queries (30-min TTL)
- **Deepgram batch mode** — Use pre-recorded API (cheaper than real-time streaming) for non-urgent transcriptions
- **SendGrid batching** — Batch emails to stay within plan limits
- **Twilio SIP trunking** — At 50+ tenants, SIP trunking is cheaper than per-call pricing
- **OCI Always Free** — WordPress hosting is essentially free on Oracle Cloud ARM tier

---

## License

Private. All rights reserved.
