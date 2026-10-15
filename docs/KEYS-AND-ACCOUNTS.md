# Keys and accounts

Written 2026-10-15 and updated the same day for batches R125, R301 and R302. Every account, key and certificate the platform needs, in three groups: what you need today for local work (nothing), what is optional today (turns a mocked check into a real one), and what you need to go live. Names of secrets match `backend/src/types.ts` and `docs/INFRA.md` section 5; the order of steps is in [GO-LIVE.md](GO-LIVE.md).

Rules that apply to everything below:

* **Who holds an account matters.** Open every provider and payment account in the name of the legal entity that will invoice customers (owner question Q10 is still open: which entity). Use a shared company mailbox such as `ops@<your domain>` as the login email, not a personal one, and turn on two-step sign-in everywhere.
* **Keep one password manager vault** for the company with these items: every key below, the Android keystore and its passwords, the Windows certificate, the `CREDENTIALS_KEYS` value, and recovery codes. Losing `CREDENTIALS_KEYS` makes stored agency provider keys unrecoverable.
* **Never** put a real key in the repository, in `landing/config.js`, or in a `NEXT_PUBLIC_*` variable (those are public). Local files `backend/.dev.vars`, `desktop/.env.local`, `terraform/terraform.tfvars` and `packages/driver_app/android/key.properties` are git-ignored; keep them that way.
* **Everything that was ever in the public repository is compromised.** Production must use brand-new values for every secret (GO-LIVE phase 0).
* Prices below are list prices from `docs/COST-MODEL.md` (retrieved October 2026, some from third-party trackers); get a current quote before paying.

## 1. Needed now for local work

**Nothing.** The local stack runs on placeholder values copied from `backend/.dev.vars.example`; the tests bring their own values; mail goes to a local outbox; paid APIs are not called (remote Workers AI is opt-in with `fix-stack --ai`, and no test uses it).

One owner action, not a key: make the GitHub repository `sn-arjun/travel-crm` private and revoke the old token (GO-LIVE phase 0).

## 2. Optional now (makes a local check real instead of mocked)

| Account or key | What it checks | Who holds it | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| SendGrid free account, one verified sender | A real welcome email from the "create agency" flow | Owner | `SENDGRID_API_KEY`, `EMAIL_FROM` in `backend/.dev.vars` | Free (100 emails a day for 60 days) | Sign up at https://sendgrid.com, Settings, Sender Authentication, verify a single sender address; Settings, API Keys, create a key with "Mail Send" permission |
| Twilio trial account | Real SMS or login-code delivery (trial accounts can only text verified numbers) | Owner | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM_NUMBER` in `backend/.dev.vars` | Trial credit; afterwards SMS to India costs about 8.06 rupees each | Sign up at https://console.twilio.com; create a Verify service under Verify, Services; buy or use the trial number |
| Second Cloudflare account (staging) with the Workers Paid plan and a token | Real D1 create, queues, deploy, Time Travel restore, the whole staging rehearsal (GO-LIVE phase 6) | Owner | Staging deploy token in your shell or in GitHub secrets | $5 a month while it exists | https://dash.cloudflare.com sign up with a different email; Workers and Pages, Plans, Workers Paid |
| Stripe test keys and Razorpay test keys | Nothing yet: billing is Tier 2 and no code reads a Stripe or Razorpay key today. Create them only when that work starts | Owner | not used | Free in test mode | https://dashboard.stripe.com and https://dashboard.razorpay.com, test mode |
| Cloudflare Turnstile test keys | The landing form's bot check | Owner | Site key in `landing/config.js`, secret in `TURNSTILE_SECRET` | Free (not in COST-MODEL; confirm) | Cloudflare dashboard, Turnstile, Add widget. Cloudflare also publishes always-pass test keys in its Turnstile documentation |
| Error-reporting project (Sentry-compatible) | That server errors reach a real inbox | Owner | `ERROR_REPORTER_DSN` | Free tier exists at most providers (not in COST-MODEL; confirm) | https://sentry.io, create a project, copy the DSN (looks like `https://<key>@<host>/<id>`) |
| Google Maps key | Address autocomplete in the desktop app | Owner | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `desktop/.env.local` (public by nature; restrict it by referrer or app) | 10,000 autocomplete requests a month free, then $2.83 per 1,000 | https://console.cloud.google.com/apis, enable Places API, create an API key; needs a billing account |
| Anthropic API key | Real AI extraction | Owner | `ANTHROPIC_API_KEY` | Haiku 4.5: $1 per million input tokens, $5 per million output | https://console.anthropic.com. **Cost rule:** do not use in tests; metered usage |
| Meta WhatsApp test number, Deepgram key | Nothing yet: the code for these is not built (Tier 3) or optional. (Exotel was dropped on 2026-10-15) | Owner | not used | Deepgram $200 free credit | See section 3 when the work starts |

