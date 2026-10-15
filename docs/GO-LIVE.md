# Go-live runbook

Written 2026-10-15 for the owner and updated the same day to match the code after batch R125 (terraform, domain placeholder, safe scripts, installer update feed, weekly backup, agency web app) and batches R201, R202, R301 and R302. Nothing has ever been deployed: every command below is written from the code and has **not** been run against a real account. Expect to hit small surprises; each phase says how to tell, and what to do. The faults the first version worked around were fixed by R125; what is still open is in [INFRA.md](INFRA.md) section 11.

Read these first, in this order: this file, then [KEYS-AND-ACCOUNTS.md](KEYS-AND-ACCOUNTS.md) (what to sign up for and where each key goes), then [INFRA.md](INFRA.md) (how the pieces fit).

## How to use this file

* Do the phases in order. Tick the boxes. Stop at any "STOP" line.
* Commands are for **Git Bash** on Windows, run from the repository root `C:/Users/Admin/Downloads/pro/CRM` unless a line starts with `cd`. Flutter commands (phase 8) are the exception: they must go through the x86 PowerShell.
* `<domain>` means your real domain, for example `example.com`. Until you choose one, every tool uses the placeholder `YOUR-DOMAIN.example` (phase 0.8 lists every place it is set). To avoid typing it everywhere, at the start of each Git Bash session run:

```bash
export DOMAIN=example.com          # replace with your domain; the backend config generator and the installer build read it
export CLOUDFLARE_ACCOUNT_ID=...   # from the Cloudflare dashboard
export CLOUDFLARE_API_TOKEN=...    # the deploy token; typed into this window only, never saved to a file
export TF_VAR_domain=$DOMAIN       # terraform reads its domain from here (or from terraform.tfvars)
```

