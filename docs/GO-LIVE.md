# Go-live runbook

Written 2026-10-15 and brought up to date on 2026-10-22 with the final code on branch `launch-readiness` (every batch through R133, master migrations up to `0028_pricing_step_b`, agency migrations up to `0056_email_undeliverable`). It now covers subscription billing, add-on packs, agency payment links, the approved prices, WhatsApp through Meta, resold calling with call recording, privacy tools, two-factor sign-in, feature switches, the email split and shared WordPress hosting. Nothing has ever been deployed: every command below is written from the code and has **not** been run against a real account, and no real provider (Stripe, Razorpay, Meta, Twilio, SendGrid, Cloudflare Email) has been used with the product. Expect to hit small surprises; each phase says how to tell, and what to do. What is still open is in [INFRA.md](INFRA.md) sections 10 and 11 and in [LAUNCH-REPORT.md](LAUNCH-REPORT.md) section 6. Per-batch settings are also listed in `docs/launch/STATE.json` (`goLiveConfig`); this file is the readable version of that list.

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
* Deploy the API only with `npm run deploy:api` (or `npm -w travelcrm-api run deploy:production`): it refuses to run unless the generated config is fresh. Never run `wrangler deploy` on `wrangler.toml` or `wrangler.base.toml`. Never run `npm install` or `npm ci` inside `backend/` or `super-admin/` (only at the repository root). The old root scripts `deploy` and `infra` are gone. `scripts/push-secrets.sh` (`npm run secrets:push`) and `scripts/sync-config.sh` (`npm run infra:sync`) are now safe: `sync-config.sh` only prints the `CF_*` ids, and `push-secrets.sh` pushes real secrets to the generated config (phase 3.7 explains it; start with `npm run secrets:push:dry`). The script does not know every setting: the billing, Meta WhatsApp, WordPress and calling settings are set by hand (phase 3.7a).
* **Never set `TEST_MODE` or `BILLING_GATEWAY=mock` on staging or production.** The mock payment gateway signs its events with a secret that has a public default. The code refuses the mock only when `ENVIRONMENT=production`, so on staging (`ENVIRONMENT=staging`) the protection is you: do not set either variable.
* Tools you need on the machine that does the deploys: Node 22 and npm, Git, Terraform 1.8 or newer (https://developer.hashicorp.com/terraform/install). Run `node -v` and `terraform version` to check. Run `npm ci` once at the repository root.

## Phase 0. Before anything: close the leak, rotate, decide

**Owner decision 2026-10-21 (batch R100 deferred):** the repository stays public for now. You will make it private and rotate keys later; you say the keys that were exposed are invalid and that every secret in the repository is a dummy value. Nothing has been pushed, and a push still waits for your explicit "push". That is fine **only while no real key exists**. Steps 0.1 to 0.5 below are therefore not skipped, they are postponed: do them before you create the first real provider key, and in any case before phase 3.7.

Why first: the GitHub repository `sn-arjun/travel-crm` is **public** (re-checked 2026-10-14) and its history held values (`backend/.dev.vars` was committed in `c668ebd` and `6d75a0b`; the console defaults were in `super-admin/wrangler.toml`; a token was in an old remote URL). Treat every value that was ever in that history as public, and never reuse one.

- [ ] **0.1 Make the repository private.** GitHub, `sn-arjun/travel-crm`, Settings, General, Danger Zone, Change visibility, Private. How you know: open https://github.com/sn-arjun/travel-crm in a private browser window; it must say "Not Found".
- [ ] **0.2 Revoke the old token.** https://github.com/settings/tokens and https://github.com/settings/apps (authorized apps): delete every token you do not recognise or that was ever pasted in a remote URL. Then on your PC: `git remote -v`; if a URL contains a token, run `git remote set-url sn-arjun https://github.com/sn-arjun/travel-crm.git` and let the Git credential manager ask for a new token.
- [ ] **0.3 Check copies.** Repository, Insights, Forks: any fork of the public repository stays public and keeps the old history. If there are forks, ask the owners to delete them. Other people may have cloned it; that is why 0.4 is not optional.
- [ ] **0.4 Rotate everything.** Production gets brand-new values for every secret (KEYS-AND-ACCOUNTS section 3.2 has the generation commands). Specifically do not reuse: anything from `backend/.dev.vars` history, the default super admin password `SuperAdmin@123` and the demo operator in `backend/scripts/seed-demo.mjs`, the credentials in `super-admin/wrangler.toml` history, any API key (SendGrid, Twilio, Stripe, Razorpay, Meta, Anthropic, Deepgram, Google) that was ever in a committed file: revoke it in that provider's console now.
- [ ] **0.5 History on the remote.** `docs/launch/STATE.json` says history was stripped locally with `git filter-branch` and a full backup bundle exists in `CRM-backups/2026-10-09/`. The remote still holds the old history until you replace it. Decide with engineering whether to force-push the stripped branches (only after 0.1), knowing that GitHub may keep the old commits reachable by their hashes for a while; this is another reason to rotate. Do not push anything before 0.1 is done.
- [ ] **0.6 Merge to `master`.** The workflows listen to the branch `master` and show up in the Actions tab only once they are on it. After 0.1 and 0.5, merge `launch-readiness` into `master` through a pull request.
- [ ] **0.7 Decide the open items.** Each row says where the answer is recorded. None blocks starting phase 1, but the ones marked "before phase N" block that phase.

| Open item (source) | Your decision | Where it is set | Needed before |
|---|---|---|---|
| Which legal entity holds provider, payment and app-store accounts and invoices customers (Q10) | | Every account in phase 1 | Phase 1 |
| Domain name (Q11): every tool now uses the one placeholder `YOUR-DOMAIN.example`; you choose the real name once and set it in the places listed in 0.8 | | See 0.8 | Phase 1 |
| Where the web pages in emails live (INFRA.md 11.15): **resolved by R125**: the agency web app (`app.<domain>`, phase 4A) hosts password reset, invitation, shared quotation `/q/...`, `/download` and `/quick-start`. `APP_URL` is `https://app.<domain>` | Nothing to decide; do phase 4A | `APP_URL` (derived) | Before any real agency uses invites or reset |
| VoIP (owner decisions 2026-10-15 and 2026-10-21): **Twilio only**; no calling for agencies in India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh; Exotel dropped (R308 dropped). **Settled 2026-10-21:** calling is off on trials by default (a console switch turns it on); a purchased number is released 14 days after cancel and 7 days after unpaid rent; a spend spike raises a flag and sends an email, it does not block calls. **Still open:** call-minute caps per plan, per-minute costs and fraud limits (R305 defaults), recording default, Call AI default, written OK from Twilio to resell | Confirm the open items; read `docs/decisions/ADR-001-voip.md` (owner decision at the end) | `VOIP_CALLING_COUNTRIES` and the console Calling pages (phase 9.6) | Only before switching calling on (it is not marketed at launch) |
| Prices and allowances: **approved 2026-10-21** (`docs/PRICING.md`, loaded by R129 and R130). Flat yearly price per agency plus paid extra users and AI credit packs; allowances and packs included; communication packs at provider cost x (1 + margin) with a floor of cost x 1.2. Open: whether card fees (about 2%) are acceptable against the 20% margin (about 18% after fees; `margin_pct` is yours to set), per-market Enterprise allowances for EU/DE, MY_TH and LK_NP_BD (none loaded) | Check the catalogue in the console against `docs/PRICING.md` (phase 9.9) | Master catalogue tables, console Catalogue pages; landing page shows founder prices | Phase 9.9 |
| Login codes by SMS: kept (owner, 2026-10-14). They are the weakest margin (about INR 13 a code); moving them to a WhatsApp template (about INR 0.14) is the largest cheap saving; OTP abuse limits (3 per 10 minutes and 10 per day per number, 20 per hour per address) still need your OK | Yours | Defaults in code | Before the first agency uses driver login codes at volume |
| Tax defaults (STATE `fromR201`): export (LUT) and reverse-charge wording; VAT rates GB 20, AE 5, SA 15, DE 19; Gulf agencies below the threshold use "none"?; GST 18% for itinerary invoices and 5% for trip invoices; US single sales-tax rate (no nexus handling); mandatory invoice fields per country | Ask your accountant | Tax settings and invoice templates | Before the first foreign agency; India defaults before the pilot |
| Platform tax on our own subscription invoices: where the platform is registered, its GST state and tax id, GST 18%, optional VAT for listed buyer countries (phase 3.7a) | Ask your accountant | Worker settings `PLATFORM_TAX_*`, `PLATFORM_GST_RATE`, `PLATFORM_VAT_*` | Before the first paid subscription |
| Signup style (Q4): request and operator approval (planned) or instant trial | | Landing form behaviour, console | Phase 5 |
| Data regions (R212): **deferred 2026-10-21, single location for now** (your words: "I don't think we have regions in Cloudflare"). Do not promise customers a region. The code still passes a placement hint or jurisdiction when it creates an agency database (INFRA.md 6.1): check on the real account what that does and whether to hide the region choice in the new-agency wizard | Check | New-agency wizard | Phase 6 |
| Announcements and support tickets hidden for v1 (Q8, planned) | | Already hidden | none |
| WordPress (Q9 **answered 2026-10-21**): one shared WordPress Multisite on the Oracle free machine for all agency sites; container-per-agency later when revenue allows. Not needed to sell the CRM | Optional | `docs/ops/WORDPRESS-HOSTING.md` (phase 9.13) | Only when you want agency websites |
| Markets: India, UK, EU, Australia and New Zealand, the rest of the West, Singapore, the Gulf, Malaysia and Thailand, Sri Lanka, Nepal and Bangladesh all have prices (R129). Billing, the tax engine, phones by country and languages are built; none has met a real provider. Gulf agencies have no calling | Choose where to sell first; check each market's prices in the console before selling there | Console Catalogue | Phase 9.9 |
| Translations: Arabic (811 keys) and Hindi (62%) are AI drafts; Arabic right-to-left is enabled | A native reader checks them | `desktop/src/messages/ar.json`, `hi.json` | Before the first Arabic or Hindi customer (phase 9.14) |
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
- [ ] **1.4 SendGrid** account (domain authentication happens in phase 9). It sends all agency mail and is the fallback for platform mail, so you need it even though Cloudflare sends the platform's own mail by default.
- [ ] **1.5 Twilio** account (upgrade and add funds in phase 9). For calling also ask Twilio, in writing, whether you may resell numbers and minutes through sub-accounts (phase 9.6).
- [ ] **1.5a Payment accounts:** Razorpay (India agencies) and Stripe (everyone else), in the name of the legal entity, with business checks done. Create test-mode keys now; live keys later (phase 9.8). Whether Stripe is open to a new Indian entity was not researched: check first.
- [ ] **1.6 Start the long lead items:** Windows code-signing certificate (phase 7), Google Play Console and Apple Developer (phase 8), Meta business verification for WhatsApp (phase 9.3), Twilio reseller approval (phase 9.6). Optional: Oracle Cloud account for agency websites (phase 9.13), Deepgram (phase 9.5).
- [ ] **1.7 GitHub:** repository private (0.1), new token.
- [ ] **1.8 Error-reporting project and uptime monitor** accounts (phase 10).

How you know: every account in KEYS-AND-ACCOUNTS section 3 has an owner, a vault entry and a login you have tested. If a sign-up fails (as Plivo did), write down where it failed and tell engineering; do not work around provider checks.

## Phase 2. Cloudflare resources with terraform

Terraform builds the databases, buckets, all 14 queues and DNS. It needs only three values (`domain`, `cloudflare_account_id`, `cloudflare_api_token`). The Oracle Cloud VM for agency websites (optional, phase 9.13) is a separate root, `terraform/oracle/`, with its own state; you do not touch it now. The one thing that needs care: the three Workers domains (`api.<domain>`, `admin.<domain>`, `app.<domain>`) can only be created after their Workers exist, so they are left out of this first apply and added in phases 3.9, 4.3 and 4A.

- [ ] **2.1 Create the state bucket by hand** (terraform keeps its notes there):

```bash
cd backend
npx wrangler r2 bucket create terraform-state
```

  Then in the Cloudflare dashboard: R2, Manage R2 API Tokens, create an Object Read and Write token for `terraform-state`; copy the Access Key ID and Secret.

- [ ] **2.2 Fill in `terraform/terraform.tfvars`:** `cp terraform/terraform.tfvars.example terraform/terraform.tfvars` and edit it (it is git-ignored). Set `domain`, `cloudflare_account_id`, `cloudflare_api_token` (or give the domain with `TF_VAR_domain`). Those three are the only required variables; the app-secret variables are optional and terraform uses none of them. **Delete the example lines for them** (`twilio_*`, `sendgrid_*`, `anthropic_api_key` and so on) from your copy, or leave them blank: the example file holds fake values such as `your-twilio-auth-token`, and `scripts/push-secrets.sh` reads this file in phase 3.7 and would push them. `domain` refuses the placeholder `YOUR-DOMAIN.example`. The files in `environments/` no longer carry a domain or any example value (only `project_name` and `environment`), so passing one with `-var-file` is harmless but unnecessary.
- [ ] **2.3 Oracle: nothing to do.** The main apply no longer needs any `oci_*` value and creates no VM. The two DNS-only records `*.sites` and `wp-api` are created only once `oci_instance_ip` is set (after `terraform/oracle` has been applied, phase 9.13). Check: `terraform plan` in 2.5 mentions no `oci` resource.
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

  Read the plan: it should only list creations (about 27). Nothing to destroy, nothing with your domain replaced. Then run the same command with `apply` instead of `plan` and type `yes`. Terraform warns that targeted applies are exceptional; that is expected here. Do not use the **Terraform Infrastructure** workflow for this first apply: its apply step is not targeted, so it would fail on the three Workers domains (and its `terraform init` passes no `-backend-config`, so the state bucket address would be missing). (The records `*.sites` and `wp-api` are not created until `oci_instance_ip` is set, phase 9.13.)

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

- [ ] **2.9 Manual items terraform does not do:** R2 lifecycle rule on `travelcrm-backups` (phase 10); public address `downloads.<domain>` on `travelcrm-desktop-updates` (phase 7); Cloudflare WAF rate-limit rules (phase 10); Turnstile widget (phase 5); Email Routing and Email Sending onboarding (phase 9.1a). The two Workers (`travelcrm-api`, `travelcrm-super-admin`) and `travelcrm-app` must exist before their domains are attached (the workers domains in `terraform/` are applied with `-target` in 3.9, 4.3 and 4A.4).

How you know it worked: in the Cloudflare dashboard you see D1 `travelcrm-master`, three KV namespaces, R2 buckets `travelcrm-files`, `travelcrm-backups`, `travelcrm-desktop-updates`, `terraform-state`, 14 queues starting `travelcrm-`, a Pages project `travelcrm-landing`, and the zone is Active. `terraform plan` (same targets) says "No changes".

If it fails: "zone already exists" means do the import in 2.4. A permission error names the missing token permission: add it to the token and retry. "domain is still the YOUR-DOMAIN.example placeholder" means `domain` was not set (2.2). A queue "already exists" error means someone created it by hand earlier: import it (`terraform import`) or delete the empty queue and re-apply. If terraform loses its state, do not re-apply blindly: stop and ask engineering to import the resources.

## Phase 3. Secrets, generated config, migrations, first API deploy, health check

Work in `backend/`. The environment variables from the top of this file must be set. From now on every wrangler command that talks about the production Worker uses `-c .wrangler.production.toml --env production`.

- [ ] **3.1 Generate the secrets** with the commands in KEYS-AND-ACCOUNTS 3.2 and store each in the vault: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_JWT_SECRET` (different from `JWT_SECRET`, 32 or more characters), `CREDENTIALS_KEYS` (keep a copy in the vault for ever: losing it makes every stored provider credential and every two-factor secret unrecoverable, and the agency payment keys and Meta tokens with them), `HEALTH_TOKEN`, `INBOUND_EMAIL_SECRET`, and `UNSUB_SECRET` (signs the unsubscribe links in marketing messages; if you leave it out the code derives one from `JWT_SECRET`, and a later change of `JWT_SECRET` would break every unsubscribe link already sent). If you will run agency websites also `PROVISIONER_SECRET` (24 or more characters, phase 9.13).
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
# Optional plain settings, written to [vars] (never secrets): EMAIL_FROM_NAME, PLATFORM_SUPPORT_EMAIL, QUOTES_URL,
# EMAIL_INBOUND_DOMAIN (phase 9.1a) and EMAIL_SYSTEM_PROVIDER (sendgrid or cloudflare; default cloudflare, see 9.1a).
# Set them before generating if you want them, e.g.:
export EMAIL_FROM_NAME="Your Company" PLATFORM_SUPPORT_EMAIL=support@$DOMAIN
export EMAIL_INBOUND_DOMAIN=in.$DOMAIN      # leave out until Email Routing is set up (9.1a)
node scripts/gen-wrangler.mjs --env production --registry "$TEMP/registry-empty.json"
node scripts/predeploy-guard.mjs production
```

  The generator also writes, with no input from you: `API_PUBLIC_URL`, `ALLOW_LOOPBACK_ORIGINS` (`true`; override with the variable of the same name), `CREDENTIALS_ACTIVE_KEY_ID` (`k1`; same), `TENANT_PROVISIONER` (`cloudflare`), `CF_WORKER_SCRIPT_NAME` (`travelcrm-api`), `EMAIL_SYSTEM_PROVIDER` (`cloudflare` unless you set the variable) and the `send_email` binding `EMAIL` (from `wrangler.base.toml`; it is local to the Worker and never sends real mail from `wrangler dev`). It does **not** write the billing, calling, WordPress or Meta settings: those are phase 3.7a. Set `APP_URL`, `API_URL`, `CORS_ORIGINS` or `EMAIL_FROM` yourself only to override a derived value.
  How you know: the first command prints `wrote ...\.wrangler.production.toml (production, 0 agencies, TENANCY_MODE=multi)` and the guard prints `is fresh and has no placeholder ids`. Do not edit the generated file; to change something, change the input and generate again. (The file is git-ignored.)

- [ ] **3.5 Migrate the master database** (no agency databases exist yet):

```bash
node scripts/migrate-tenants.mjs --remote --env production --dry-run
node scripts/migrate-tenants.mjs --remote --env production
```

  How you know: output ends with the master listed as done, with a warning "no agency databases found", which is right for now. Verify: `npx wrangler d1 execute travelcrm-master --remote -c .wrangler.production.toml --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 3"` shows `0028_pricing_step_b.sql` first. The master migrations also load the approved price catalogue (0026) and switch on the second step of allowances and packs (0028), so a fresh master already holds the plans, prices and packs of `docs/PRICING.md` (check them in phase 9.9). Agency databases are created later with migrations up to `0056_email_undeliverable`; for agencies that already exist, `migrate-tenants` applies new ones.

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
  Later phases add `SENDGRID_WEBHOOK_PUBLIC_KEY`, `INBOUND_EMAIL_SECRET`, `UNSUB_SECRET`, `TWILIO_*`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `GOOGLE_MAPS_API_KEY`, `TURNSTILE_SECRET`, `ERROR_REPORTER_DSN` (the script knows all of these). Leave unused ones (`PLIVO_*`, `FCM_SERVER_KEY`, `OTP_DELIVERY`) unset. The script does **not** know the settings in 3.7a.
  Check: `cd backend && npx wrangler secret list -c .wrangler.production.toml --env production` shows the names (never the values).

- [ ] **3.7a Settings that neither the generator nor `push-secrets.sh` sets.** Set each one by hand with `npx wrangler secret put <NAME> -c .wrangler.production.toml --env production` (run in `backend/`; a secret is simply a setting the Worker reads, and none of these names is in the generated `[vars]`, so there is no clash). Set only the ones for features you switch on, in the phase named:

| Name | What it is | Phase |
|---|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe subscription billing for agencies outside India | 9.8 |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay subscription billing for Indian agencies | 9.8 |
| `PLATFORM_TAX_COUNTRY`, `PLATFORM_TAX_STATE`, `PLATFORM_TAX_ID`, `PLATFORM_GST_RATE` | Where the platform is registered, its GST state and tax id, and the GST rate on subscription invoices. GST is charged to buyers in India only. Defaults when unset: country `IN`, no state, no tax id, GST `18` | 9.8 |
| `PLATFORM_VAT_COUNTRIES`, `PLATFORM_VAT_RATE` | Optional: buyer countries (comma list, for example `GB,DE`) that are charged VAT on the subscription, and the percentage. Unset means no tax at all on subscriptions bought outside India | 9.8 |
| `BILLING_GRACE_DAYS` | Days (0 to 60) a failed renewal stays in grace before the agency turns read-only. Default `7` when unset | 9.8 |
| `WHATSAPP_META_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_APP_SECRET`, `WHATSAPP_META_VERIFY_TOKEN` | The platform's own Meta WhatsApp account (optional `WHATSAPP_META_GRAPH_VERSION`, default `v21.0`). Agencies can instead bring their own Meta account in Settings, Integrations | 9.3 |
| `VOIP_CALLING_COUNTRIES` | Countries where calling is offered | 9.6 |
| `SUPER_ADMIN_EMAIL` | Address that receives call fraud and spend-spike alerts | 9.6 |
| `OCI_PROVISIONER_URL`, `PROVISIONER_SECRET`, `WP_SITES_DOMAIN` | Agency websites on the Oracle machine | 9.13 |

  `scripts/push-secrets.sh` does not list any of these (check with the dry run); do not rely on it for them. `BILLING_GATEWAY`, `BILLING_MOCK_SECRET`, `VOIP_PROVIDER`, `TEST_MODE`, `TENANCY_MODE`, `ENVIRONMENT`, `RATE_LIMIT_MULTIPLIER` and `ALLOW_SINGLE_TENANT_PRODUCTION` are never set on staging or production.

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
- [ ] **4.8 Know the console pages you will use** (look at each once, nothing to configure yet): **Tenants** (create, suspend, reactivate, "log in as", and per agency a **Calling** tab and a **Website** tab), **Catalogue** (plans, prices, allowances, packs; founder and list rows, phase 9.9), **Features** (phase 9.12), **Email** (phase 9.1a), **WordPress** (phase 9.13), **Subscriptions**, **Audit log**, **System health**. Announcements, support tickets and SEO are hidden or stubs for v1. The console has no two-factor sign-in yet (a known gap): keep the operator password long (12 or more characters) and in the vault.

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
- [ ] **5.8 Legal pages** are drafts: do not announce publicly before a lawyer has reviewed `landing/legal/*` (privacy policy, terms, data processing agreement, sub-processor list). The terms must also carry the emergency-calling disclaimer (calls made through the softphone cannot reach emergency numbers) before calling is sold, and the landing page has a cookie notice (R208). The landing page shows the founder prices (R129); after the founder window ends on 2027-03-31 check that its wording and the console agree (phase 9.9).

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
- [ ] **6.15 Plan caps.** Check that usage pages in the console show counts, and that an agency at its SMS, WhatsApp (utility and marketing are two separate lines), email or call-minute cap is stopped (402) or offered a pack for its own market, not charged silently.
- [ ] **6.16 Subscription payment in test mode** (phases 9.8 and 9.10 first, with the **test** keys of Stripe and Razorpay, never `BILLING_GATEWAY=mock`). For an Indian agency and a non-Indian one: checkout, payment, active subscription, platform invoice `PINV-...` with the right tax, receipt email; upgrade; extra users (pro rata); cancel. Let a test renewal fail and watch the grace period (`BILLING_GRACE_DAYS`), then the read-only state (writes answer 402, nothing is deleted), then pay and see it recover. Buy each add-on pack once. An agency in a market with no price row sees `PRICE_NOT_CONFIGURED` (409) and cannot pay: that is the sign a price row is missing.
- [ ] **6.17 Agency payment link.** In a staging agency connect that agency's own Razorpay or Stripe test keys, paste the webhook URL shown in Settings, Integrations into that agency's dashboard (9.10), send an invoice with its "Pay online" link, pay one full and one part-paid invoice, and see the payments recorded once each.
- [ ] **6.18 Two-factor and passwords.** Turn on two-factor for one user, sign out and in with the app code, use a recovery code once, then try Settings, Security, "require two-factor sign-in" for the whole agency. Try a password shorter than 12 characters: it must be refused.
- [ ] **6.19 Privacy tools.** On a test contact: export the data, send a marketing message and open its unsubscribe link (the contact is then skipped), erase the contact and read what stays (invoices are kept, personal fields are anonymised).
- [ ] **6.20 Messages and calls with real providers, if you are switching them on:** a WhatsApp message in and out through Meta (9.3), a real softphone call and a recording (9.6), a reply from Gmail landing in an agency's inbox (9.1a).

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

  The build prints `run-builder: update feed https://downloads.<domain>/win/` and `prepare-standalone: build-config.json apiUrl=... updateUrl=...`. If it prints "neither TRAVELCRM_UPDATE_URL nor DOMAIN is set; using a placeholder feed", `DOMAIN` was missing: this installer would never auto-update, so build again. Output in `desktop/release/`: `TravelCRM Pro Setup <version>.exe`, its `.blockmap` and `latest.yml`. Verify the signature in PowerShell: `Get-AuthenticodeSignature "desktop\release\TravelCRM Pro Setup <version>.exe" | Format-List Status, SignerCertificate`: `Status` must be `Valid`. If you skipped the certificate the build still succeeds but is unsigned (Windows shows "unknown publisher"). **The installer verified on 2026-10-21 (`docs/BUILD-VERIFICATION.md`, 167,871,770 bytes, unsigned) was built with a local test feed (`TRAVELCRM_UPDATE_URL=http://127.0.0.1:19999/feed/`), so it must never be shipped.** Always rebuild for release with `DOMAIN` set. Only a Windows installer is planned for launch; macOS and Linux need their own build machines.
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

- [ ] **8.1 Create the real upload keystore, owned by you, outside the repository.** (The APK built during verification is signed with a throwaway test key kept in `CRM-backups/throwaway-keystore`. That key is for local builds only; a build signed with it, or with the debug key, must never go to Google Play.)

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
- [ ] **9.1a Email split (owner decisions 2026-10-21, ADR-002 and R132): inbound on Cloudflare Email Routing, platform system mail on Cloudflare sending BY DEFAULT with SendGrid as the automatic fallback, ALL agency mail on SendGrid.** SendGrid stays the sender for everything an agency sends (Hub messages, campaigns, invoices, vouchers, itineraries, reminders) and is the fallback for platform mail. Do these in the Cloudflare dashboard (nothing here is run by an agent; there is no Amazon SES):
  1. **Inbound domain.** Pick a subdomain that is not your company mailbox domain, for example `in.<domain>` (the company's own MX on the apex stays untouched). Email Service, Email Routing, onboard `in.<domain>`: Cloudflare adds the MX records and the SPF TXT for it (ADR-002 6.4). Add a **catch-all rule, action "Send to a Worker", Worker `travelcrm-api`**. Subaddressing (`reply+token@`) is covered by the catch-all.
  2. **Tell the Worker the inbound domain:** set `EMAIL_INBOUND_DOMAIN=in.<domain>` in the environment where you run `node scripts/gen-wrangler.mjs` (3.4 and every later regenerate) and redeploy. **Trap:** the **Deploy Backend API** workflow regenerates the config from the repository variables `TRAVELCRM_DOMAIN`, `APP_URL`, `API_URL`, `CORS_ORIGINS` and `EMAIL_FROM` only (its health check also needs the variable `API_URL`). It passes no `EMAIL_INBOUND_DOMAIN`, `EMAIL_SYSTEM_PROVIDER`, `EMAIL_FROM_NAME`, `PLATFORM_SUPPORT_EMAIL` or `QUOTES_URL`, so a deploy from that workflow would drop them (reply addresses would stop). Until the workflow is changed to pass them, deploy from your own machine with `npm run deploy:api` after exporting them, as in 3.4 and 3.6. From then on agency mail carries `Reply-To: reply+<token>@in.<domain>`; a customer reply is filed in that agency's Communication Hub inbox, on the right contact and thread. Unknown or expired tokens are rejected (`550 Unknown address`) and show in `webhook_log` with source `cloudflare:email`. Without `EMAIL_INBOUND_DOMAIN` nothing changes (replies go to the agency address or the sending user, as before). An agency's own receiving address on `in.<domain>` is added as a `tenant_channel_addresses` email row (Super Admin, agency channels).
  3. **Sending domain for platform system mail (beta).** Email Service, Email Sending, onboard `<domain>`: Cloudflare adds the MX, SPF and DKIM records on `cf-bounce.<domain>` and the DMARC record on `_dmarc.<domain>`. Until the domain is onboarded Cloudflare only sends to verified destination addresses in your account. Arbitrary recipients need the **Workers Paid** plan. Start DMARC at `p=none` with a report address and move to `quarantine` after a month of clean reports (Cloudflare's example uses `p=reject`; do not start there). Keep SendGrid's CNAMEs from 9.1 as they are: SPF/DKIM for both providers must pass.
  4. **Sender onboarding:** the `From` of platform mail is `EMAIL_FROM` (`noreply@<domain>`), which must be on the onboarded sending domain. Agency mail leaves SendGrid with the same From (SendGrid authenticated domain from 9.1).
  5. **Switch on.** Cloudflare is now the built-in default for platform mail (R132), so nothing needs switching; what needs doing is the sender onboarding in steps 1 to 4, because until the platform domain is onboarded Cloudflare refuses the mail and the fallback sends it through SendGrid (the console Email page shows these as "fallback" with the reason). The generated config declares the `send_email` binding `EMAIL` (never remote). On staging first: deploy, trigger a password reset to a Gmail and an Outlook address, and read the headers: `spf=pass`, `dkim=pass`, `dmarc=pass`. Then repeat for production. A Cloudflare error (daily limit, validation, outage) is retried once on SendGrid automatically, so a reset is not lost; Email Sending logs and metrics are in the dashboard (the Email Routing summary shows Worker-sent mail as "dropped"; that is a display quirk).
  6. **Roll back:** open the super admin console, Email page, choose SendGrid for platform system mail, give a reason and save; it is live within a minute with no deploy and is in the audit log. (Setting `EMAIL_SYSTEM_PROVIDER=sendgrid` and redeploying does the same when the console is not available; the console setting wins over the variable.) The same page switches the SendGrid fallback and the customer reply addresses on and off, sends a test email, and shows the platform delivery log (masked addresses, 90 days; SendGrid delivery events update the rows, Cloudflare rows read "accepted by provider" because Cloudflare has no event feed, so check its dashboard). Resolution order: console setting, then `EMAIL_SYSTEM_PROVIDER`, then the built-in default (Cloudflare with fallback). To stop inbound on Cloudflare, unset `EMAIL_INBOUND_DOMAIN` and redeploy (new agency mail then goes out with the old reply-to); replies already sent to a token address keep arriving until you remove the catch-all rule. The old SendGrid Inbound Parse route is still in the code; point its MX back if you need it. Keep the SendGrid account and its CNAMEs.
  7. **What is and is not on Cloudflare.** Only the platform's system mail (welcome, invitations, password reset, receipts, alerts, trial-ending notices) can use Cloudflare. Agency mail (Hub messages, campaigns, invoices, vouchers, itineraries, reminders) is always SendGrid, and a test proves marketing mail never goes through Cloudflare. Gaps to know: Cloudflare has no delivery-event feed, so system mail shows as "accepted" in the console log and real status is in the Cloudflare dashboard; turning "customer reply addresses" off also refuses replies to addresses already sent; hard bounces on agency mail flag the contact (`email_undeliverable`) and refund the send; the invoice email carries a summary and a "Pay online" link, not the PDF (vouchers do attach theirs). The Cloudflare Email Sending service is in beta and its limits, price and processing location were not verified (ADR-002 section 7): check them on the dashboard before relying on it.
  How you know: a real reply from an external mailbox (Gmail) to an agency email shows up in that agency's inbox within a minute; a message to `reply+aaaaaaaaaaaaaaaaaaaaaaaa@in.<domain>` bounces with "Unknown address"; the staging reset mail passes SPF, DKIM and DMARC.
- [ ] **9.2 Twilio.** Upgrade and add funds. Create the Verify service and a sending number; set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM_NUMBER`. `API_PUBLIC_URL` **must equal** the address Twilio calls (`https://api.<domain>`), or signature checks fail; the generator derives it from `DOMAIN` (3.4), so check it in `backend/.wrangler.production.toml`. In the Twilio console set these callbacks (all `POST`):
  * Message status: `https://api.<domain>/api/v1/webhooks/twilio/status`
  * Incoming SMS: `https://api.<domain>/api/v1/webhooks/inbound/twilio/message`
  * Incoming WhatsApp for the chatbot (per the R107 record): `https://api.<domain>/api/v1/webhooks/chatbot/whatsapp`
  * Voice (only once calling is switched on, 9.6): every voice callback must be `<API_PUBLIC_URL>/api/v1/voip/...`, that is `https://api.<domain>/api/v1/voip/...`, never a `workers.dev` or other address, because the signature is checked against `API_PUBLIC_URL`. Set on the number: incoming call `.../voip/twiml/inbound`; status `.../voip/status-callback`; recordings `.../voip/recording-callback`. The platform builds the others itself and hands them to Twilio inside its answers, all under the same base: `.../voip/twiml/outbound`, `.../voip/twiml/ivr-handler`, the dial result `.../voip/twiml/dial-status` (what reaches voicemail and the missed-call record when nobody answers), `.../voip/voicemail-callback` and `.../voip/voicemail-complete`. A callback is processed exactly once even if Twilio repeats it (agency migration 0049, table `provider_events`; it is applied by `migrate-tenants` like any other).
  The incoming SMS and WhatsApp addresses both exist in the code; confirm on staging which one the inbox uses for WhatsApp before pointing real numbers at it.
- [ ] **9.3 WhatsApp through Meta (R213).** WhatsApp goes through Meta's Cloud API, one connection per agency (text, media, templates; the 24-hour customer-service window is enforced before sending, and the send is refunded if refused). Twilio stays the sender for SMS, login codes and calling. Steps, in this order (allow days to weeks for the first):
  1. **Meta Business verification** for your legal entity (https://business.facebook.com), then a Meta app with the WhatsApp product, a WhatsApp Business Account and a registered number.
  2. **Credentials:** a system-user access token with `whatsapp_business_messaging` and `whatsapp_business_management`, the app secret, and a verify token you invent. Two ways to hold them: (a) the **platform's own** account: set `WHATSAPP_META_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_APP_SECRET`, `WHATSAPP_META_VERIFY_TOKEN` as Worker secrets (3.7a); (b) **each agency brings its own** account and pastes its token, app secret and number in Settings, Integrations (stored sealed with `CREDENTIALS_KEYS`; the screen shows only the last four characters).
  3. **Webhook:** in the Meta app, Webhooks, product WhatsApp, callback URL `https://api.<domain>/api/v1/webhooks/inbound/meta/whatsapp` (it must equal `<API_PUBLIC_URL>/api/v1/webhooks/inbound/meta/whatsapp`), the verify token from step 2, and subscribe to `messages`. The platform answers Meta's handshake and checks `X-Hub-Signature-256` over the raw body; it finds the agency by the number (`phone_number_id`), so each agency's number must be registered to it (Settings, Integrations, or `POST /api/v1/integrations/channels` as that agency's admin; it writes `tenant_channel_addresses`). A number already used by another agency is refused.
  4. **Templates:** create each message template in Meta's WhatsApp Manager with **exactly the same name** as the CRM template and wait for approval. **Marketing templates must contain `{{unsubscribe_url}}`**: the CRM refuses to send a marketing campaign without it (R213, R208). There is no template sync from Meta; keep the two lists equal by hand.
  5. **Test:** use Test connection in Settings, Integrations (it calls Meta; it cannot run offline), then send and receive one message and one template.
  Utility and marketing are metered and capped separately (9.9). Known gaps: festival campaigns still send WhatsApp through Twilio, not Meta; inbound media is not downloaded; no template sync.
  How you know: a message from a phone shows up in that agency's inbox, a template send reaches the phone, and a call with a wrong signature is refused.
- [ ] **9.4 Website chatbot widget.** Each agency's install snippet and allowed website origins are set in the desktop app (Chatbot, Install tab); no platform action.
- [ ] **9.5 AI, transcription and maps keys.** `ANTHROPIC_API_KEY` (set a monthly spend limit at Anthropic; the call summary no longer uses it), `GOOGLE_MAPS_API_KEY`, and for calls: `DEEPGRAM_API_KEY` for **premium** transcription (Deepgram Nova-3; 25 AI credits a minute). **Standard** transcription uses Cloudflare Workers AI Whisper through the `AI` binding (3 credits a minute; nothing to set, it is in the generated config) and the call summary costs 5 credits per 5 minutes (which engine writes it: check in the AI settings). All of it is charged in AI credits; the agency plan decides whether Call AI is on. Transcripts and summaries are suggestions only. Before selling AI-heavy plans run the capped 20-call quality test from READINESS-PLAN section 6, and decide the **recording default** and the **Call AI default** for new agencies (still open).
- [ ] **9.6 Calling** is built for Twilio only (one Twilio **sub-account per agency**, resold at provider cost plus 20%) and is not marketed at launch. Owner decisions: 2026-10-15 no calling for agencies in India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh, Exotel dropped; 2026-10-21 calling off on trials by default, number release 14 days after cancel and 7 days after unpaid rent, a spend spike raises a flag and an email but does not block. Do these in order when you decide to sell it:
  1. **Twilio's written OK** to resell numbers and minutes through sub-accounts. Without it do not switch calling on. Keep the parent account's `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` set (9.2); the platform creates and suspends the sub-accounts itself (suspended, resumed or closed together with the agency; numbers are released 14 days after a cancel).
  2. **`ENVIRONMENT` must be `production`** on the production Worker (the generator writes it for `--env production`; check the generated file), otherwise the wildcard `*` would be honoured and calling offered everywhere. Never put `*` on staging or production.
  3. **`VOIP_CALLING_COUNTRIES`** is a comma-separated list of two-letter codes. The code default when it is unset is `GB,US,AU,SG` (all four at once). `docs/PRICING.md` (7.7) says to keep it at `US` until the market split ships, because a UK or Australian agency would otherwise buy minutes priced for the US. The market split has shipped (R129: markets UK, EU, ANZ, WEST and SG each have their own call-minute packs), so that condition is met in code, but real number prices and a real call per country are still missing. **What to set:** set it **explicitly** (do not rely on the default) to `US` for the first real calls, then add `GB`, `AU` and `SG` one at a time once each has real number prices (step 5) and one real call has worked. Germany and Malaysia (second wave) need a price check first: New Zealand and EU countries other than Germany use a call weight of 1 until priced. It is neither generated nor in `push-secrets.sh`: `cd backend && npx wrangler secret put VOIP_CALLING_COUNTRIES -c .wrangler.production.toml --env production`, then type the list. Countries in the policy table (India, UAE, Saudi Arabia, Qatar, Thailand, Sri Lanka, Nepal, Bangladesh) stay refused even if you add them.
  4. **Each agency needs its country set** in its settings; an agency with no country sees no calling. Calling on a **trial** is off unless you switch it on for that agency in the console.
  5. **Numbers.** The console Calling tab of an agency searches and buys a number (the purchase is idempotent) and releases one. Rental is an add-on at cost plus 20%, renewed monthly; unpaid rent releases the number after 7 days. **Replace the draft monthly number prices (US and UK about $1.38, Singapore $5.00 retail) with Twilio's real prices.** Countries that need identity documents: UK, Australia, Singapore, Germany, Malaysia (not the US). Document packs are reviewed in the console (the agency adds links); **they are not submitted to Twilio automatically, so submit each regulatory bundle by hand in the Twilio console at first.** Check that a webhook signature from a sub-account verifies.
  6. **Callbacks** as in 9.2 (`<API_PUBLIC_URL>/api/v1/voip/...`); each is handled exactly once even if Twilio repeats it.
  7. **Minutes and caps.** Plan allowances are in `docs/PRICING.md` (trial 0, Basic 100, Pro 250, Enterprise 500 minutes a month). Usage is imported every 5 minutes from each sub-account's own usage records (charged once per Twilio call id, customer leg only, weighted by destination cost). At the cap new calls get 402 and calls in progress are not cut; inbound still rings. Minute packs are cost times 1.2 or more. Draft per-minute costs and fraud defaults are still yours to confirm.
  8. **Fraud limits (defaults).** Premium-rate and satellite prefixes refused; only allowed destinations; 10 calls a minute, 3 at once, 600 minutes a day per agency, 2 hours per call. A spend spike (3 times the usual, with a small minimum) and a platform-wide daily cost ceiling raise a **flag** in the console (lift or dismiss it there) and send an email to **`SUPER_ADMIN_EMAIL`** (set it, 3.7a; with it unset no email is sent). Nothing is blocked automatically for a spike.
  9. **Softphone.** Agents call and answer inside the app (Twilio Voice SDK, loaded only when needed). The app asks the API for a call token (`GET /api/v1/voip/token`, valid 15 minutes, refreshed in the background, refused to staff who still have to set up two-factor). The packaged desktop app allows the microphone for its own address only, and the browser asks the user. **Test the permission prompt and a ring on a real device in both the packaged app and the browser (`app.<domain>`).** The in-call panel has a mic check.
  10. **Recording and call AI.** Recordings are copied once into R2 and deleted at Twilio; playback links last 5 minutes and follow role rules. Each agency picks a consent mode (announce at call start, off, or on request) and can edit the announcement text; the default retention is 90 days, after which audio and transcripts are removed and the call record stays. **A lawyer must approve the consent wording per market** (recording laws differ: some places need everyone's consent) before recording is on by default. Transcription and summaries are in 9.5.
  11. **Terms.** Add the emergency-calling disclaimer to the terms (5.8) before selling calling.
  One real call per country you enable, from a staging agency and then the pilot, is the test. Known gaps: the transcript search index is not maintained (search misses AI transcripts); the old inbound extract-lead path still creates follow-ups by itself.
- [ ] **9.7 Push notifications:** not available at launch (retired FCM key, no library in the driver app); do not promise them.
- [ ] **9.8 Subscription billing (R205).** Razorpay collects from agencies in India, Stripe from everyone else; a signed, once-only webhook turns a payment into an active subscription and a platform invoice `PINV-YYYY-n` (with the platform tax of 3.7a). Steps:
  1. Set the secrets and settings of 3.7a: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PLATFORM_TAX_*`, `PLATFORM_GST_RATE`, `PLATFORM_VAT_*`, `BILLING_GRACE_DAYS`. Use **test** keys on staging, live keys only on production. A gateway whose secret is missing refuses to work.
  2. Register the webhooks in each dashboard (the signature is the credential): Stripe `https://api.<domain>/api/v1/billing/webhooks/stripe`, Razorpay `https://api.<domain>/api/v1/billing/webhooks/razorpay`. Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Razorpay events: `payment_link.paid`, `payment_link.expired`, `payment.failed`. Also subscribe to the subscription and invoice events your dashboard offers for renewals (check the list against `backend/src/services/billing/` on the first test).
  3. **Never set `BILLING_GATEWAY=mock` or `TEST_MODE` on staging or production.**
  4. What happens when payment fails: the agency stays fully usable for `BILLING_GRACE_DAYS` (default 7), then turns read-only: every write answers 402, nothing is deleted, and paying restores it. A trial-ending email is sent. Known gaps: an expired trial cannot sign in to reach Billing; nothing re-prices the gateway subscription when the 24-month founder lock ends (put a reminder in the calendar for each founder agency); the console tenant page shows billing fields (status not recorded).
  How you know: a test-mode checkout makes the subscription active, the invoice appears, a repeated webhook changes nothing, and a webhook with a bad signature is refused. Phase 6.16 is the full test.
- [ ] **9.9 Prices, markets and allowances (approved 2026-10-21, `docs/PRICING.md`, loaded by master migrations 0026 and 0028).** In the console, Catalogue, check against PRICING.md: 4 plans (trial, Basic, Pro, Enterprise); price rows for the 9 markets **IN, UK, EU, ANZ, WEST, SG, GULF, MY_TH, LK_NP_BD**, each with a **founder** row valid from **2026-11-01 to 2027-03-31** (20% lower, locked for 24 months on the subscription) and a **list** row valid from **2027-04-01** (before any window opens the earliest row is used). The landing page and the console show the founder prices. A plan with no price in an agency's market gives `PRICE_NOT_CONFIGURED` (409) and the agency cannot pay online: add the row (Catalogue, or `POST /admin/catalogue/prices`) before selling in that market. Allowances: AI credits, emails, login codes, call minutes, and WhatsApp as **two lines**: **utility** (service and utility templates, loaded by 0028 as 20 / 250 / 750 / 2,000 a month; check in the console which plan each number belongs to) and **marketing** (loaded as 10 / 50 / 200 / 500), each with its own cap, its own packs (offered per market) and its own 402. Campaigns and promotional templates count as marketing; everything else paid counts as utility, on Meta and on Twilio. An agency's market row is preferred for allowances, but no per-market rows are loaded; Enterprise numbers for EU/DE, MY_TH and LK_NP_BD are yours to set if wanted. Packs bought carry into the next month.
- [ ] **9.10 Add-on packs and agency payment links (R206, R207).**
  * **Add-ons** (paid by the agency through the same gateway as a one-off Stripe Checkout or Razorpay payment link): extra users (pro rata to the paid year), AI credit packs, SMS, WhatsApp, login-code and email packs, call-minute packs and phone-number rental. A communication pack costs unit cost x (1 + margin), never below cost x 1.2. Card fees (about 2%) bring the 20% margin to about 18%; the owner decides `margin_pct`. Packs are credited exactly once and are good for the month paid and the next. Test every add-on in test mode (6.16).
  * **Agency payment links.** Each agency collects from its own customers with its **own** Razorpay or Stripe account (keys pasted in Settings, Integrations; stored sealed, only the last four characters shown). `CREDENTIALS_KEYS` must be set or saving fails. The agency pastes its own webhook URL, shown in that screen, into its gateway dashboard: `https://api.<domain>/api/v1/webhooks/payments/<agency key>/<razorpay|stripe>` (signed with the agency's secret; Razorpay events `payment_link.*`, Stripe `checkout.session.completed`). Invoices then carry a "Pay online" link for the balance due in the invoice currency; replacing a link cancels the old one. Phase 6.17 is the test, and the pilot agency repeats it.
- [ ] **9.11 Privacy (R208).** Set `UNSUB_SECRET` (3.1). Built: consent records checked on every marketing send, signed public unsubscribe links with `List-Unsubscribe` headers, contact export (a signed 15-minute download), erasure (hard delete and anonymise; invoices are kept), a cookie notice on the landing page. Gaps: bulk import and export files in R2 are not rewritten on erasure; the invoice free-text rewrite is case-sensitive. **A lawyer reviews the privacy policy, data processing agreement, sub-processor list, erasure scope and consent wording before go-live.** Data regions are deferred (single location).
- [ ] **9.12 Two-factor, passwords and feature switches.**
  * **Passwords:** new and changed passwords need 12 or more characters (change, reset, invite). Existing users with shorter passwords keep signing in: **change every seeded password such as `Admin@123` before go-live**, and never run the demo seed against production.
  * **Two-factor (R209):** each user can turn on an authenticator app with recovery codes; an agency admin can reset it for a user; Settings, Security, "require two-factor sign-in" makes it compulsory for the agency (a user who has not set it up gets a setup-only session). It needs `CREDENTIALS_KEYS`. The console (operator) has no two-factor yet.
  * **Feature switches (R127):** console, **Features**. One order decides: platform switch off, then the agency override, then the plan. A plan grid switches a feature for every agency on that plan; the per-agency panel overrides one agency ("follow plan" removes the override). Switching a feature **off** for the platform needs a reason and is audited; results are cached 60 seconds. A feature off for everyone answers `FEATURE_DISABLED` (no upgrade offer); a feature the plan lacks offers an upgrade.
- [ ] **9.13 Agency websites on WordPress (optional; needed only if you sell websites).** One shared WordPress Multisite on the Oracle Cloud free machine (owner, 2026-10-21); details and numbers in `docs/ops/WORDPRESS-HOSTING.md`. Steps: (1) `cd terraform/oracle`, fill `terraform.tfvars` (OCI keys, region `ap-mumbai-1`, image, SSH key), keep the sizing defaults (2 OCPUs, 12 GB, 100 GB), `terraform init && terraform apply` (retry on "out of capacity"); (2) put the machine's IP in `oci_instance_ip` in `terraform/terraform.tfvars` and apply the main root, which creates **DNS-only** (grey cloud) records `*.sites` and `wp-api` (or add them by hand); (3) on the machine copy `oci-provisioner/` to `/opt/wp-shared/stack`, copy `shared.env.example` to `.env`, fill every value (the same `PROVISIONER_SECRET`, 24 or more characters), run `docker compose -f docker-compose.shared.yml --env-file .env up -d --build`; Caddy gets a Let's Encrypt certificate per site on first visit (about 50 new certificates a week, so create at most about 40 sites a week); (4) **WordPress cannot send its password-reset email until you add an SMTP mu-plugin** that uses the platform's SendGrid SMTP credentials (`/opt/wp-shared/html/wp-content/mu-plugins/smtp.php`); (5) set on the API Worker `OCI_PROVISIONER_URL=https://wp-api.<domain>`, `PROVISIONER_SECRET`, `WP_SITES_DOMAIN=sites.<domain>` (3.7a); no path-rewriting proxy may sit in front of the provisioner; (6) check `curl https://wp-api.<domain>/health`, then create one site end to end from the console (WordPress page, or an agency's Website tab) and open it. Requests are signed (300-second window); a site goes queued, provisioning, active or failed with up to 3 attempts, and the console can retry. The agency gets a "website ready" email without any password. Capacity (about 88 sites on 12 GB) is an assumption: do the 10-site load check. Oracle may reclaim an idle free machine; set up the nightly backup in the hosting document. A custom domain per agency is not built.
- [ ] **9.14 Languages (R210, R211).** English is complete. Arabic (811 keys, right-to-left, Latin digits) and Hindi (62%, draft) are AI drafts: **a native reader must review them before customers see them** (Gulf terms for leads, credit notes, vouchers, rate cards and fleet; weekday abbreviations; sign-in and two-factor wording; placeholder order). Page bodies are not all translated and API error messages appear as received.

How you know: a real SMS and a real login code reach a phone in India; a WhatsApp test message reaches the inbox of the right agency; a test-mode payment activates a subscription; an unsigned or wrongly signed webhook call is refused. If it fails: a login code that never arrives and a Twilio error "invalid" usually means Verify service or sender not approved; webhook 403 means `API_PUBLIC_URL` differs from the URL Twilio calls or the token is wrong.

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
  - [ ] Prices and caps in the console match `docs/PRICING.md` for every market you sell in (9.9); trial length decided.
  - [ ] Subscription payment, add-on pack and agency payment link tested in test mode, then once with a small live payment (9.8, 9.10); `BILLING_GATEWAY` and `TEST_MODE` unset.
  - [ ] Seeded passwords such as `Admin@123` changed; two-factor tried (9.12); operator password long and in the vault.
  - [ ] Legal pages, consent wording and privacy tools reviewed by a lawyer (5.8, 9.11); the landing page makes no claim you cannot show.
  - [ ] Arabic and Hindi reviewed by a native reader, or those languages not offered (9.14).
  - [ ] Email: Cloudflare onboarding done or knowingly left on the SendGrid fallback; a reply from Gmail reaches the inbox (9.1a).
  - [ ] If WhatsApp, calling or websites are sold: 9.3, 9.6 or 9.13 done, including one real message, call or site.
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
  * SendGrid: bounces, spam reports, blocked sends; Cloudflare Email logs for platform mail. Twilio: spend today against each agency's cap; login-code count (about 13 rupees each). Console flags from calling (spend spike, fraud) and the email at `SUPER_ADMIN_EMAIL`.
  * Payments: failed renewals and agencies in grace or read-only (402), webhook errors in the Stripe and Razorpay dashboards, `PRICE_NOT_CONFIGURED` complaints.
  * Console usage and usage alerts: any agency near its caps; any agency using far more than its plan assumes.
  * Cloudflare: Workers requests and errors, D1 size per agency, Durable Object duration (INFRA.md 8), the first invoice at the end of the month.
  * Enquiries from the landing form answered the same day (`GET /api/v1/admin/enquiries`).
  * Sign-in failures and rate-limit hits (`429`) in the logs: a flood means abuse, a trickle means users forgetting passwords.
  * Sunday backup ran (Actions tab, Weekly backup, green); check the folder in R2.
  * Pilot agency feedback call at day 3 and day 7; write every complaint down.

How you know the pilot is healthy after a week: the pilot agency uses the app daily without operator help, no unexplained errors, spend per agency is inside the plan's caps, and every item in the watch list has a named owner. If it is not: do not add a second agency until the cause is fixed; use the rollback plan for anything that damages data.

## Appendix: facts this runbook rests on

* Master database tables and migrations: `backend/drizzle/master` (highest `0028_pricing_step_b`), agency migrations `backend/drizzle/tenant` (highest `0056_email_undeliverable`).
* Generated production config rules and scripts: INFRA.md sections 6 and 7.
* Faults list: INFRA.md section 11. The faults the first version of this runbook worked around (queues missing from terraform, `--from-d1-remote` and the placeholder id, the Oracle VM in every apply, desktop auto-update off, unsafe `push-secrets.sh` and `sync-config.sh`, web pages behind email links not hosted, mixed domain names, example terraform values) were fixed by R125 and are listed there as fixed.
* Calling: built, Twilio only, not marketed at launch, outside India and the excluded markets (ADR-001 owner decisions 2026-10-15 and 2026-10-21).
* Billing, add-on packs, agency payment links, the tax engine, privacy tools, languages, feature switches and shared WordPress hosting are built and tested against mocks only. Selling outside India is possible once the markets' prices are checked (9.9) and the lawyer, accountant and native-language reviews are done.
* The last full end-to-end run (2026-10-21): 818 passed, 0 failed, 73 skipped (multi-agency specs skip on a single stack); backend 106 files / 2,074 tests; desktop 95 files / 1,548 tests. Build verification: `docs/BUILD-VERIFICATION.md`.
* Deferred by the owner on 2026-10-21: repository privacy and key rotation (R100, phase 0) and data regions (R212).