## 3. Needed at go-live

Reference prices: see COST-MODEL section 1. "Holder" is the person or entity who must be able to log in and approve changes.

### 3.1 Domain and Cloudflare

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| Domain name | One address family: `<domain>` (landing), `www`, `api.<domain>`, `admin.<domain>`, `app.<domain>` (agency web app), `downloads.<domain>`, and the sender domain for email. Every toolchain uses the placeholder `YOUR-DOMAIN.example` until you decide (question Q11) | Owner (entity) | Set once per toolchain (GO-LIVE 0.8): terraform `domain` (`terraform.tfvars` or `TF_VAR_domain`); `TRAVELCRM_DOMAIN` in `landing/config.js`; `super-admin/src/lib/domain.ts`; `DOMAIN` when generating the backend config; `PLATFORM_DOMAIN` in `desktop/wrangler.toml`; `DOMAIN` when building the installer; GitHub variable `TRAVELCRM_DOMAIN`. `APP_URL`, `API_URL`, `CORS_ORIGINS`, `EMAIL_FROM` are derived from it | `.com` about $10.46 a year, `.pro` about $21.20 a year at Cloudflare Registrar (third-party tracker) | Register at https://dash.cloudflare.com (Domain Registration) or any registrar. If registered at Cloudflare the zone already exists: see GO-LIVE phase 2 (`terraform import`) |
| Cloudflare account, Workers Paid plan | Hosts everything. Paid plan is required for D1 limits, queues and Durable Objects | Owner | n/a | $5 a month minimum plus usage (small; COST-MODEL 1.1) | https://dash.cloudflare.com sign up, then Workers and Pages, Plans, Workers Paid. Note the **Account ID** (right side of the dashboard overview) |
| Deploy token (`CLOUDFLARE_API_TOKEN`) | Terraform, wrangler deploys, migrations, Pages deploys, backups from your machine | Owner | Shell variable `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; terraform `cloudflare_api_token`, `cloudflare_account_id`; the GitHub secrets of the same names | Free | https://dash.cloudflare.com/profile/api-tokens, Create Token, Custom. Account permissions: Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, D1 Edit, Queues Edit, Cloudflare Pages Edit, Workers AI Read, Account Settings Read. Zone permissions (all zones or your zone): Zone Edit, DNS Edit, Workers Routes Edit. If terraform or wrangler names a missing permission, add it |
| Runtime provisioning token (`CF_API_TOKEN`) | Lets the running API create each new agency's database and attach it. Narrower than the deploy token | Owner | Worker secret `CF_API_TOKEN` (with `CF_ACCOUNT_ID`) | Free | Same page; Account permissions only: D1 Edit, Workers Scripts Edit |
| Backup token | The weekly dump job (`.github/workflows/backup.yml`, also by hand): reads databases, writes to R2 | Owner | GitHub secrets `CLOUDFLARE_API_TOKEN` (this token), `CLOUDFLARE_ACCOUNT_ID` and `CF_D1_MASTER_ID`, plus the variable `TRAVELCRM_DOMAIN`; or the environment of a hand run | Free | Same page; D1 Read (add D1 Edit if the first dump complains), Workers R2 Storage Edit |
| R2 access keys for terraform state | Terraform stores its state file in the bucket `terraform-state` | Owner | Shell variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` while running terraform; GitHub secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 free tier covers it | Dashboard, R2, Manage R2 API Tokens, create an Object Read and Write token for that bucket |
| Cloudflare Turnstile widget | Bot check on the landing form (optional) | Owner | Site key in `landing/config.js`; secret in `TURNSTILE_SECRET` | Free (confirm) | Dashboard, Turnstile, Add widget for the landing domain |