* Never paste a secret into a file inside the repository, a chat, or an email.
* Deploy the API only with `npm run deploy:api` (or `npm -w travelcrm-api run deploy:production`): it refuses to run unless the generated config is fresh. Never run `wrangler deploy` on `wrangler.toml` or `wrangler.base.toml`. Never run `npm install` or `npm ci` inside `backend/` or `super-admin/` (only at the repository root). The old root scripts `deploy` and `infra` are gone. `scripts/push-secrets.sh` (`npm run secrets:push`) and `scripts/sync-config.sh` (`npm run infra:sync`) are now safe: `sync-config.sh` only prints the `CF_*` ids, and `push-secrets.sh` pushes real secrets to the generated config (phase 3.7 explains it; start with `npm run secrets:push:dry`).
* Tools you need on the machine that does the deploys: Node 22 and npm, Git, Terraform 1.8 or newer (https://developer.hashicorp.com/terraform/install). Run `node -v` and `terraform version` to check. Run `npm ci` once at the repository root.

## Phase 0. Before anything: close the leak, rotate, decide

Why first: the GitHub repository `sn-arjun/travel-crm` is **public** (re-checked 2026-10-14) and its history held real values (`backend/.dev.vars` was committed in `c668ebd` and `6d75a0b`; the console defaults were in `super-admin/wrangler.toml`; a token was in an old remote URL). Nothing new has been pushed. Treat every value that was ever in that history as public.

- [ ] **0.1 Make the repository private.** GitHub, `sn-arjun/travel-crm`, Settings, General, Danger Zone, Change visibility, Private. How you know: open https://github.com/sn-arjun/travel-crm in a private browser window; it must say "Not Found".
- [ ] **0.2 Revoke the old token.** https://github.com/settings/tokens and https://github.com/settings/apps (authorized apps): delete every token you do not recognise or that was ever pasted in a remote URL. Then on your PC: `git remote -v`; if a URL contains a token, run `git remote set-url sn-arjun https://github.com/sn-arjun/travel-crm.git` and let the Git credential manager ask for a new token.
- [ ] **0.3 Check copies.** Repository, Insights, Forks: any fork of the public repository stays public and keeps the old history. If there are forks, ask the owners to delete them. Other people may have cloned it; that is why 0.4 is not optional.
- [ ] **0.4 Rotate everything.** Production gets brand-new values for every secret (KEYS-AND-ACCOUNTS section 3.2 has the generation commands). Specifically do not reuse: anything from `backend/.dev.vars` history, the default super admin password `SuperAdmin@123` and the demo operator in `backend/scripts/seed-demo.mjs`, the credentials in `super-admin/wrangler.toml` history, any API key (SendGrid, Twilio, Anthropic, Deepgram, Google) that was ever in a committed file: revoke it in that provider's console now.
- [ ] **0.5 History on the remote.** `docs/launch/STATE.json` says history was stripped locally with `git filter-branch` and a full backup bundle exists in `CRM-backups/2026-10-09/`. The remote still holds the old history until you replace it. Decide with engineering whether to force-push the stripped branches (only after 0.1), knowing that GitHub may keep the old commits reachable by their hashes for a while; this is another reason to rotate. Do not push anything before 0.1 is done.
- [ ] **0.6 Merge to `master`.** The workflows listen to the branch `master` and show up in the Actions tab only once they are on it. After 0.1 and 0.5, merge `launch-readiness` into `master` through a pull request.
- [ ] **0.7 Decide the open items.** Each row says where the answer is recorded. None blocks starting phase 1, but the ones marked "before phase N" block that phase.

| Open item (source) | Your decision | Where it is set | Needed before |
|---|---|---|---|
| Which legal entity holds provider, payment and app-store accounts and invoices customers (Q10) | | Every account in phase 1 | Phase 1 |
| Domain name (Q11): every tool now uses the one placeholder `YOUR-DOMAIN.example`; you choose the real name once and set it in the places listed in 0.8 | | See 0.8 | Phase 1 |
| Where the web pages in emails live (INFRA.md 11.15): **resolved by R125**: the agency web app (`app.<domain>`, phase 4A) hosts password reset, invitation, shared quotation `/q/...`, `/download` and `/quick-start`. `APP_URL` is `https://app.<domain>` | Nothing to decide; do phase 4A | `APP_URL` (derived) | Before any real agency uses invites or reset |
| VoIP (owner decision 2026-10-15): **Twilio only**; no calling for agencies in India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh; Exotel dropped. Other section 9a items of ADR-001 (prepaid balance, recording default, call AI default, trials without calling) still open | Confirm the section 9a items | `docs/decisions/ADR-001-voip.md`; `VOIP_CALLING_COUNTRIES` (phase 9.6) | Not needed to launch (calling is not marketed at launch) |
| Plan prices and limits (Q2, Q2b, Q3; STATE `ownerToConfirm.fromR109`): extra user per year (Basic 2,400, Pro 1,800, Enterprise 1,200 rupees), AI credits per month (trial 2,000, Basic 1,000, Pro 15,000, Enterprise 25,000), monthly caps for SMS, WhatsApp, login codes and email, pack prices (100 SMS 967.20; 1,000 WhatsApp 714.00; 100 login codes 1,548.00; 5,000 AI credits 250 rupees), margin 20%, trial 14 days with 3 users and no calling, international prices (none seeded) | | Plan catalogue (master tables, console Catalogue pages); landing page wording | Phase 6 |
| Email unit cost and the `email_1000` pack; whether `call_minutes_100` stays inactive; login-code abuse limits (STATE `fromR110`) | | Plan catalogue | Phase 6 |
| Tax defaults (STATE `fromR201`): export and reverse-charge wording; VAT rates GB 20, AE 5, SA 15, DE 19; Gulf agencies below the threshold use "none"?; GST 18% for itinerary invoices and 5% for trip invoices; US single sales-tax rate; mandatory invoice fields per country | Ask your accountant | Tax settings and invoice templates | Before the first foreign agency; India defaults before the pilot |
| Signup style (Q4): request and operator approval (planned) or instant trial | | Landing form behaviour, console | Phase 5 |
| Staff login: password by default, login codes optional (Q5) at 12.90 rupees per code | | Plan catalogue / defaults | Phase 6 |
| Data regions offered at launch (Q7) | | The region choices in the new-agency wizard | Phase 6 |
| Announcements and support tickets hidden for v1 (Q8, planned) | | Already hidden | none |
| WordPress approach (Q9) and the Oracle machine size | | Tier 3 | Not needed to launch |
| Markets: India first; abroad needs Tier 2 (Stripe, GDPR tooling, language work), which is not built | | n/a | Go live in India only |
| Landing claims (Q12): unverified numbers removed by batch R116 | Confirm | `landing/index.html` | Phase 5 |
| Legal pages (privacy, terms, DPA, sub-processors) are drafts | Lawyer review | `landing/legal/` | Before public launch |
| Whether staging is a second Cloudflare account (recommended; INFRA.md section 7) | | Phase 6 | Phase 6 |

- [ ] **0.8 Know where the domain is set.** Once you have chosen the domain, it is typed into **each** of these places (each toolchain has exactly one; everything else is derived from it). `git grep -n "YOUR-DOMAIN.example"` should afterwards find only these places, their comments, the `.tfvars.example` file and tests:

| Toolchain | The one place | How it is set |
|---|---|---|
| Terraform | variable `domain` (no default; it refuses the placeholder) | `terraform/terraform.tfvars`, or `TF_VAR_domain` in the shell |
| Landing page | `TRAVELCRM_DOMAIN` in `landing/config.js` | Edit the line; `landing/scripts/build.mjs` substitutes it into `index.html`, `sitemap.xml` and `robots.txt`. The environment variable `LANDING_DOMAIN` overrides it for one build |
| Operator console | `PLACEHOLDER_DOMAIN` in `super-admin/src/lib/domain.ts` | Edit the file, or set `NEXT_PUBLIC_PLATFORM_DOMAIN` when building (the GitHub deploy workflow does not set it, so edit the file if you deploy that way) |
| API Worker | environment variable `DOMAIN` when running `backend/scripts/gen-wrangler.mjs` | Derives `APP_URL` (`https://app.<domain>`), `API_URL` and `API_PUBLIC_URL` (`https://api.<domain>`), `EMAIL_FROM` (`noreply@<domain>`) and `CORS_ORIGINS` (app, root and `www`) |
| Agency web app | `PLATFORM_DOMAIN` in `desktop/wrangler.toml` | Edit the line and commit it; derives the API address and the downloads folder |
| Desktop installer | environment variable `DOMAIN` when running `build:desktop` | Derives the API address (`https://api.<domain>/api/v1`) and the update feed (`https://downloads.<domain>/win/`) baked into the installer |
| GitHub Actions | repository **variable** `TRAVELCRM_DOMAIN` (Settings, Secrets and variables, Actions, Variables) | Read by the backend deploy, backup and terraform workflows |

How you know phase 0 is done: the repository is private, old tokens are gone, a password-manager vault exists with empty slots for each secret, and the table above has an answer next to every "Before phase 1" and "Before phase 3" row.

If something fails: if you cannot make the repository private (for example an organisation policy), stop; do not push. If a provider key cannot be revoked, contact that provider's support.

## Phase 1. Accounts and domain

Start the slow ones first: certificate authorities, Meta business verification, Apple and Google identity checks can each take days to weeks. Details, prices and links are in KEYS-AND-ACCOUNTS section 3.

- [ ] **1.1 Company mailbox and password manager** with two-step sign-in. Open the vault for all keys.
- [ ] **1.2 Domain.** Register or confirm `<domain>`, then set it in the places listed in 0.8. If you register at Cloudflare Registrar, the DNS zone already exists (note this for phase 2.4). If elsewhere, keep it unchanged for now.
- [ ] **1.3 Cloudflare account**, Workers Paid plan ($5 a month), note the Account ID. Create the **deploy token** and, later, the runtime and backup tokens (KEYS-AND-ACCOUNTS 3.1). Test in Git Bash: `cd backend && npx wrangler whoami` (it must list your account).
- [ ] **1.4 SendGrid** account (domain authentication happens in phase 9).
- [ ] **1.5 Twilio** account (upgrade and add funds in phase 9).
- [ ] **1.6 Start the long lead items:** Windows code-signing certificate (phase 7), Google Play Console and Apple Developer (phase 8), Meta business verification (phase 9).
- [ ] **1.7 GitHub:** repository private (0.1), new token.
- [ ] **1.8 Error-reporting project and uptime monitor** accounts (phase 10).

How you know: every account in KEYS-AND-ACCOUNTS section 3 has an owner, a vault entry and a login you have tested. If a sign-up fails (as Plivo did), write down where it failed and tell engineering; do not work around provider checks.

## Phase 2. Cloudflare resources with terraform

Terraform builds the databases, buckets, all 14 queues and DNS. It needs only three values (`domain`, `cloudflare_account_id`, `cloudflare_api_token`). The Oracle Cloud VM (Tier 3) is a separate root, `terraform/oracle/`, with its own state; you do not touch it now. The one thing that needs care: the three Workers domains (`api.<domain>`, `admin.<domain>`, `app.<domain>`) can only be created after their Workers exist, so they are left out of this first apply and added in phases 3.9, 4.3 and 4A.

- [ ] **2.1 Create the state bucket by hand** (terraform keeps its notes there):

```bash
cd backend
npx wrangler r2 bucket create terraform-state
```

  Then in the Cloudflare dashboard: R2, Manage R2 API Tokens, create an Object Read and Write token for `terraform-state`; copy the Access Key ID and Secret.

- [ ] **2.2 Fill in `terraform/terraform.tfvars`:** `cp terraform/terraform.tfvars.example terraform/terraform.tfvars` and edit it (it is git-ignored). Set `domain`, `cloudflare_account_id`, `cloudflare_api_token` (or give the domain with `TF_VAR_domain`). Those three are the only required variables; the app-secret variables are optional and terraform uses none of them. **Delete the example lines for them** (`twilio_*`, `sendgrid_*`, `anthropic_api_key` and so on) from your copy, or leave them blank: the example file holds fake values such as `your-twilio-auth-token`, and `scripts/push-secrets.sh` reads this file in phase 3.7 and would push them. `domain` refuses the placeholder `YOUR-DOMAIN.example`. The files in `environments/` no longer carry a domain or any example value (only `project_name` and `environment`), so passing one with `-var-file` is harmless but unnecessary.
- [ ] **2.3 Oracle: nothing to do.** The main apply no longer needs any `oci_*` value and creates no VM. The wildcard DNS record `*` is created only once `oci_instance_ip` is set (Tier 3, after `terraform/oracle` has been applied). Check: `terraform plan` in 2.5 mentions no `oci` resource.
- [ ] **2.4 Initialise.** In Git Bash:

```bash
cd terraform
export AWS_ACCESS_KEY_ID=...        # the R2 token from 2.1
export AWS_SECRET_ACCESS_KEY=...
terraform init -backend-config="endpoints={s3=\"https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com\"}"
```

  If the domain's zone already exists in your Cloudflare account (you registered it there, or added it earlier), tell terraform instead of letting it try to create it again. Find the Zone ID in the dashboard (domain overview, right column), then:

```bash
terraform import module.cloudflare.cloudflare_zone.main <ZONE_ID>
```

- [ ] **2.5 Plan, read, apply (first part).** The three Workers domains (`api.<domain>`, `admin.<domain>`, `app.<domain>`) cannot be created until the Workers `travelcrm-api`, `travelcrm-super-admin` and `travelcrm-app` exist, so the first apply leaves them out with `-target`. (A plain `terraform plan` is fine to read: it lists those three as creations; a plain `apply` would fail on them.)

```bash
terraform plan  -target=module.cloudflare.cloudflare_zone.main \
  -target=module.cloudflare.cloudflare_d1_database.master \
  -target=module.cloudflare.cloudflare_r2_bucket.files \
  -target=module.cloudflare.cloudflare_r2_bucket.backups \
  -target=module.cloudflare.cloudflare_r2_bucket.desktop_updates \
  -target=module.cloudflare.cloudflare_workers_kv_namespace.cache \
  -target=module.cloudflare.cloudflare_workers_kv_namespace.sessions \
  -target=module.cloudflare.cloudflare_workers_kv_namespace.report_cache \
  -target=module.cloudflare.cloudflare_queue.email \
  -target=module.cloudflare.cloudflare_queue.sms \
  -target=module.cloudflare.cloudflare_queue.push \
  -target=module.cloudflare.cloudflare_queue.wp_provision \
  -target=module.cloudflare.cloudflare_queue.import \
  -target=module.cloudflare.cloudflare_queue.import_dlq \
  -target=module.cloudflare.cloudflare_queue.export \
  -target=module.cloudflare.cloudflare_queue.export_dlq \
  -target=module.cloudflare.cloudflare_queue.campaign \
  -target=module.cloudflare.cloudflare_queue.campaign_dlq \
  -target=module.cloudflare.cloudflare_queue.ai_extraction \
  -target=module.cloudflare.cloudflare_queue.ai_extraction_dlq \
  -target=module.cloudflare.cloudflare_queue.tenant_jobs \
  -target=module.cloudflare.cloudflare_queue.tenant_jobs_dlq \
  -target=module.cloudflare.cloudflare_pages_project.landing \
  -target=module.cloudflare.cloudflare_pages_domain.landing_root \
  -target=module.cloudflare.cloudflare_pages_domain.landing_www \
  -target=module.cloudflare.cloudflare_record.root \
  -target=module.cloudflare.cloudflare_record.www
```

  Read the plan: it should only list creations (about 27). Nothing to destroy, nothing with your domain replaced. Then run the same command with `apply` instead of `plan` and type `yes`. Terraform warns that targeted applies are exceptional; that is expected here. Do not use the **Terraform Infrastructure** workflow for this first apply: its apply step is not targeted, so it would fail on the three Workers domains (and its `terraform init` passes no `-backend-config`, so the state bucket address would be missing). (The wildcard record `*` is not created until `oci_instance_ip` is set in Tier 3.)

- [ ] **2.6 Check the queues.** All 14 are created by terraform, including `travelcrm-ai-extraction-queue`, `travelcrm-ai-extraction-dlq`, `travelcrm-tenant-jobs` and `travelcrm-tenant-jobs-dlq`; nothing is created by hand any more. Check: `cd ../backend && npx wrangler queues list` shows 14 names starting `travelcrm-`.
- [ ] **2.7 Point the domain at Cloudflare** (only if the domain is registered elsewhere): the dashboard shows two nameservers for the zone; enter them at the registrar. The zone turns "Active" within minutes to hours.
- [ ] **2.8 Record the ids** (not secrets, but you need them in phase 3 and in GitHub):

```bash
cd ../terraform
# or print them all as export lines: cd .. && bash scripts/sync-config.sh   (read-only; writes nothing)
terraform output -raw d1_master_database_id; echo
terraform output -raw kv_cache_id; echo
terraform output -raw kv_sessions_id; echo
terraform output -raw kv_report_cache_id; echo
```

- [ ] **2.9 Manual items terraform does not do:** R2 lifecycle rule on `travelcrm-backups` (phase 10); public address `downloads.<domain>` on `travelcrm-desktop-updates` (phase 7); Cloudflare WAF rate-limit rules (phase 10); Turnstile widget (phase 5).

How you know it worked: in the Cloudflare dashboard you see D1 `travelcrm-master`, three KV namespaces, R2 buckets `travelcrm-files`, `travelcrm-backups`, `travelcrm-desktop-updates`, `terraform-state`, 14 queues starting `travelcrm-`, a Pages project `travelcrm-landing`, and the zone is Active. `terraform plan` (same targets) says "No changes".

If it fails: "zone already exists" means do the import in 2.4. A permission error names the missing token permission: add it to the token and retry. "domain is still the YOUR-DOMAIN.example placeholder" means `domain` was not set (2.2). A queue "already exists" error means someone created it by hand earlier: import it (`terraform import`) or delete the empty queue and re-apply. If terraform loses its state, do not re-apply blindly: stop and ask engineering to import the resources.

## Phase 3. Secrets, generated config, migrations, first API deploy, health check

Work in `backend/`. The environment variables from the top of this file must be set. From now on every wrangler command that talks about the production Worker uses `-c .wrangler.production.toml --env production`.

- [ ] **3.1 Generate the secrets** with the commands in KEYS-AND-ACCOUNTS 3.2 and store each in the vault: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_JWT_SECRET` (different from `JWT_SECRET`), `CREDENTIALS_KEYS`, `HEALTH_TOKEN`, `INBOUND_EMAIL_SECRET`.
- [ ] **3.2 Create the runtime token** `CF_API_TOKEN` (D1 Edit, Workers Scripts Edit; KEYS-AND-ACCOUNTS 3.1).
- [ ] **3.3 `APP_URL`.** It is the address of the web copy of the app that emails link to: `https://app.<domain>`, derived from `DOMAIN` by the generator (3.4). The site itself is deployed in phase 4A; until then reset, invite and shared-quote links dead-end, so `STOP` before inviting any real user until phase 4A is done.
- [ ] **3.4 Generate the production config.** `DOMAIN` (top of this file) is the only address input; the generator derives `APP_URL` (`https://app.<domain>`), `API_URL` and `API_PUBLIC_URL` (`https://api.<domain>`), `EMAIL_FROM` (`noreply@<domain>`) and `CORS_ORIGINS` (the app, root and `www` addresses). The master database has no tables yet, so this first run gives it an empty registry file (`--from-d1-remote` needs the master migrations first and is used in 3.6):

```bash
cd backend
echo '[]' > "$TEMP/registry-empty.json"
export CF_D1_MASTER_ID=$(cd ../terraform && terraform output -raw d1_master_database_id)
export CF_KV_CACHE_ID=$(cd ../terraform && terraform output -raw kv_cache_id)
export CF_KV_SESSIONS_ID=$(cd ../terraform && terraform output -raw kv_sessions_id)
export CF_KV_REPORT_CACHE_ID=$(cd ../terraform && terraform output -raw kv_report_cache_id)
# Optional plain settings, written to [vars] (never secrets): EMAIL_FROM_NAME, PLATFORM_SUPPORT_EMAIL, QUOTES_URL.
# Set them before generating if you want them, e.g.:
export EMAIL_FROM_NAME="Your Company" PLATFORM_SUPPORT_EMAIL=support@$DOMAIN
node scripts/gen-wrangler.mjs --env production --registry "$TEMP/registry-empty.json"
node scripts/predeploy-guard.mjs production
```

  The generator also writes, with no input from you: `API_PUBLIC_URL`, `ALLOW_LOOPBACK_ORIGINS` (`true`; override with the variable of the same name), `CREDENTIALS_ACTIVE_KEY_ID` (`k1`; same), `TENANT_PROVISIONER` (`cloudflare`) and `CF_WORKER_SCRIPT_NAME` (`travelcrm-api`). Set `APP_URL`, `API_URL`, `CORS_ORIGINS` or `EMAIL_FROM` yourself only to override a derived value.
  How you know: the first command prints `wrote ...\.wrangler.production.toml (production, 0 agencies, TENANCY_MODE=multi)` and the guard prints `is fresh and has no placeholder ids`. Do not edit the generated file; to change something, change the input and generate again. (The file is git-ignored.)

- [ ] **3.5 Migrate the master database** (no agency databases exist yet):

```bash
node scripts/migrate-tenants.mjs --remote --env production --dry-run
node scripts/migrate-tenants.mjs --remote --env production
```

  How you know: output ends with the master listed as done, with a warning "no agency databases found", which is right for now. Verify: `npx wrangler d1 execute travelcrm-master --remote -c .wrangler.production.toml --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 3"` shows `0019_exchange_rates.sql` first.

- [ ] **3.6 First deploy of the API**, now that the master database has its tables. Regenerate the config from the master database (this proves the `--from-d1-remote` path that every later run, and the backup workflow, uses; it writes the file with an empty registry first, then asks the master database for the agencies, of which there are none yet) and deploy, from the repository root:

```bash
cd backend && node scripts/gen-wrangler.mjs --env production --from-d1-remote && cd ..
npm -w @travelcrm/shared run build
npm -w travelcrm-api run typecheck
npm run deploy:api
```

  It prints "the agency registry is empty (first deploy)". `npm run deploy:api` is `npm -w travelcrm-api run deploy:production`: it runs the predeploy guard, then `wrangler deploy -c .wrangler.production.toml --env production`. Note the `*.workers.dev` address it prints.

- [ ] **3.7 Set the secrets** on the new Worker (it must be deployed once, 3.6). Only real secrets go this way. The plain settings (`API_PUBLIC_URL`, `ALLOW_LOOPBACK_ORIGINS`, `CREDENTIALS_ACTIVE_KEY_ID`, `TENANT_PROVISIONER`, `CF_WORKER_SCRIPT_NAME`, optional `EMAIL_FROM_NAME`, `PLATFORM_SUPPORT_EMAIL`, `QUOTES_URL`, and `APP_URL`, `API_URL`, `CORS_ORIGINS`, `EMAIL_FROM`) are already in the generated config: do **not** `secret put` them. Also never set `TEST_MODE`, `TENANCY_MODE` or `ENVIRONMENT`. Choose one way.
  *Way A, the script (several at once).* `scripts/push-secrets.sh` writes to the generated `backend/.wrangler.production.toml` with `-c ... --env production`, takes each value from the shell variable named like the secret (`JWT_SECRET`, `SENDGRID_API_KEY`, ...) and, if that is empty, from `terraform/terraform.tfvars` (key in lower case, for example `sendgrid_api_key`), and skips empty values. First look at what it would do; the dry run prints the config path and the secret **names** only, never a value, and calls nothing:

```bash
npm run secrets:push:dry         # same as: bash scripts/push-secrets.sh --dry-run   (add --env staging for staging)
```

  Check the list: every secret you have a value for says "would push", the rest say "skip". Two traps: (1) a value left in `terraform.tfvars` from the example file would be pushed, so remove them (2.2); (2) `CF_API_TOKEN` falls back to the file's `cloudflare_api_token`, which is your deploy token, so export the narrower **runtime** token from 3.2 as `CF_API_TOKEN` (and `CF_ACCOUNT_ID`) in this window first. Typing secrets into the shell leaves them in its history; clear it afterwards, or use Way B. Then `npm run secrets:push` for real (it prints pushed/skipped/failed counts).
  *Way B, one at a time (value is typed hidden and not stored):*

```bash
cd backend
CFG="-c .wrangler.production.toml --env production"
for n in JWT_SECRET JWT_REFRESH_SECRET SUPER_ADMIN_JWT_SECRET CREDENTIALS_KEYS HEALTH_TOKEN \
         CF_ACCOUNT_ID CF_API_TOKEN SENDGRID_API_KEY; do echo "== $n"; npx wrangler secret put $n $CFG; done
```

  If the hidden prompt does not work in Git Bash, prefix with `winpty`, or write the values into a JSON file outside the repository, run `npx wrangler secret bulk "$TEMP/secrets.json" $CFG`, then delete the file.
  Later phases add `SENDGRID_WEBHOOK_PUBLIC_KEY`, `INBOUND_EMAIL_SECRET`, `TWILIO_*`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `GOOGLE_MAPS_API_KEY`, `TURNSTILE_SECRET`, `ERROR_REPORTER_DSN` (the script knows all of these). Leave unused ones (`PLIVO_*`, `FCM_SERVER_KEY`, `OTP_DELIVERY`) unset. `VOIP_CALLING_COUNTRIES` is the one setting that is neither generated nor in the script: see 9.6.
  Check: `cd backend && npx wrangler secret list -c .wrangler.production.toml --env production` shows the names (never the values).

- [ ] **3.8 Health check** (use the workers.dev address from 3.6):

```bash
curl -fsS https://travelcrm-api.<your-subdomain>.workers.dev/api/v1/health
curl -fsS -H "X-Health-Token: <HEALTH_TOKEN value>" https://travelcrm-api.<your-subdomain>.workers.dev/api/v1/health/deep
```

  How you know: the first returns `"status":"ok"` and `"database":"connected"`; the second returns `"status":"ok"` with `masterDb`, `kv` and `r2` all `"ok":true`.

- [ ] **3.9 Attach the real address** once the console Worker also exists (end of phase 4), or now for the API alone:

```bash
cd ../terraform
terraform apply -target=module.cloudflare.cloudflare_workers_domain.api
curl -fsS https://api.$DOMAIN/api/v1/health
```

How you know phase 3 worked: `https://api.<domain>/api/v1/health` answers `ok` over HTTPS, the deep check is `ok`, and the Cloudflare dashboard shows the Worker `travelcrm-api` with three cron triggers.

If it fails:
* `predeploy-guard` says placeholder ids remain: one of the `CF_*` variables was empty in that shell; set it and generate again.
* Deploy says a queue does not exist: the phase 2.5 apply did not include all 14 (2.6); the error names it; apply that queue's terraform resource.
* `gen-wrangler` says "needs CF_D1_MASTER_ID" or "the master database has no tenants table yet": set the id (3.4) or finish the master migrations (3.5), then run it again.
* Deploy complains about the Durable Object, ratelimit or `nodejs_compat`: send the full message to engineering; do not edit the generated file.
* Deep health shows `kv` or `r2` false: the namespace id or bucket name in the generated config is wrong; check `terraform output` against `.wrangler.production.toml`.
* A request returns 503 `MISCONFIGURED`: the Worker is refusing to run (`TEST_MODE` set, or single-database mode); remove the offending setting.
* "`CREDENTIALS_UNAVAILABLE`" later: `CREDENTIALS_KEYS` is missing or malformed.

## Phase 4. Super admin console and the first operator

- [ ] **4.1 Tell the console the domain.** There is no `BACKEND_API_URL` to edit any more: in production the console derives `https://api.<domain>/api/v1` from its domain (0.8) unless `BACKEND_API_URL` is set in `super-admin/wrangler.toml` (set it only to point at a different API, for example staging). Give it the domain by changing `PLACEHOLDER_DOMAIN` in `super-admin/src/lib/domain.ts` (commit it), or by exporting `NEXT_PUBLIC_PLATFORM_DOMAIN=$DOMAIN` before the deploy in 4.2.
- [ ] **4.2 Deploy the console:**

```bash
export NEXT_PUBLIC_PLATFORM_DOMAIN=$DOMAIN      # not needed if you edited domain.ts
npm -w @travelcrm/shared run build
npm -w super-admin run deploy
cd super-admin
npx wrangler secret put SUPER_ADMIN_JWT_SECRET      # the SAME value as the API's
```

  (If the Worker did not exist when you set the secret, wrangler offers to create it; answer yes. Run the deploy again if the console shows a configuration error.)
- [ ] **4.3 Attach `admin.<domain>`:** `cd ../terraform && terraform apply -target=module.cloudflare.cloudflare_workers_domain.admin`. Optional afterwards: `terraform plan` with the 2.5 targets plus the `api` and `admin` domains should say "No changes". (`app.<domain>` follows in phase 4A.)
- [ ] **4.4 Create the first operator.** This is the only way to create one; there is no default login anywhere:

```bash
cd ../backend
node scripts/create-super-admin.mjs --remote --config .wrangler.production.toml --email you@company.com --name "Your Name"
```

  It asks for a password (12 or more characters, hidden) and stores only a hash. Keep it in the vault. For more operators add `--role support` or `--role viewer`.
- [ ] **4.5 Sign in** at `https://admin.<domain>`. How you know: the dashboard opens with zero agencies; Audit log shows your login.
- [ ] **4.6 Old operator rows.** On a fresh production database there should be only yours:

```bash
npx wrangler d1 execute travelcrm-master --remote -c .wrangler.production.toml --command "SELECT email, name, role, is_active, created_at FROM super_admins"
```

  If you see any other row (a demo or seed account), delete it: `--command "DELETE FROM super_admins WHERE email = '<that email>'"`. Do not run `backend/scripts/seed-demo.mjs` against production.
- [ ] **4.7 One-time maintenance after the first deploy.** Get an operator token and call both endpoints until `nextCursor` is null (with no agencies they finish at once):

```bash
read -s -p "Operator password: " PW; echo
curl -s -X POST https://api.$DOMAIN/api/v1/admin/auth/login -H "Content-Type: application/json" -d "{\"email\":\"you@company.com\",\"password\":\"$PW\"}"
# copy the value of data.token
TOKEN=<paste>
curl -s -X POST -H "Authorization: Bearer $TOKEN" https://api.$DOMAIN/api/v1/admin/maintenance/hash-api-keys
curl -s -X POST -H "Authorization: Bearer $TOKEN" "https://api.$DOMAIN/api/v1/admin/maintenance/reencrypt"
```

  Run the same two calls again after any later change to `CREDENTIALS_KEYS`.

How you know: you can sign in at `https://admin.<domain>`; wrong passwords are refused; the System health page loads.

If it fails: a login page that cannot reach the API means the console was built with the placeholder domain (4.1) or a wrong `BACKEND_API_URL`; redeploy; "Super admin login is not configured" (503) means `SUPER_ADMIN_JWT_SECRET` is missing on the API; a console that loops back to login means the console's secret differs from the API's. `create-super-admin` failing with "wrong --config" means the generated file is missing: redo 3.4.

## Phase 4A. Agency web app (`app.<domain>`)

The same Next.js app as the desktop installer, built as a website with OpenNext and run as the Worker `travelcrm-app`. It hosts every page the emails link to: `/reset-password`, `/setup-account`, the shared quotation `/q/<token>` (no login), `/download` and `/quick-start`, and it is where the console's "log in as" button lands. It has no database or secret of its own; all data comes from the API. (Numbered 4A so the phase numbers other documents quote stay valid.)

- [ ] **4A.1 Set the domain.** In `desktop/wrangler.toml` change `PLATFORM_DOMAIN = "YOUR-DOMAIN.example"` to your domain and commit it. It derives the API address (`https://api.<domain>/api/v1`) and the downloads folder (`https://downloads.<domain>/win/`). Optional, same file, as plain variables: `INSTALLER_URL` (the Windows button on `/download`; fill it after phase 7) and `DRIVER_APP_URL` (the driver app button; fill it after phase 8). Leave `TRAVELCRM_API_URL` commented unless the web app must call a different API (for example staging).
- [ ] **4A.2 Build and look at it locally (optional):** `npm -w travelcrm-desktop run build:web` writes `desktop/.open-next/worker.js`; `npm -w travelcrm-desktop run preview:web` serves it on your PC with wrangler. The web build writes into the same `.next` folder as the installer build, so run `build:desktop` again afterwards before making an installer.
- [ ] **4A.3 Deploy:**

```bash
npm -w @travelcrm/shared run build
npm run deploy:web              # = npm -w travelcrm-desktop run deploy:web: builds, then deploys the Worker travelcrm-app
```

  Or run the **Deploy Agency Web App** workflow from the Actions tab (`deploy-web.yml`; manual only; needs the two Cloudflare secrets). Note the `*.workers.dev` address it prints and open it: the sign-in page loads.
- [ ] **4A.4 Attach `app.<domain>`** (only possible now that the Worker exists):

```bash
cd terraform
terraform apply -target=module.cloudflare.cloudflare_workers_domain.app
```

- [ ] **4A.5 Check the pages**, all over HTTPS, in a private browser window (nothing signed in):
  * `https://app.<domain>` shows the sign-in page.
  * `https://app.<domain>/download` and `https://app.<domain>/quick-start` load (the download page shows the installer button only if `INSTALLER_URL` is set).
  * `https://app.<domain>/q/not-a-real-token` shows a "not found" or "expired" message, not a sign-in page or a blank screen: shared quotations open without login.
  * `https://app.<domain>/reset-password` and `/setup-account` open (they ask for a link token).
  * The page never says the domain is still a placeholder. If it does, 4A.1 was missed.
- [ ] **4A.6 Check the links in real emails** once an agency exists (phase 6.6 to 6.9; repeat on production with the pilot): the invitation mail's link opens `app.<domain>/setup-account?token=...`; "forgot password" sends a mail whose link opens `/reset-password?token=...` and lets you set a new password; a quotation shared from the desktop app opens at `https://app.<domain>/q/<token>` in a browser with no login; the welcome mail's `/download` and `/quick-start` links work. In the console, "log in as" on an agency opens `https://app.<domain>/support-session...` (or the address in `NEXT_PUBLIC_DESKTOP_URL` if you set it when building the console).

How you know: `https://app.<domain>` answers over HTTPS, the pages above load, and `APP_URL` (from 3.4) is `https://app.<domain>`.

If it fails: a Cloudflare error that the Worker `travelcrm-app` does not exist when attaching the domain means 4A.3 did not finish; deploy first. A web page that loads but cannot sign in usually means the browser blocks calls to the API: `CORS_ORIGINS` must contain `https://app.<domain>` (it does with the 3.4 defaults; if you overrode it, add it, regenerate and redeploy the API). `/q/...` showing "error" for a real token means the API address in the web app is wrong (4A.1). Reset and invite links that point at another address mean `APP_URL` was overridden in 3.4.

## Phase 5. Landing page

- [ ] **5.1 Fill `landing/config.js`:** `TRAVELCRM_DOMAIN` (5.2; `apiBase`, `siteUrl` and `contactEmail` follow from it and need no change unless they differ),  `whatsappNumber` (digits, international format; empty hides the button), `demoVideoUrl`, `appDownloadUrl` (empty until the installer has a public link), `turnstileSiteKey` (public key; the secret is `TURNSTILE_SECRET` on the API), `city`, `legalEntity`, `senderEmail`. The file is public: no secrets.
- [ ] **5.2 Set the domain once.** In `landing/config.js` change the line `var TRAVELCRM_DOMAIN = 'YOUR-DOMAIN.example';` to your domain. `apiBase` (`https://api.<domain>`), `siteUrl` and `contactEmail` in that file are derived from it, and `node landing/scripts/build.mjs` replaces the token `YOUR-DOMAIN.example` in `index.html`, `sitemap.xml` and `robots.txt` (the environment variable `LANDING_DOMAIN` overrides the config for one build). No `sed` is needed. After the build in 5.4:

```bash
grep -rn "YOUR-DOMAIN.example" landing/dist    # must print nothing
```

  The build prints `landing build: domain <domain>`; a warning that the domain is still the placeholder means this step was missed. The legal pages carry no domain.

- [ ] **5.3 Allow the landing origin on the API.** `CORS_ORIGINS` must contain `https://<domain>` and `https://www.<domain>` (it does with the 3.4 defaults). If you overrode it, fix it, regenerate (3.4, or `--from-d1-remote` once agencies exist) and redeploy (3.6).

- [ ] **5.4 Check and build:**

```bash
node landing/scripts/check-links.mjs
node landing/scripts/build.mjs
```

- [ ] **5.5 Deploy:**

```bash
npx --yes wrangler@3 pages deploy landing/dist --project-name travelcrm-landing --branch master
```

  Or run the Landing workflow from the GitHub Actions tab with "deploy" ticked (needs the two Cloudflare secrets).
- [ ] **5.6 Form test.** Open `https://<domain>`, submit the enquiry form with a test name and your own email. How you know: the page shows its success message. Then read it back as the operator:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "https://api.$DOMAIN/api/v1/admin/enquiries?limit=5"
```

  (The console has no enquiries page; this API call or a database query is how you see them. Ask engineering for a console page if enquiries will be frequent.) Mark the test row as spam: `PATCH /api/v1/admin/enquiries/<id>` with `{"status":"spam"}`.
- [ ] **5.7 Turnstile** (optional): create the widget in Cloudflare for `<domain>`, put the site key in `config.js`, set `TURNSTILE_SECRET` (secret put), redeploy the landing page, and repeat the form test. When the secret is set, the widget is mandatory.
- [ ] **5.8 Legal pages** are drafts: do not announce publicly before a lawyer has reviewed `landing/legal/*`.

How you know: `https://<domain>` and `https://www.<domain>` load over HTTPS, every button goes somewhere, the form delivers an enquiry. If it fails: a form error in the browser console about CORS means phase 5.3; "not found" for `/api/v1/public/enquiries` means `apiBase` is wrong; a Pages domain stuck "pending" means DNS is not yet on Cloudflare (phase 2.7).

## Phase 6. Staging rehearsal (full agency handoff before production)

Run the whole handoff on staging first. **Staging is a separate Cloudflare account** (INFRA.md section 7: queue and bucket names are fixed in the config, so the same account would clash with production). Open a new Git Bash window for staging so production variables do not leak in: set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for the **staging** account, and do not set `DOMAIN` unless staging has its own.

- [ ] **6.1 Staging account** with Workers Paid and a deploy token.
- [ ] **6.2 Create the resources by hand** (terraform would also build a DNS zone and the Workers domains, which staging does not need):

```bash
cd backend
npx wrangler d1 create travelcrm-master                 # prints database_id -> CF_D1_MASTER_ID
npx wrangler kv namespace create travelcrm-cache        # prints id -> CF_KV_CACHE_ID
npx wrangler kv namespace create travelcrm-sessions     # -> CF_KV_SESSIONS_ID
npx wrangler kv namespace create travelcrm-report-cache # -> CF_KV_REPORT_CACHE_ID
npx wrangler r2 bucket create travelcrm-files
npx wrangler r2 bucket create travelcrm-backups
for q in email-queue sms-queue push-queue wp-provision-queue import-queue import-dlq export-queue export-dlq campaign-queue campaign-dlq ai-extraction-queue ai-extraction-dlq tenant-jobs tenant-jobs-dlq; do npx wrangler queues create travelcrm-$q; done
```

- [ ] **6.3 Generate, migrate, deploy staging.** Staging uses the free `workers.dev` address (the first deploy asks you to pick a subdomain):

```bash
export CF_D1_MASTER_ID=... CF_KV_CACHE_ID=... CF_KV_SESSIONS_ID=... CF_KV_REPORT_CACHE_ID=...   # from 6.2
export API_URL=https://travelcrm-api-staging.<staging-subdomain>.workers.dev
export APP_URL=<the staging web app address: deploy it as in phase 4A with the *.workers.dev address, or reuse https://app.$DOMAIN>  EMAIL_FROM=noreply@<staging sender domain>
export CORS_ORIGINS=$APP_URL      # must contain the web app's address
node scripts/gen-wrangler.mjs --env staging --registry "$TEMP/registry-empty.json"
node scripts/migrate-tenants.mjs --remote --env staging
cd .. && npm -w travelcrm-api run deploy:staging
```

  Then the secrets (`npm run secrets:push:dry -- --env staging`, then without `:dry`, or `secret put` with `CFG="-c .wrangler.staging.toml --env staging"`; see 3.7) with **fresh values** (never reuse production's): the same secret names as 3.7, with `CF_API_TOKEN` and `CF_ACCOUNT_ID` of the staging account. The generator has already put `CF_WORKER_SCRIPT_NAME=travelcrm-api-staging`, `TENANT_PROVISIONER=cloudflare` and `ALLOW_LOOPBACK_ORIGINS=true` in the config. Use a SendGrid key with a verified sender.
- [ ] **6.4 Console against staging, run on your PC** (no staging console deploy needed): in `super-admin/` create `.env.local` with `BACKEND_API_URL=<staging API>/api/v1` and the staging `SUPER_ADMIN_JWT_SECRET`, then start it from the repository root with `npm run dev:admin`. Create the staging operator: `node backend/scripts/create-super-admin.mjs --remote --config .wrangler.staging.toml --email ... --name ...` (run inside `backend/`).
- [ ] **6.5 Build a staging installer** (phase 7 commands, unsigned, with `TRAVELCRM_API_URL` = the staging API) and install it on a clean Windows machine or virtual machine. (Alternatively install the production installer and set the staging address in the app's settings.)

Now walk the handoff. Write what you see next to each line; every "check" must pass, and any surprise goes to engineering.

- [ ] **6.6 Create an agency in the console** (company name, a real inbox you control as owner email, plan, region India). Check: the provisioning steps advance `creating_db`, `migrating`, `seeding` and end `active`. If it ends `pending_deploy`, the live binding step did not work on this account (the INFRA.md "verify" item): that is useful news, not a failure. Regenerate with the new agency in the registry and redeploy, then resend the welcome mail from the console:

```bash
cd backend
# reads the agency list from the staging master database (needs CF_D1_MASTER_ID of the staging account in this shell)
node scripts/gen-wrangler.mjs --env staging --from-d1-remote
cd .. && npm -w travelcrm-api run deploy:staging
```

  Record the answer: does a new agency become `active` without a redeploy? Record how long the redeploy takes.
- [ ] **6.7 Welcome email.** Check: it arrives in the inbox (not spam) within a minute; headers show `spf=pass` and `dkim=pass`; it contains the sign-in address and a temporary password; the `/download` and `/quick-start` links open on the web app (phase 4A.6).
- [ ] **6.8 Desktop first login.** Install, start, sign in with the temporary password. Check: the app forces a new password; the onboarding steps appear; company details saved during onboarding are visible afterwards on the settings page and on a new agency record in the console.
- [ ] **6.9 Invite users.** Invite two staff of different roles. Check: invitation mail arrives; the link opens a working set-up page on the web app (4A.6; if it dead-ends, `APP_URL` or the web app deploy is wrong); the plan's included-user count is enforced (the extra user is refused or priced). Also check the other two email links: use "forgot password" for one user and confirm the mail's link opens the reset page and the new password works; share a quotation from the desktop app and open `https://app.<domain>/q/<token>` (or the staging web address) in a private window without signing in.
- [ ] **6.10 Driver agency code.** Add a driver and a vehicle, install the driver app (phase 8, a throwaway build is fine on staging), enter the agency's slug as the agency code, sign in with the phone code. Check: the unknown code is refused; the right code reaches the sign-in; the driver sees only that agency's trips.
- [ ] **6.11 Isolation.** Create a second agency. Check: a user of agency A cannot see agency B's leads; a file link from A opened while signed in as B is refused (403); the console impersonation banner appears and an entry appears in the audit log.
- [ ] **6.12 Suspend and reactivate** the second agency in the console. Check: its users are blocked while suspended and work again afterwards.
- [ ] **6.13 Migration rollout.** Create three agencies, then run `node backend/scripts/migrate-tenants.mjs --remote --env staging --dry-run` and the real command from `backend/`. Check: master first, then one canary, then the rest. Optional: add a deliberately broken test migration locally and confirm the roll stops at the canary and prints which databases are done.
- [ ] **6.14 Real-account checks from INFRA.md section 10** that can run here: D1 create with region (India, plus EU if offered), many bindings, deploy time with 10 and 50 agencies, queue backlog and dead-letter queues empty, Time Travel (phase 10).
- [ ] **6.15 Plan caps.** Check that usage pages in the console show counts, and that an agency at its SMS or WhatsApp cap is stopped or offered a pack, not charged silently.

How you know: every line above is ticked with the result written beside it, no unexplained errors in `npx wrangler tail -c .wrangler.staging.toml --env staging`, the error-reporting inbox is quiet, and you can repeat 6.6 to 6.9 without help in under 15 minutes.

If it fails: provisioning `failed` shows the step and message in the console; fix the cause (token permission, missing queue) and press Retry. A login that says the workspace database is unavailable (503 `TENANT_DB_UNAVAILABLE`) means the binding is not on the Worker yet: redeploy from a config generated with the agency in it. Do not proceed to production while 6.6 to 6.11 have unexplained failures.

## Phase 7. Desktop installer (Windows first)

macOS and Linux installers need their own build machines (a Mac for macOS plus Apple signing and notarisation; the manual "package" run of `desktop-ci.yml` makes **unsigned** ones on GitHub's runners). Ship Windows first.

- [ ] **7.1 Code-signing certificate (OV or EV)** bought and installed (KEYS-AND-ACCOUNTS 3.6). Microsoft's hosted signing is not open to Indian organisations. Note whether the certificate's key lives on a hardware token: if so the build must run on the machine holding it.
- [ ] **7.2 Update feed address.** In the dashboard, R2, `travelcrm-desktop-updates`, Settings, Custom Domains, add `downloads.<domain>`. Check: `curl -I https://downloads.$DOMAIN/win/latest.yml` returns 404 now (and 200 after 7.5).
- [ ] **7.3 Set the version.** Edit `"version"` in `desktop/package.json` (the updater only offers a higher version than the one installed).
- [ ] **7.4 Build** (on the Windows machine that holds the certificate):

```bash
npm ci
npm -w @travelcrm/shared run build
# DOMAIN (set at the top of this file) is enough: the build derives the API address https://api.$DOMAIN/api/v1
# and the update feed https://downloads.$DOMAIN/win/ and bakes both into the installer. Override only if needed:
#   export TRAVELCRM_API_URL=...   export TRAVELCRM_UPDATE_URL=...
export NEXT_PUBLIC_API_URL=https://api.$DOMAIN/api/v1
export CSC_LINK="C:/secure/travelcrm-codesign.pfx"      # your certificate file
export CSC_KEY_PASSWORD='...'
export NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...               # optional
npm -w travelcrm-desktop run build:desktop
```

  The build prints `run-builder: update feed https://downloads.<domain>/win/` and `prepare-standalone: build-config.json apiUrl=... updateUrl=...`. If it prints "neither TRAVELCRM_UPDATE_URL nor DOMAIN is set; using a placeholder feed", `DOMAIN` was missing: this installer would never auto-update, so build again. Output in `desktop/release/`: `TravelCRM Pro Setup <version>.exe`, its `.blockmap` and `latest.yml`. Verify the signature in PowerShell: `Get-AuthenticodeSignature "desktop\release\TravelCRM Pro Setup <version>.exe" | Format-List Status, SignerCertificate`: `Status` must be `Valid`. If you skipped the certificate the build still succeeds but is unsigned (Windows shows "unknown publisher").
- [ ] **7.5 Publish** every file named in `latest.yml` (same names) to the feed folder:

```bash
cd backend
npx wrangler r2 object put "travelcrm-desktop-updates/win/TravelCRM Pro Setup <version>.exe" --file "../desktop/release/TravelCRM Pro Setup <version>.exe" --remote
npx wrangler r2 object put "travelcrm-desktop-updates/win/TravelCRM Pro Setup <version>.exe.blockmap" --file "../desktop/release/TravelCRM Pro Setup <version>.exe.blockmap" --remote
npx wrangler r2 object put travelcrm-desktop-updates/win/latest.yml --file ../desktop/release/latest.yml --remote
```

  Upload `latest.yml` **last**, so no one is offered a version whose installer is not there yet.
- [ ] **7.6 Install test on a clean Windows machine** (a spare PC or a virtual machine, not your build machine): download from `https://downloads.<domain>/win/`, install, start. Check: no scary warning beyond (for an OV certificate) a first-time reputation prompt; the app opens to the sign-in screen; the API address is production's; sign in works against a pilot or test agency; closing the app stops its local server (no leftover process in Task Manager).
- [ ] **7.7 Update test.** The update feed address is baked into the installer at build time (`electron/dist/build-config.json`, written from `TRAVELCRM_UPDATE_URL` or derived from `DOMAIN` in 7.4), so a customer's PC needs no setting. Install the version from 7.5 on a clean machine and start it; open `updater.log` (the app's `logs` folder under `%APPDATA%`): it must say `updater enabled (feed=build-config:https://downloads.<domain>/win/)`. `updater disabled (packaged=true, feed=unset)` means the installer was built without `DOMAIN` or `TRAVELCRM_UPDATE_URL`: rebuild. Then raise the version (7.3), build and publish it (7.4 and 7.5; `latest.yml` last), restart the installed app, and look for `update-available` in `updater.log`; the app offers the restart. Do not set `TRAVELCRM_UPDATE_URL` on the test machine: that would hide a problem with the baked address.
- [ ] **7.8 Link it:** put the public installer address in `landing/config.js` `appDownloadUrl` (phase 5) and in `INSTALLER_URL` in `desktop/wrangler.toml`, then redeploy the web app (4A.3) so `/download` shows the button.

How you know: a signed installer is on `downloads.<domain>`, installs on a clean machine, signs in to production, and the update test passes with the baked feed. If it fails: an unsigned warning means `CSC_LINK` or the password was wrong or missing at build time; an EV token on another machine means build there; a blank window on start means the packaged server could not start (look in `%APPDATA%` logs and send them to engineering).

## Phase 8. Driver app

- [ ] **8.1 Create the real upload keystore, owned by you, outside the repository:**

```bash
keytool -genkeypair -v -keystore C:/secure/travelcrm-driver-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

  Write both passwords in the vault and back the `.jks` file up in two places. Without it you cannot update the app.
- [ ] **8.2 Create `packages/driver_app/android/key.properties`** from `key.properties.example` (`storeFile`, `storePassword`, `keyAlias=upload`, `keyPassword`). It is git-ignored; it stays on the build machine only.
- [ ] **8.3 Build the release bundle** (Flutter only works from the x86 PowerShell):

```bash
"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd packages/shared; flutter pub get; dart run build_runner build --delete-conflicting-outputs; cd ../driver_app; flutter pub get; flutter build appbundle --release --dart-define=API_BASE_URL=https://api.<domain> --dart-define=ENVIRONMENT=production"
```

  Note the API address has no `/api/v1` for the driver app. How you know: the build log does **not** print "WARNING: android/key.properties not found - the release build is signed with the DEBUG key". Output: `packages/driver_app/build/app/outputs/bundle/release/app-release.aab`. Never upload a debug-signed or throwaway-key build to Google Play.
- [ ] **8.4 Play Console:** create the app with id `com.travelcrm.driver_app`; accept Play App Signing; Testing, Internal testing, create a release, upload the `.aab`, add testers by email, roll out. Fill the store listing and privacy policy before any wider track.
- [ ] **8.5 iOS (needs a Mac and an Apple Developer account):** open `packages/driver_app/ios` on the Mac, bundle id `com.travelcrm.driverApp`, sign with your team, `flutter build ipa` with the same `--dart-define` values, upload through Xcode or Transporter to TestFlight.
- [ ] **8.6 Agency code:** give each agency its slug (the console shows it as the subdomain) as its drivers' agency code.

How you know: a tester installs from the internal track, enters an agency code and phone, receives the login code, and sees trips. If it fails: "agency not found" means the slug is wrong; no code arrives means Twilio Verify is not set up (phase 9); a Play upload refused for the wrong key means the build was signed with the debug key.

## Phase 9. Providers

Production secrets are set with `npx wrangler secret put <NAME> -c .wrangler.production.toml --env production` from `backend/`.

- [ ] **9.1 SendGrid domain authentication.** SendGrid, Settings, Sender Authentication, Authenticate Your Domain: it shows CNAME records; add them in the Cloudflare dashboard DNS (DNS only, not proxied) and press Verify. Then create the API key (Mail Send) and set `SENDGRID_API_KEY`. Settings, Mail Settings, Event Webhook: URL `https://api.<domain>/api/v1/webhooks/sendgrid/events`, turn on "Signed Event Webhook Requests", copy the verification key into the secret `SENDGRID_WEBHOOK_PUBLIC_KEY`. Optional inbound mail: Inbound Parse to `https://api.<domain>/api/v1/webhooks/inbound/email/<INBOUND_EMAIL_SECRET>` (needs an MX record on a receiving subdomain). How you know: the welcome mail from phase 6 passes SPF and DKIM; webhook test events return 200.
- [ ] **9.2 Twilio.** Upgrade and add funds. Create the Verify service and a sending number; set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM_NUMBER`. `API_PUBLIC_URL` **must equal** the address Twilio calls (`https://api.<domain>`), or signature checks fail; the generator derives it from `DOMAIN` (3.4), so check it in `backend/.wrangler.production.toml`. In the Twilio console set these callbacks (all `POST`):
  * Message status: `https://api.<domain>/api/v1/webhooks/twilio/status`
  * Incoming SMS: `https://api.<domain>/api/v1/webhooks/inbound/twilio/message`
  * Incoming WhatsApp for the chatbot (per the R107 record): `https://api.<domain>/api/v1/webhooks/chatbot/whatsapp`
  * Voice (only once calling is switched on, 9.6): every voice callback must be `<API_PUBLIC_URL>/api/v1/voip/...`, that is `https://api.<domain>/api/v1/voip/...`, never a `workers.dev` or other address, because the signature is checked against `API_PUBLIC_URL`. Set on the number: incoming call `.../voip/twiml/inbound`; status `.../voip/status-callback`; recordings `.../voip/recording-callback`. The platform builds the others itself and hands them to Twilio inside its answers, all under the same base: `.../voip/twiml/outbound`, `.../voip/twiml/ivr-handler`, the dial result `.../voip/twiml/dial-status` (what reaches voicemail and the missed-call record when nobody answers), `.../voip/voicemail-callback` and `.../voip/voicemail-complete`. A callback is processed exactly once even if Twilio repeats it (agency migration 0049, table `provider_events`; it is applied by `migrate-tenants` like any other).
  The incoming SMS and WhatsApp addresses both exist in the code; confirm on staging which one the inbox uses for WhatsApp before pointing real numbers at it.
- [ ] **9.3 WhatsApp.** Start Meta business verification for your company (days to weeks), then add a WhatsApp sender in Twilio and get each message template approved. Register each agency's WhatsApp number so incoming messages find the right agency: in the agency's integration settings, or through `POST /api/v1/integrations/channels` as that agency's admin (it writes `tenant_channel_addresses`). A direct Meta Cloud API integration is not built.
- [ ] **9.4 Website chatbot widget.** Each agency's install snippet and allowed website origins are set in the desktop app (Chatbot, Install tab); no platform action.
- [ ] **9.5 Optional keys:** `ANTHROPIC_API_KEY` (set a monthly spend limit at Anthropic), `DEEPGRAM_API_KEY` (not before calling), `GOOGLE_MAPS_API_KEY`. Run the capped 20-call AI quality test from READINESS-PLAN section 6 before selling AI-heavy plans.
- [ ] **9.6 Calling** is built for Twilio only and is not marketed at launch. Owner decision 2026-10-15: no calling for agencies in India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh; Exotel is dropped. To switch it on later: (a) `ENVIRONMENT` must be `production` on the production Worker (the generator writes it for `--env production`; check the generated file), otherwise the wildcard `*` in the next setting would be honoured and calling offered everywhere; (b) the countries where calling is offered are in `VOIP_CALLING_COUNTRIES`, a comma-separated list of two-letter codes, default `GB,US,AU,SG` when unset. It is not written by the generator and not in `push-secrets.sh`, so to change it use `cd backend && npx wrangler secret put VOIP_CALLING_COUNTRIES -c .wrangler.production.toml --env production` (type `GB,US,AU,SG,DE,MY` for example); (c) every agency needs its country set in its settings: an agency with no country sees no calling; (d) set the Twilio callbacks as in 9.2. Do not configure voice numbers until you want to sell it. Local stacks use `*` and staging (`ENVIRONMENT=staging`) would honour it too; never put `*` on production.
- [ ] **9.7 Push notifications:** not available at launch (retired FCM key, no library in the driver app); do not promise them.

How you know: a real SMS and a real login code reach a phone in India; a WhatsApp test message reaches the inbox of the right agency; an unsigned or wrongly signed webhook call is refused. If it fails: a login code that never arrives and a Twilio error "invalid" usually means Verify service or sender not approved; webhook 403 means `API_PUBLIC_URL` differs from the URL Twilio calls or the token is wrong.

## Phase 10. Monitoring and backups

- [ ] **10.1 Uptime monitor** on `https://api.<domain>/api/v1/health/deep` with header `X-Health-Token: <HEALTH_TOKEN>`, every 1 to 5 minutes, alert by email and phone on any non-200. Add a second check on `https://<domain>`. Test it: temporarily wrong token should alert.
- [ ] **10.2 Error reporting:** create the project, set `ERROR_REPORTER_DSN`. Test: cause a harmless server error on staging (for example call a route with malformed data that errors) and see it appear. Create an alert rule "new error" and "more than N errors in 10 minutes".
- [ ] **10.3 5xx alert.** No alert exists in code. Combine: (a) the monitor in 10.1, (b) the error tool's alert in 10.2, (c) in the Cloudflare dashboard, Workers, `travelcrm-api`, Metrics, check the error-rate graph daily during the first weeks, and add a Cloudflare Notification for Workers errors if your plan offers it.
- [ ] **10.4 Edge rate limits.** In the Cloudflare dashboard add WAF rate-limiting rules for `/api/v1/auth/*` and `/api/v1/public/*` (the code limits sign-in to 10 attempts per 15 minutes per address and email, 50 per hour per address; the edge rules are an extra layer).
- [ ] **10.5 Backup bucket rule.** R2, `travelcrm-backups`, Settings, Object lifecycle rules: delete objects older than 90 days. Keep the bucket private.
- [ ] **10.6 Weekly backup job.** The workflow `.github/workflows/backup.yml` ("Weekly backup") runs every Sunday at 02:00 UTC and can be started by hand. In GitHub, Settings, Secrets and variables, Actions, set the secrets `CLOUDFLARE_API_TOKEN` (the backup token: D1 read, R2 write; KEYS-AND-ACCOUNTS 3.1), `CLOUDFLARE_ACCOUNT_ID` and `CF_D1_MASTER_ID`, and the variable `TRAVELCRM_DOMAIN`. It regenerates the config from the master database, dumps every database and uploads to `travelcrm-backups`. Prove it before relying on it: Actions, Weekly backup, Run workflow, tick **dry_run** (lists what would be saved), then run it again with dry_run off. The workflow only exists in the Actions tab once it is on `master` (0.6). The same thing by hand, from a machine with the repository and the token:

```bash
cd backend
export CF_D1_MASTER_ID=...                                            # as in 3.4
node scripts/gen-wrangler.mjs --env production --from-d1-remote      # refresh the agency list
node scripts/backup-tenants.mjs --remote --env production --dry-run  # shows what would be saved
node scripts/backup-tenants.mjs --remote --env production --bucket travelcrm-backups
```

  How you know: the R2 bucket gets a folder named with today's UTC date holding one `.sql.gz` per database plus `manifest.json`; the file count equals the number of agencies plus master; the workflow run is green.
- [ ] **10.7 Time Travel restore rehearsal on staging.** Pick a staging agency database name from `backend/.wrangler.staging.toml`; note the time; change one record in the agency; then:

```bash
cd backend
npx wrangler d1 time-travel info <database name> -c .wrangler.staging.toml --env staging
npx wrangler d1 time-travel restore <database name> --timestamp=<time before the change> -c .wrangler.staging.toml --env staging
```

  Check the change is gone; the restore prints the previous bookmark: restore to that bookmark to undo the restore, and check the change is back. Write down how long it took.
- [ ] **10.8 One restore from a dump** (BACKUPS.md "Restoring one agency from a dump") into a scratch database on staging, to prove the dumps are usable.
- [ ] **10.9 Dead-letter queues:** look at the six `-dlq` queues in the dashboard weekly; any message there is a failed job (import, export, campaign, AI extraction, tenant jobs).

How you know: the monitor shows green, a test error reaches your inbox, one backup folder exists, and both restores worked on staging. If it fails: a dump failing with a permission error needs D1 Edit on the backup token; a dump refused for FTS tables means someone used `wrangler d1 export` instead of the script.

## Phase 11. Pilot agency, go/no-go, rollback, first week

- [ ] **11.1 Pick one friendly pilot agency** (the marketing plan's design-partner idea: week 3 chooses three candidates, 2 to 8 November 2026; soft launch is planned for week 6, 23 to 29 November). Those dates are the marketing plan's assumptions and depend on this runbook being finished. The plan says not to start a trial for a real agency before the handoff works end to end: phase 6 is that proof.
- [ ] **11.2 Create the pilot agency in production** the same way as 6.6, owner email = the agency owner's real address, plan per the catalogue, region India. Sit with them for the first login (6.7 to 6.9), the first lead, the first quote, the first invoice.
- [ ] **11.3 Go/no-go checklist.** All must be yes:
  - [ ] Repository private, tokens revoked, all production secrets new (phase 0).
  - [ ] `https://api.<domain>/api/v1/health` and `/health/deep` are `ok`; monitor green for 48 hours.
  - [ ] Phase 6 fully ticked, including the answer to "does a new agency work without a redeploy".
  - [ ] First operator exists, no other operator rows, operator password in the vault.
  - [ ] `CREDENTIALS_KEYS` copy in the vault; `/admin/maintenance/*` run once.
  - [ ] Welcome mail passes SPF and DKIM and lands in the inbox.
  - [ ] The agency web app is live (phase 4A): reset, invite and shared-quote links work, `/download` and `/quick-start` load.
  - [ ] Signed installer on `downloads.<domain>`, installed on a clean machine; `updater.log` says `updater enabled (feed=build-config:...)` and a higher version was offered.
  - [ ] Backups: the weekly workflow ran once (dry run and real) with a folder in R2, two restores rehearsed.
  - [ ] Error alerts reach a person who will act; someone is named for each of: API down, email not arriving, an agency cannot sign in.
  - [ ] Plan values and caps confirmed by you (phase 0.7); trial length decided.
  - [ ] Legal pages reviewed; the landing page makes no claim you cannot show.
  - [ ] Twilio and SendGrid balances funded; spend alerts set at the providers.
  - [ ] Rollback steps below read by the person who will run them.
- [ ] **11.4 Rollback plan.**
  * **API:** `cd backend && npx wrangler deployments list -c .wrangler.production.toml --env production`, then `npx wrangler rollback <version id> -c .wrangler.production.toml --env production`. A rollback does not undo database migrations; migrations are written to be additive, so an older Worker normally still runs. If it does not, fix forward.
  * **Console:** `cd super-admin && npx wrangler rollback`.
  * **Agency web app:** `cd desktop && npx wrangler rollback` (Worker `travelcrm-app`), or redeploy the previous commit with 4A.3.
  * **Landing:** redeploy the previous commit with the 5.5 command, or use Pages, Deployments, Rollback in the dashboard.
  * **Data:** D1 Time Travel for one agency database (10.7), within 30 days; weekly dump for older or account-level loss.
  * **Bad desktop release:** re-upload the previous release's `latest.yml` so no new machine is offered the bad one, then publish a fixed, higher version. The updater does not downgrade installed machines; they need the fixed higher version.
  * **A misbehaving agency or an abuse case:** suspend it in the console (instantly blocks its users; reversible).
  * **A leaked secret:** generate a new value, `secret put`, and for `JWT_SECRET` and `JWT_REFRESH_SECRET` expect everyone to sign in again; for `CREDENTIALS_KEYS` add a second key id (`k2`), set `CREDENTIALS_ACTIVE_KEY_ID`, keep `k1` in the set until `/admin/maintenance/reencrypt` finishes.
- [ ] **11.5 First-week watch list (daily, 10 minutes):**
  * Monitor green; deep health `ok`; error inbox read.
  * Dead-letter queues empty; queue backlogs small.
  * SendGrid: bounces, spam reports, blocked sends. Twilio: spend today against each agency's cap; login-code count (12.90 rupees each).
  * Console usage and usage alerts: any agency near its caps; any agency using far more than its plan assumes.
  * Cloudflare: Workers requests and errors, D1 size per agency, Durable Object duration (INFRA.md 8), the first invoice at the end of the month.
  * Enquiries from the landing form answered the same day (`GET /api/v1/admin/enquiries`).
  * Sign-in failures and rate-limit hits (`429`) in the logs: a flood means abuse, a trickle means users forgetting passwords.
  * Sunday backup ran (Actions tab, Weekly backup, green); check the folder in R2.
  * Pilot agency feedback call at day 3 and day 7; write every complaint down.

How you know the pilot is healthy after a week: the pilot agency uses the app daily without operator help, no unexplained errors, spend per agency is inside the plan's caps, and every item in the watch list has a named owner. If it is not: do not add a second agency until the cause is fixed; use the rollback plan for anything that damages data.

## Appendix: facts this runbook rests on

* Master database tables and migrations: `backend/drizzle/master` (highest `0019_exchange_rates`), agency migrations `backend/drizzle/tenant` (highest `0049_provider_events`).
* Generated production config rules and scripts: INFRA.md sections 6 and 7.
* Faults list: INFRA.md section 11. The faults the first version of this runbook worked around (queues missing from terraform, `--from-d1-remote` and the placeholder id, the Oracle VM in every apply, desktop auto-update off, unsafe `push-secrets.sh` and `sync-config.sh`, web pages behind email links not hosted, mixed domain names, example terraform values) were fixed by R125 and are listed there as fixed.
* Voice: not part of the launch; Twilio only, outside India and the excluded markets (ADR-001, owner decision 2026-10-15).
* Billing (Stripe, Razorpay), GDPR tooling, language work and WordPress sites are later tiers; selling outside India waits for them.