### 3.2 Generated secrets (you make these; no account)

Run each command in a terminal at the repository root (Node 22 is installed). Each prints one value; copy it to the password manager first, then set it where the table says. Use a **different** value for every row, and different values for staging and production.

| Secret | Used by | Generation command | Where it goes |
|---|---|---|---|
| `JWT_SECRET` | API | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` | Worker secret (backend) |
| `JWT_REFRESH_SECRET` | API | same command, run again | Worker secret (backend) |
| `SUPER_ADMIN_JWT_SECRET` | API and console (same value in both) | same command, run again | Worker secret on both `travelcrm-api` and `travelcrm-super-admin` |
| `CREDENTIALS_KEYS` | API | `node -e "console.log(JSON.stringify({k1: require('crypto').randomBytes(32).toString('base64')}))"` | Worker secret (backend). Also set `CREDENTIALS_ACTIVE_KEY_ID` to `k1`. Keep a copy forever |
| `HEALTH_TOKEN` | API; uptime monitor header `X-Health-Token` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Worker secret (backend) and the monitor |
| `INBOUND_EMAIL_SECRET` | SendGrid Inbound Parse URL path | same as `HEALTH_TOKEN` | Worker secret (backend), and in the SendGrid Inbound Parse URL |
| First operator password | Console sign-in | A long passphrase of 12 or more characters you make up | Typed once into `create-super-admin.mjs`; stored only as a hash. Keep in the password manager |
| `UNSUB_SECRET`, `PROVISIONER_SECRET` | Later tiers (mentioned in READINESS-PLAN section 7) | `UNSUB_SECRET` is read by no code. `PROVISIONER_SECRET` is read only by `oci-provisioner/src/server.ts`, which falls back to the default `change-me` when unset: never run that service until it is set | Nothing to do until Tier 3 |

### 3.3 Email, messaging and calling

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| SendGrid, paid plan, domain authenticated | All system and agency email; welcome mails must land in inboxes | Owner | `SENDGRID_API_KEY`; `SENDGRID_WEBHOOK_PUBLIC_KEY` (from Signed Event Webhook); `INBOUND_EMAIL_SECRET`; `EMAIL_FROM`, `EMAIL_FROM_NAME`, `PLATFORM_SUPPORT_EMAIL` | Free trial 100 a day for 60 days; Essentials from $19.95 a month; Pro from $89.95 | https://sendgrid.com. Settings, Sender Authentication, Authenticate Your Domain (adds SPF and DKIM records at your DNS); Settings, API Keys (Mail Send); Settings, Mail Settings, Event Webhook with signature verification; optional Inbound Parse |
| Twilio, upgraded account | SMS, WhatsApp senders, login codes (Verify) | Owner | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM_NUMBER`; callbacks in the Twilio console | SMS to India about 8.06 rupees each; login code about 12.90 rupees; WhatsApp about 0.48 rupees on top of Meta's own fee (COST-MODEL 1.5 to 1.7) | https://console.twilio.com: upgrade, add funds, create a Verify service, buy a number. Indian SMS needs sender registration (DLT) done by you; the domestic Indian route is not in v1 |
| Meta (WhatsApp Business) business verification | Approving WhatsApp senders and message templates, which Twilio routes through Meta | Owner (legal entity) | Sender configured in Twilio; each agency's number registered in the platform (`tenant_channel_addresses`) | Meta fee per conversation (COST-MODEL 1.5) | https://business.facebook.com, create a Business Account and start verification (company documents); then add a WhatsApp sender in the Twilio console. Allow days to weeks. A direct Meta Cloud API integration is not built |
| Exotel (India calling) | **Dropped** by the owner decision of 2026-10-15: no calling for agencies in India (also none in the Gulf, Thailand, Sri Lanka, Nepal, Bangladesh) | n/a | n/a | n/a | Nothing to do |
| Twilio calling | Resold calling, Twilio only, for UK, US, AU, Singapore (Germany and Malaysia second wave). Not marketed at launch | Owner | Same Twilio account (sub-account per agency, to be built). Setting `VOIP_CALLING_COUNTRIES` (default GB,US,AU,SG; Worker secret via `wrangler secret put`); production must run with `ENVIRONMENT=production`; each agency needs its country set. Twilio voice callbacks must be `<API_PUBLIC_URL>/api/v1/voip/...` (GO-LIVE 9.2, 9.6) | Per-minute at provider cost + 20% (COST-MODEL 6) | Nothing to create until you switch calling on |
| Plivo | Dropped (could not sign up) | n/a | Leave `PLIVO_*` empty | n/a | n/a |

### 3.4 AI and other platform providers

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| Anthropic (Claude) | AI extraction (model `claude-haiku-4-5-20251001`), metered in AI credits | Owner | `ANTHROPIC_API_KEY` (Worker secret) | $1 per million input tokens, $5 per million output | https://console.anthropic.com, add credit, create an API key; set a monthly spend limit |
| Workers AI | Message labelling, extraction, summaries | Part of Cloudflare | binding `AI` (no key) | Per use; 10,000 free neurons a day | Nothing to create |
| Deepgram (optional) | Transcribing call recordings | Owner | `DEEPGRAM_API_KEY` | Nova-3 $0.0043 a minute; $200 free credit (the code calls `nova-2`, whose price was not found) | https://console.deepgram.com. Skip until calling exists |
| Google Maps | Address autocomplete and lookups | Owner | `GOOGLE_MAPS_API_KEY` (Worker); `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (desktop build; restrict by app); driver app key if used | 10,000 free autocomplete requests a month, then $2.83 per 1,000 | https://console.cloud.google.com/apis; Places API; billing account required |
| Firebase (push) | Push to drivers. **Not needed at launch:** the code uses the retired legacy server key and the driver app has no push library. A later batch moves to the current API with a service account (a JSON file, stored as a secret, not an API key) | Owner | `FCM_SERVER_KEY` stays empty | Free (FCM) | https://console.firebase.google.com, when that batch is done; Project settings, Service accounts |
| Error-reporting DSN | Server errors with request and agency ids | Owner | `ERROR_REPORTER_DSN` (Worker secret) | Free tier at most providers (confirm) | https://sentry.io or any Sentry-compatible service; copy the project DSN |
| Uptime monitor | Calls the deep health check and alerts you | Owner | Header value = `HEALTH_TOKEN` | Free tiers exist (not in COST-MODEL) | Any monitor (UptimeRobot, Better Stack, ...): URL `https://api.<domain>/api/v1/health/deep`, custom header `X-Health-Token`, alert on non-200 |

### 3.5 Billing (Tier 2: not built; plan the accounts now, nothing reads them yet)

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| Razorpay | Indian subscription payments (UPI, cards, net banking) | Owner (legal entity) | Not read by any code yet | 2% per transaction plus 18% GST on the fee; 0.9% extra for card subscriptions | https://dashboard.razorpay.com, complete business KYC |
| Stripe | International subscriptions | Owner (legal entity) | Not read by any code yet | About 3% international cards plus 0.7% Billing; whether Stripe is open to a new Indian entity was not researched | https://dashboard.stripe.com; check India availability first |

### 3.6 Apps and signing

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| Windows code-signing certificate (OV or EV) | Signed installer so Windows SmartScreen does not warn customers | Owner (legal entity); the private key on a hardware token or hosted signing service | `CSC_LINK` (path or base64 of the `.pfx`) and `CSC_KEY_PASSWORD` on the build machine | About $129 to $439 a year depending on the authority, plus about $15 a month if the key is hosted (sources disagree; get a quote). Microsoft's hosted signing is **not open to Indian organisations** | Buy from a certificate authority (Sectigo, DigiCert, SSL.com and others). Identity checks take days. An EV certificate removes SmartScreen warnings fastest; an OV certificate builds reputation over time. Many CAs now require the key on hardware, in which case builds run on the machine holding the token |
| Android upload keystore | Signs every Play release of the driver app. If you lose it, Play can reset it only through support | Owner personally (not a contractor) | A `.jks` file outside the repository and `packages/driver_app/android/key.properties` (copy of `key.properties.example`) on the build machine only | Free | `keytool -genkeypair -v -keystore C:/secure/travelcrm-driver-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000` (keytool ships with Java; the driver app uses Java 17). Write the two passwords in the password manager. Enable Play App Signing at the first upload |
| Google Play Console account | Publishing the driver app (`com.travelcrm.driver_app`) | Owner (entity) | n/a | $25 one time | https://play.google.com/console (identity verification; new personal accounts have extra testing rules before production, check the current page) |
| Apple Developer Program | iOS driver app (`com.travelcrm.driverApp`), also macOS desktop signing and notarisation if you ship it | Owner (entity) | Certificates and profiles on a Mac | $99 a year | https://developer.apple.com/programs/ (an organisation needs a D-U-N-S number) |
| A Mac (or a Mac cloud runner) | iOS and macOS builds; cannot be done on Windows | Owner | n/a | Not in COST-MODEL | Owner decision |
| Update feed host | Where installers and `latest.yml` are served | Part of Cloudflare | Baked into the installer at build time from `DOMAIN` (`https://downloads.<domain>/win/`) or `TRAVELCRM_UPDATE_URL`; customer PCs need no setting | R2: no download fees | R2 bucket `travelcrm-desktop-updates` is made by terraform; give it the public address `downloads.<domain>` in the dashboard (R2, bucket, Settings, Custom Domains) |

### 3.7 Source control and CI

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| GitHub repository (private) | Source code and Actions | Owner | n/a | Private repositories are free for individuals; Actions minutes are limited (not in COST-MODEL) | https://github.com/sn-arjun/travel-crm, Settings, General, Danger Zone, Change visibility, Private |
| New GitHub token | Pushing from your machine. The old token must be revoked first | Owner | Your Git credential manager, never in a remote URL | Free | https://github.com/settings/tokens: revoke the old token, then create a fine-grained token for this repository only (Contents: Read and write), short expiry |
| GitHub Actions secrets and variables | CI deploy workflows | Owner | Repository, Settings, Secrets and variables, Actions | Free | Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_MASTER_ID`, `CF_KV_CACHE_ID`, `CF_KV_SESSIONS_ID`, `CF_KV_REPORT_CACHE_ID`, and for the terraform workflow `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Variable: `TRAVELCRM_DOMAIN` (the other URLs are derived; `APP_URL`, `API_URL`, `CORS_ORIGINS`, `EMAIL_FROM` are optional overrides for the backend deploy). The ids are printed by `terraform output` (GO-LIVE phase 3) |

### 3.8 Oracle Cloud (WordPress sites, Tier 3)

| Account or key | What it is for | Holder | Where it goes | Rough cost | How to create it |
|---|---|---|---|---|---|
| Oracle Cloud account | The VM that will host agency WordPress sites. Not needed to sell the CRM, and **no longer needed by the main terraform apply**: the VM is a separate root, `terraform/oracle/`, applied only in Tier 3 | Owner | Variables of `terraform/oracle` (not of the main root): `oci_tenancy_ocid`, `oci_user_ocid`, `oci_fingerprint`, `oci_private_key`, `oci_compartment_ocid`, `oci_region` (default `ap-mumbai-1`), `oci_image_id`, `ssh_public_key` | Always Free allowance is 2 CPUs and 12 GB (COST-MODEL); the VM asks for 4 CPUs and 24 GB, about $36 a month more if the allowance is as read. "Out of host capacity" errors are possible on free shapes | https://cloud.oracle.com sign up; create an API key in your user profile (it shows the fingerprint and private key); copy the compartment and image OCIDs from the console |

## 4. Summary of where each secret ends up

| Place | What goes there |
|---|---|
| Worker `travelcrm-api` secrets (`bash scripts/push-secrets.sh`, dry run first with `npm run secrets:push:dry`, or `wrangler secret put -c .wrangler.production.toml --env production`) | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_JWT_SECRET`, `CREDENTIALS_KEYS`, `HEALTH_TOKEN`, `ERROR_REPORTER_DSN`, `SENDGRID_API_KEY`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `INBOUND_EMAIL_SECRET`, `TWILIO_*`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `GOOGLE_MAPS_API_KEY`, `TURNSTILE_SECRET`, `CF_ACCOUNT_ID`, `CF_API_TOKEN` (the narrower runtime token), and, only if you change the default list of calling countries, `VOIP_CALLING_COUNTRIES` (by `wrangler secret put`; the script does not push it) |
| Generated Worker config `[vars]` (plain settings; **not** secrets) | `API_PUBLIC_URL`, `ALLOW_LOOPBACK_ORIGINS`, `CREDENTIALS_ACTIVE_KEY_ID`, `TENANT_PROVISIONER`, `CF_WORKER_SCRIPT_NAME`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `EMAIL_FROM`, and from environment variables at generation time `EMAIL_FROM_NAME`, `PLATFORM_SUPPORT_EMAIL`, `QUOTES_URL` |
| Environment variables when you run the config generator (`gen-wrangler.mjs`) | `DOMAIN`, `CF_D1_MASTER_ID`, `CF_KV_CACHE_ID`, `CF_KV_SESSIONS_ID`, `CF_KV_REPORT_CACHE_ID`; optional `EMAIL_FROM_NAME`, `PLATFORM_SUPPORT_EMAIL`, `QUOTES_URL` and overrides of the derived URLs |
| Worker `travelcrm-super-admin` | secret `SUPER_ADMIN_JWT_SECRET`; the domain in `super-admin/src/lib/domain.ts` (or `NEXT_PUBLIC_PLATFORM_DOMAIN` at build); `BACKEND_API_URL` is derived, set it only to override |
| Worker `travelcrm-app` (agency web app) | No secrets. `PLATFORM_DOMAIN` (and optional `INSTALLER_URL`, `DRIVER_APP_URL`) in `desktop/wrangler.toml` |
| Build machine | `CSC_LINK`, `CSC_KEY_PASSWORD`, `DOMAIN` (derives the API address and update feed baked into the installer; `TRAVELCRM_API_URL` and `TRAVELCRM_UPDATE_URL` override), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `android/key.properties` and the keystore |
| `landing/config.js` (public) | Only non-secret settings: API address, site address, contact email, WhatsApp number, Turnstile **site** key, and so on |
| Terraform (`terraform/terraform.tfvars`, git-ignored) | `domain`, Cloudflare token and account id: the only required variables. Remove the example secret lines (they are optional, terraform uses none, and `push-secrets.sh` would read them). Oracle values belong to `terraform/oracle` only |
| GitHub | Actions secrets and variables listed in 3.7 |
| Password manager | A copy of everything above |
