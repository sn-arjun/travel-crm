# ADR-002: Can Cloudflare email replace SendGrid?

- Status: proposed, for owner decision
- Date: 2026-10-20
- Question from the owner: "Can we use Cloudflare email instead of SendGrid? Go or no-go, with a cost analysis."
- All prices are public list prices read on 2026-10-20 unless a line says otherwise. Sources are numbered [E1]... in section 8. Nothing was bought, no account was opened and no vendor was contacted.
- Exchange rate: 1 USD = ₹96.83, the rate `docs/COST-MODEL.md` uses.
- Companion documents: `docs/COST-MODEL.md` (section 1.8 and the email lines), `docs/GO-LIVE.md` (phase 9.1), `docs/KEYS-AND-ACCOUNTS.md` (3.3), `docs/INFRA.md`.

---

## 1. Decision

**NO-GO for Cloudflare as a full replacement for SendGrid. PARTIAL GO: use Cloudflare for the parts it is good at, and move the rest to Amazon SES.**

| Mail | Decision | Why, in one line |
|---|---|---|
| Incoming email (customer emails into the agency inbox) | **GO: Cloudflare Email Routing + an Email Worker** | Free, unlimited, not in beta, and runs inside our own Worker. |
| The platform's own system mail (welcome, invite, password reset, receipts, alerts) | **GO, with a fallback: Cloudflare Email Sending** | Low volume (mostly inside the 3,000 free emails a month), allowed use, no API key to manage. Keep a second provider switched in by one setting, because Cloudflare's sending is still in beta. |
| Agencies' mail to their customers (quotes, reminders, messages from the inbox screen) | **NO-GO for Cloudflare. Use Amazon SES.** | Allowed on Cloudflare, but it shares one reputation with our password-reset mail, it costs 3.5 times SES, and Cloudflare reports no opens or clicks. |
| Agencies' marketing campaigns and flyers | **NO-GO for Cloudflare. Use Amazon SES.** | Cloudflare's own FAQ: "Can I use Email Service for marketing emails? No. Email Service supports transactional email only." [E7] |

In plain words: Cloudflare cannot send our agencies' campaigns, so it cannot replace SendGrid on its own. We need a second provider for campaigns whatever we do. Once we have one, Amazon SES is the cheapest that allows campaigns, and it can also carry the agencies' everyday customer mail. Cloudflare then keeps the jobs where it is free or nearly free: receiving mail, and the platform's own small stream of system mail.

What it saves: at 1,000 agencies, about **$176 a month instead of about $1,099** with SendGrid (section 4). At 10 agencies the saving is about $18 a month, which does not pay for the work on its own. The switch is worth finishing **before about 50 agencies**, where SendGrid's next price step comes in.

### What would change this decision

- **Cloudflare allows marketing mail, leaves beta and reports opens and clicks.** Then move all outbound mail to Cloudflare and drop SES. The `EmailProvider` switch in section 6 makes that a configuration change.
- **AWS refuses or delays SES production access** (every new SES account starts in a "sandbox" and must ask AWS to be let out). Then keep SendGrid for agency mail and campaigns. The Cloudflare parts of this decision still stand.
- **The owner does not want an AWS account.** Same as above: keep SendGrid for agency mail. Cost is then SendGrid's (section 4, row A) and the saving is only the inbound and system-mail part.
- **Agencies must send from their own domain** (`hello@agency.com`). Cloudflare can only send from domains that sit in our own Cloudflare account [E4], so it could never do this. SES, SendGrid and Resend can verify an outside domain. This would strengthen the SES (or SendGrid) half, not change it.

---

## 2. What the product sends today (read from the code)

### 2.1 Where email leaves the code

Four places call SendGrid directly. There is no common interface.

| File | What it does |
|---|---|
| `backend/src/services/sendgrid.ts` | `sendEmail` (HTML, text, cc, bcc, reply-to, attachments, R208 unsubscribe headers and footer), `sendWithTemplate` (SendGrid Dynamic Templates), `sendBulk` (unused). |
| `backend/src/services/email.ts` | A second, smaller `sendEmail` (HTML only). Used by the account-locked notice (`routes/auth.ts:1058`) and by the inbox screen's email channel (`queues/sms-queue.ts:76`). |
| `backend/src/queues/campaign-queue.ts:264` | Its own inline `fetch` to SendGrid for marketing campaigns (with R208 headers). |
| `backend/src/services/mail/transactional.ts` | `sendTransactional`: renders the 14 system templates in `services/mail/templates.ts` and sends through `services/sendgrid.ts`; without a key or in test mode it writes to a KV "outbox" readable at `GET /test/outbox`. |

Every email, system or agency, goes out **from the platform's single address** (`EMAIL_FROM`, default `noreply@<domain>`, `utils/app-urls.ts:25`). No agency has its own sender. The inbox screen's email sets no reply-to, so a customer who replies writes to `noreply@`.

### 2.2 The five kinds of mail

Volumes per agency per month come from `docs/COST-MODEL.md` section 2 (small / medium / large = 500 / 2,000 / 8,000 emails sent; 200 / 700 / 2,000 emails and web forms received; mix 60% small, 30% medium, 10% large). That gives an **average of 1,700 emails sent and 530 received per agency**. COST-MODEL does not split sent mail by kind; the split below is **my assumption**.

| Kind | What is in it (code) | Volume assumption per agency per month | At 10 / 100 / 1,000 agencies |
|---|---|---|---|
| **(a) Platform system mail** | `sendTransactional` templates: `welcome_admin`, `invite_user`, `reset_password`, `password_changed`, 2FA on/off, `platform_enquiry`, `usage_alert`, `payment_receipt`, `payment_failed`, `trial_ending`, `number_release_notice`, `website_ready`, `voip_spend_alert`; plus the account-locked notice (`routes/auth.ts`). Callers: `routes/auth.ts`, `users.ts`, `two-factor.ts`, `settings.ts`, `admin-tenants.ts`, `public-enquiries.ts`, `services/billing/subscriptions.ts`, `metering/usage-alerts.ts`, `voip/numbers.ts`, `voip/fraud.ts`, `wordpress/sites.ts`. | **20** (my assumption; not in COST-MODEL) | 200 / 2,000 / 20,000 |
| **(b) Agency mail to its customers** | Inbox screen "compose" (`routes/communications.ts` → `SMS_QUEUE` → `sms-queue.ts`); scheduled reminders in `cron/auto-reminders.ts` (invoice due and overdue, passport expiry, missing visa documents, trip departing tomorrow, trip feedback) → `EMAIL_QUEUE`; itinerary "send by email" (`routes/itineraries.ts:782`, see 2.3). | **850** (half of 1,700; my assumption) | 8,500 / 85,000 / 850,000 |
| **(c) Agency marketing** | Email campaigns (`routes/campaigns.ts` → `EMAIL_QUEUE`, with `List-Unsubscribe` and `List-Unsubscribe-Post` headers); marketing campaigns (`routes/marketing/campaigns.ts` → `CAMPAIGN_QUEUE` → `campaign-queue.ts`); flyer sharing to a segment (`routes/marketing/flyers.ts:301`). Consent is checked at send time (R208). | **850** (the other half) | 8,500 / 85,000 / 850,000 |
| **(d) Incoming mail** | SendGrid Inbound Parse posts to `POST /api/v1/webhooks/inbound/email/<INBOUND_EMAIL_SECRET>` (`routes/inbound.ts:216`); the receiving address is mapped to an agency through `tenant_channel_addresses`, then `ingestInbound` files it against a contact and lead. | **530** (COST-MODEL; includes web forms, so an upper bound) | 5,300 / 53,000 / 530,000 |
| **(e) Delivery events** | SendGrid Signed Event Webhook at `POST /api/v1/webhooks/sendgrid/events` (`routes/webhooks.ts:98`): delivered, open, click, bounce, dropped, spam report, unsubscribe update `email_message_log`; a hard bounce blanks the contact's email. Campaign screens show opened, clicked and bounced counts from that table. | one to three events per email sent | |

### 2.3 Things found in the code that matter for this decision (all exist today, with SendGrid)

1. **Delivery events never reach a message.** The event webhook finds a message by `email_message_log.message_id`, but no code ever writes that column: `routes/campaigns.ts:278` inserts the row without it, and `queues/email-queue.ts` logs SendGrid's message id but does not store it. So opens, clicks and bounces are never recorded today. Losing SendGrid's webhook therefore loses nothing that works now, but the campaign screens were designed around these numbers, and whichever provider we use, the id must be written back.
2. **Itinerary emails are never sent.** `routes/itineraries.ts:782` puts `{ type: 'itinerary_send', ... }` on `EMAIL_QUEUE` with no `data` field. The consumer (`queues/index.ts:71`) only knows `email`, `sms`, `push` and `wp-provision`, logs "Unknown queue message type" and drops it.
3. **Invoice and voucher "send" do not send email.** `routes/invoices.ts:936` and `routes/vouchers.ts:1078` only change the status; the voucher route says "In production, queue email/whatsapp sending here".
4. **Two campaign systems** send marketing email by two different paths (2.2 c).
5. **The marketing footer has no postal address.** `services/privacy/consent.ts:171` adds only an unsubscribe link. The US CAN-SPAM Act requires a valid physical postal address in commercial email. This is a provider-independent gap.
6. **The hard-bounce handler deletes the contact's email address** (`routes/webhooks.ts:180`). A suppression flag would be kinder to the agency's data. Every provider below keeps its own suppression list, so the product does not need to destroy the address.

These are not caused by the provider choice. Items 1 and 2 should be fixed during the switch because the switch touches the same files.

---

## 3. Capability comparison

"Meets", "partial" or "missing" against what the product needs. Evidence in brackets.

| Need | Cloudflare Email Service | SendGrid (today) | Amazon SES | Postmark | Resend |
|---|---|---|---|---|---|
| Status | **Partial**: Email Sending "now in public beta" since 2026-04-16; no GA in the changelog [E8]. "Features and APIs may change before general availability" [E1]. Email Routing (inbound) is not marked beta. | Meets: established | Meets: established | Meets | Meets |
| Send to any recipient | Meets, on Workers Paid; before a domain is onboarded only to verified addresses [E3] | Meets | Meets after leaving the sandbox (approval by AWS) | Meets | Meets |
| (a) System mail allowed | Meets: "account emails, order confirmations, and alerts" [E1] | Meets | Meets | Meets | Meets |
| (b) Agency customer mail allowed | Meets as transactional; sending on behalf of many customers is not addressed in the docs [E4] | Meets | Meets | Meets | Meets |
| (c) Marketing campaigns allowed | **Missing**: "No. Email Service supports transactional email only." [E7] | Meets (Email API; Marketing Campaigns is a separate product) [E11] | Meets: event types include "Subscription" for list unsubscribes, built for campaigns [E14] | Partial: separate "broadcast" streams [E15] | Meets, but marketing is a separate contact-priced plan [E16] |
| Attachments (quote and invoice PDFs) | Meets: up to 32, total message 5 MiB [E3, E6] | Meets | Meets ($0.12 per GB) [E13] | Meets | Meets |
| cc, bcc, reply-to, custom headers | Meets: 50 recipients per email; header allowlist [E6] | Meets | Meets | Meets | Meets |
| One-click unsubscribe headers (R208) | Meets: `List-Unsubscribe` and `List-Unsubscribe-Post` are allowlisted; HTTPS only [E9] | Meets (code already sends them) | Meets | Meets | Meets |
| SPF, DKIM, DMARC | Meets, set up automatically, but **only for domains in our Cloudflare account and on Cloudflare DNS** [E4, E5] | Meets (CNAMEs at any DNS) | Meets (any DNS) | Meets | Meets |
| Agency's own sending domain | **Missing**: "The domain must remain in the same Cloudflare account" [E4] | Partial: possible, not built | Meets: verify any domain by API | Meets | Meets: 10 domains on Pro, 1,000 on Scale [E16] |
| Bounce and complaint handling, suppression list | Meets: hard bounces suppressed automatically; complaint events; suppression API [E2] | Meets | Meets: account-level suppression list (per region) [E17] | Meets | Meets |
| Delivery events to our code | Partial: delivered, deferred, bounced, failed, rejected, complained, published **to a Cloudflare Queue** (no HTTP webhook) [E10] | Meets: signed webhook (code exists) | Meets: send, delivery, bounce, complaint, reject, delay, subscription, open, click, to SNS or EventBridge [E14] | Meets | Meets: webhooks, all events [E16] |
| Open and click tracking (campaign screens) | **Missing**: no open or click events [E10] | Meets | Meets [E14] | Meets | Meets |
| Incoming mail (d) | Meets: Email Routing, unlimited, an `email()` handler in our Worker; MIME parsing needs the `postal-mime` library; 25 MiB [E12] | Meets: Inbound Parse (code exists) | Partial: inbound at $0.10 per 1,000 plus chunks, through S3/SNS [E13] | Meets on Pro and Platform [E15] | Meets, counts against the sending quota [E16] |
| Dedicated sending address (IP) | Missing: not offered; "managed sending infrastructure" only [E2] | Meets on Pro (1 included) [E11] | Meets: $24.95 per month [E13] | Meets from 300,000 a month, from $50 [E15] | Meets on Scale, $30 [E16] |
| New-account limits | Partial: "New accounts begin with a conservative daily quota and scale up over time"; no figure; increase by form [E3] | 100 a day on the free trial | Sandbox until AWS approves | 100 a month on free | 100 a day on free |
| Fits a Worker with no extra code library | Meets: native `send_email` binding, no API key [E5, E6] | Meets: one HTTPS call | Partial: requests must be signed with AWS SigV4 (a small library such as `aws4fetch`) | Meets | Meets |
| Local testing without sending | Meets: `wrangler dev` simulates the binding and writes mail to local files; `remote: true` sends real mail [E18] | Our KV outbox | Our KV outbox | Our KV outbox | Our KV outbox |
| Service-level promise (SLA) | Not found for the beta | Not checked | Not checked | Not checked | Not checked |
| Data location (GDPR, India DPDP) | Not stated in the pages read | Not checked | Meets: choose the region (Mumbai `ap-south-1` exists) [E19] | Not checked | Not checked |

---

## 4. Cost analysis

### 4.1 Volume assumptions

From section 2.2. Per month.

| | 10 agencies | 100 agencies | 1,000 agencies |
|---|---|---|---|
| (a) System mail | 200 | 2,000 | 20,000 |
| (b) Agency customer mail | 8,500 | 85,000 | 850,000 |
| (c) Marketing | 8,500 | 85,000 | 850,000 |
| **All outbound** | **17,200** | **172,000** | **1,720,000** |
| (d) Incoming | 5,300 | 53,000 | 530,000 |

### 4.2 Unit prices used

| Provider | Price used | Source |
|---|---|---|
| Cloudflare Email Sending | Workers Paid: "3,000 included per month, then $0.35 per 1,000 emails". Not available on Workers Free. | [E0] |
| Cloudflare Email Routing (incoming) | "Unlimited" on Free and Paid. The Email Worker that handles it is billed as Workers requests, which sit inside the $5 plan's included 10 million at these volumes. | [E0] |
| SendGrid Email API | Essentials 50K $19.95; Essentials 100K $34.95; Pro 100K $89.95; Pro 300K $249; Pro 700K $499; Pro 1.5M $799; Pro 2.5M $1,099. Extra dedicated IP $30. Only $19.95 and $89.95 are confirmed on SendGrid's own page today [E11]; the other steps come from a third-party page that says it read SendGrid's pages on 2026-10-02 [E20]. | [E11, E20] |
| Amazon SES | $0.10 per 1,000 emails sent; $0.12 per GB of attachments; incoming $0.10 per 1,000 plus $0.09 per 1,000 chunks; dedicated IP $24.95 a month. New AWS customers get up to $200 in free credits for 6 months (left out below). | [E13] |
| Postmark Pro | $16.50 a month with 10,000 emails, then $1.30 per 1,000; incoming included on Pro; above that "contact us". | [E15] |
| Resend | Pro $20 (50,000), $35 (100,000); Scale $90 (100,000), $160 (200,000), $350 (500,000), $650 (1M), $825 (1.5M), $1,150 (2.5M); incoming mail counts toward the quota. | [E16] |

### 4.3 Monthly cost, US dollars (rupees in brackets for the two rows that matter)

Rule: the smallest published plan that covers the volume. My arithmetic.

| Option | 10 agencies | 100 agencies | 1,000 agencies | Notes |
|---|---|---|---|---|
| **A. SendGrid for everything (today)** | **$19.95** (₹1,932) | **$249** (₹24,111) | **$1,099** (₹1,06,416) | Essentials 50K; Pro 300K; Pro 2.5M. Inbound Parse and event webhook assumed included (not verified). If SendGrid's overage of about $0.001 an email applies [E20], 100 agencies could be $162 (Pro 100K + 72,000 extra) and 1,000 agencies $1,019 (Pro 1.5M + 220,000 extra). |
| B. Cloudflare for everything (hypothetical) | $4.97 | $59.15 | $600.95 | (17,200 − 3,000) × $0.35/1,000, and so on. **Not allowed**: half of this volume is marketing [E7]. Shown only to answer the question. |
| C. Cloudflare for (a)+(b), SES for (c) | $2.85 | $37.90 | $388.45 | Cloudflare: (8,700 − 3,000) × 0.35/1,000 = $2.00; 84,000 → $29.40; 867,000 → $303.45. SES: 8,500 → $0.85; 85,000 → $8.50; 850,000 → $85. |
| **D. Recommended: Cloudflare for (a) and (d), SES for (b)+(c)** | **$1.70** (₹165) | **$17** (₹1,646) | **$176** (₹17,042); **$201** (₹19,463) with a dedicated IP | Cloudflare (a): 200 and 2,000 are inside the free 3,000; 20,000 → 17,000 × 0.35/1,000 = $5.95. SES: 17,000 → $1.70; 170,000 → $17.00; 1,700,000 → $170. Incoming on Cloudflare: $0. |
| E. SES for everything outbound, Cloudflare for incoming | $1.72 | $17.20 | $172 | Cheapest, but the beta risk of Cloudflare disappears and so does the isolation of system mail (see 5.2). |
| F. Postmark for everything | $25.86 | $227.10 | $2,239.50 | $16.50 + extra at $1.30/1,000. At 1,000 agencies Postmark would quote custom pricing; list price shown. |
| G. Resend for everything | $20 | about $180 | $1,150 | Incoming counts: 22,500 / 225,000 / 2,250,000. 100 agencies = Scale 200K $160 plus 25,000 extra (the exact overage rate for that step was not shown). Marketing may need Resend's separate contact-priced plan, which is not included. |

Not in the rows: the Cloudflare Workers Paid plan ($5) is already paid for the API, so it adds nothing. SES events go through Amazon SNS or EventBridge, which charge per notification; at 1,000 agencies that is a few million notifications a month, which I expect to be a few dollars, **not verified**. Attachments on SES add $0.12 per GB.

### 4.4 One-off costs

| Item | Cost |
|---|---|
| Dedicated sending address (IP) | Not needed at 10 or 100 agencies (shared pools are normal at this volume). At 1,000 agencies: SES $24.95 a month; SendGrid Pro includes one. A new dedicated IP must be **warmed up**: start with a few hundred emails a day and raise it over several weeks. Shared IPs need no warm-up. |
| Cloudflare new-account quota | "Conservative daily quota" that grows with good sending [E3]. No figure is published. File the limit-increase form before launch. Free. |
| SES production access | A form in the AWS console describing how we collect consent and handle bounces. Free; takes from a day to several days; can be refused. |
| DNS records | Free; done by the owner in the Cloudflare dashboard (section 6.4). |
| Domain warm-up for the new SES sending subdomain | No money; two to four weeks of gradually increasing campaign volume. Until then keep large campaigns on SendGrid or cap them. |

### 4.5 Hidden costs

- **Engineering time: about 7 to 9 developer-days** (my estimate): provider interface and SendGrid adapter with no change in behaviour (1 day); Cloudflare incoming-mail handler (1 to 1.5 days); Cloudflare sending adapter and its event queue (1 day); SES adapter, signed SNS webhook, suppression handling (2 to 3 days); writing the message id back so events and campaign numbers work (1 day, needed with any provider); tests, runbook and key documents (1 day).
- **Break-even.** Savings against SendGrid (option A minus D): about $18 a month at 10 agencies, $232 at 100, $923 at 1,000. At 10 agencies the work does not pay for itself on money alone; the reasons to do it early are the free incoming mail, the end of the second SendGrid key and webhook to manage, and separating system mail from agency mail. SendGrid's price jumps from Essentials ($34.95 for 100,000) to Pro ($249 for 300,000) at about **58 agencies** (100,000 ÷ 1,720). Have the switch done before about 50.
- **Deliverability risk during the move.** A new sending domain and a new provider start with no history. Expect some mail in spam for the first weeks unless volume is ramped up. This matters most for campaigns.
- **Losing SendGrid's event webhook.** Today it records nothing (2.3 item 1), so nothing is lost in practice. With option D, opens and clicks come from SES; Cloudflare would only report deliveries, bounces and complaints for system mail, which is all system mail needs.
- **Losing SendGrid Dynamic Templates.** `email_campaigns.template_id` and `sendWithTemplate` use them. Neither Cloudflare nor our plan uses them; campaigns would send their own HTML body. Nothing is deployed, so no agency depends on them yet.
- **Two vendors instead of one.** Two consoles, two sets of DNS records, two places to watch. SES also means an AWS account, its billing and its security (an access key with send-only permission).

---

## 5. Risks

1. **Cloudflare sending is a beta.** APIs "may change before general availability" [E1]; no SLA was found; new accounts start with an unknown daily cap [E3]. *Mitigation:* use it only for low-volume system mail, behind a setting that switches system mail to SES (or SendGrid) without a code change; file the limit increase before launch; watch Cloudflare's changelog.
2. **One reputation shared by every agency.** All agency mail goes out from the platform's domain. One agency that buys a list and gets spam complaints can push all agencies' mail into spam. If system mail shared that path, password resets would suffer too. *Mitigation:* system mail on Cloudflare and agency mail on SES keep them on different infrastructure; send agency mail from a separate subdomain (`mail.<domain>`); keep the existing per-agency monthly caps (R110); add a rule that pauses an agency's campaigns when its complaint rate passes 0.1% (Cloudflare's own guidance is complaints under 0.1% and hard bounces under 2% [E2]). AWS also offers multi-tenant reputation features in SES; **not checked**.
3. **Using Cloudflare for marketing would break its terms.** The FAQ is explicit [E7]. Some of our "reminder" automations are promotional in tone ("Planning your next trip?", "Welcome back! How was the trip?" in `services/automation/recipes.ts`). *Mitigation:* the provider interface takes a `stream` of `system`, `transactional` or `marketing`, and only `system` may go to Cloudflare.
4. **Lock-in.** Cloudflare sending works only for domains in our Cloudflare account and on Cloudflare DNS [E4, E5]. The platform's domain is planned to be (COST-MODEL 1.12 prices it at Cloudflare Registrar, and every runbook puts its DNS on Cloudflare; the domain itself is not chosen yet), so this is acceptable for system mail. It rules Cloudflare out for agencies' own domains. *Mitigation:* the interface keeps every provider replaceable by configuration.
5. **SES approval.** AWS can refuse production access for a multi-tenant sender. *Mitigation:* apply early with a clear consent and bounce-handling description (we have R208 consent records and one-click unsubscribe); keep SendGrid until approved.
6. **Compliance (any provider).**
   - **CAN-SPAM (US):** commercial email needs a working unsubscribe (we have one) and **a valid physical postal address** (we do not; 2.3 item 5). Needed before selling to US agencies.
   - **Gmail and Yahoo bulk-sender rules:** one-click unsubscribe headers, SPF, DKIM and DMARC alignment, low spam rates. The code already sends the headers; Cloudflare accepts them [E9].
   - **GDPR (UK/EU) and India DPDP:** the email provider processes customers' personal data for the agency, so it needs a data processing agreement and a known data location. SES lets us choose the region; Cloudflare's pages did not state where Email Sending processes mail. Read Cloudflare's and AWS's data processing terms before go-live (**not done here**).
   - **Consent:** R208 checks marketing consent at send time; that does not change with the provider.

---

## 6. Migration plan (PARTIAL GO, option D)

No step below runs any account-touching command. All account and DNS steps are the owner's, in `docs/GO-LIVE.md`.

### 6.1 Step 1: one email interface (no behaviour change)

New `backend/src/services/mail/provider.ts`:

```ts
export type MailStream = 'system' | 'transactional' | 'marketing';

export interface OutgoingEmail {
  stream: MailStream;
  to: string | string[];
  from?: { email: string; name?: string };
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: { filename: string; content: string; type: string }[]; // base64
  unsubscribeUrl?: string;   // marketing: List-Unsubscribe headers + footer
  tenantId?: string;
  tags?: Record<string, string>; // e.g. { tenant, campaign, log } for events
}

export interface SendResult { ok: boolean; provider: string; messageId?: string; error?: string; permanent?: boolean }

export interface EmailProvider { readonly name: string; send(msg: OutgoingEmail): Promise<SendResult> }

export function emailProviderFor(env: Env, stream: MailStream): EmailProvider; // reads EMAIL_PROVIDER_<STREAM>, falls back to outbox
```

Adapters in `backend/src/services/mail/providers/`: `outbox.ts` (the current KV outbox, moved from `transactional.ts`), `sendgrid.ts` (the current `services/sendgrid.ts` code, moved), later `cloudflare.ts` and `ses.ts`.

Change the callers to use it, all with today's SendGrid behaviour:

| File | Change |
|---|---|
| `services/mail/transactional.ts` | Send through `emailProviderFor(env, 'system')`; result `via` becomes the provider name. |
| `services/email.ts` | Delete. `routes/auth.ts` (account-locked notice) uses stream `system`. |
| `queues/sms-queue.ts` | Email branch uses stream `transactional`; store `messageId` in `message_log.external_id`. |
| `queues/email-queue.ts` | Stream `marketing` when `unsubscribeUrl` is set, else `transactional`. Takes an optional `logId` and writes `messageId` into `email_message_log.message_id` (fixes 2.3 item 1). `templateId` jobs: send the HTML body instead. |
| `queues/campaign-queue.ts` | Remove the inline SendGrid `fetch`; stream `marketing`. |
| `routes/campaigns.ts` | Pass the new `email_message_log` id as `logId` in the job. |
| `routes/itineraries.ts` | Enqueue a proper `{ type: 'email', data: EmailJob }` (fixes 2.3 item 2). |
| `services/privacy/consent.ts` | Footer adds the agency's postal address from company settings (2.3 item 5). |
| `routes/admin.ts:795,812` | "Email configured" reads the provider settings, not `SENDGRID_API_KEY`; drop the hard-coded `smtp.sendgrid.net`. |
| `routes/integrations.ts:47` | Allow `cloudflare` and `ses` as the email channel provider. |
| `types.ts` | New bindings and settings (6.3). |

### 6.2 Step 2: incoming mail on Cloudflare

- Add an `email(message, env, ctx)` handler to the Worker export in `backend/src/index.ts`. It reads `message.raw` with `postal-mime` (new dependency, recommended by Cloudflare [E12]), takes subject, text, HTML, Message-ID and the envelope `to`, and calls the same code the SendGrid route uses today. Move that code out of `routes/inbound.ts:216` into `services/inbound/email.ts` so both paths share it (agency lookup through `tenant_channel_addresses`, `ingestInbound`, `webhook_log`).
- Unknown recipient: `message.setReject('Unknown address')`. Over 25 MiB: reject.
- Keep the SendGrid Inbound Parse route until the MX change is proven, then remove it and `INBOUND_EMAIL_SECRET`.

### 6.3 Step 3: Cloudflare for system mail, SES for agency mail

- `providers/cloudflare.ts`: calls `env.EMAIL.send({ to, from, replyTo, cc, bcc, subject, html, text, headers, attachments })` [E6]. Map error codes: `E_RECIPIENT_SUPPRESSED` and `E_VALIDATION_ERROR` are permanent (no retry); `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED` and `E_INTERNAL_SERVER_ERROR` are retryable, and on `E_DAILY_LIMIT_EXCEEDED` fall back to the `EMAIL_PROVIDER_FALLBACK` provider so a password reset is never lost.
- Cloudflare events: subscribe Email Sending events to a new queue `travelcrm-email-events` [E10]; add a branch in `queues/index.ts` that records bounces and complaints for system mail (a small `email_suppressions` table in the master database, or logging plus an alert; system mail has no per-agency log today).
- `providers/ses.ts`: SES v2 `SendEmail` over HTTPS, signed with SigV4 (`aws4fetch`, new dependency), region from `AWS_SES_REGION`, with a configuration set and message tags `tenant`, `log` and `campaign` so events find their row.
- SES events: configuration set → SNS topic → HTTPS subscription to a new `POST /api/v1/webhooks/ses/events` in `routes/webhooks.ts`, with SNS message signature verification (same pattern as `verifySendgrid` in `middleware/provider-signature.ts`). Map Delivery, Bounce, Complaint, Open, Click and Subscription to the existing `email_message_log` statuses. On a hard bounce or complaint, set a suppression flag on the contact instead of blanking the email (2.3 item 6), and withdraw marketing consent on a complaint.

New settings (generated `[vars]` unless marked secret):

| Name | Value |
|---|---|
| `EMAIL_PROVIDER_SYSTEM` | `cloudflare` (or `ses`, `sendgrid`, `outbox`) |
| `EMAIL_PROVIDER_TRANSACTIONAL` | `ses` |
| `EMAIL_PROVIDER_MARKETING` | `ses` |
| `EMAIL_PROVIDER_FALLBACK` | `ses` or `sendgrid` |
| `EMAIL_FROM` | `noreply@<domain>` (system mail, unchanged) |
| `EMAIL_FROM_AGENCY` | `noreply@mail.<domain>`; the display name becomes the agency's name; reply-to the agency's email from company settings |
| `AWS_SES_REGION` | `ap-south-1` for India, or one EU region for UK/EU data (owner choice) |
| `AWS_SES_CONFIGURATION_SET` | e.g. `travelcrm-agency` |
| `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` | **secrets**; an IAM user allowed only `ses:SendEmail` |
| `SES_SNS_TOPIC_ARN` | used to check the topic of incoming SNS messages |
| Binding `send_email` named `EMAIL` | added by `backend/scripts/gen-wrangler.mjs` for staging and production only; **never `remote: true`** in a local config, because that sends real mail [E18] |

Also update: `backend/wrangler.base.toml` (the new queue), `scripts/push-secrets.sh`, `docs/GO-LIVE.md` 9.1, `docs/KEYS-AND-ACCOUNTS.md` 3.3, `docs/INFRA.md` (providers and settings tables), `docs/COST-MODEL.md` 1.8.

### 6.4 DNS records (owner, Cloudflare dashboard)

| For | Records | Who creates them |
|---|---|---|
| Cloudflare system mail from `<domain>` | MX, SPF (TXT) and DKIM (TXT) on `cf-bounce.<domain>`; DMARC on `_dmarc.<domain>` [E4] | Cloudflare adds them when the domain is onboarded in Email Sending |
| Incoming mail on `in.<domain>` (keeps the company's own mailbox MX on the apex untouched) | MX and SPF for Email Routing on `in.<domain>`; a catch-all rule that sends to the Worker | Cloudflare adds them when Email Routing is enabled on the subdomain. Agencies' enquiry addresses become `<agency>@in.<domain>`, or agencies auto-forward their own inbox there |
| SES agency mail from `mail.<domain>` | Three DKIM CNAMEs (SES "Easy DKIM"); custom MAIL FROM `bounce.mail.<domain>`: one MX and one SPF TXT | Copied from the SES console into Cloudflare DNS, "DNS only" |
| DMARC | One record for `<domain>`, starting at `p=none` with a report address, moving to `quarantine` after a month of clean reports | Owner. Cloudflare's example uses `p=reject`; do not start there |

### 6.5 Testing without sending real mail

- Unit tests (vitest): a fake `env.EMAIL` that records calls; `fetch` mocked for SES and SNS; the outbox provider for everything else. Test each adapter's error mapping, the fallback on `E_DAILY_LIMIT_EXCEEDED`, SNS signature checking with a fixed test certificate, and that `marketing` mail can never select `cloudflare`.
- Local stack: leave `EMAIL_PROVIDER_*` unset or set to `outbox`; `TEST_MODE` already forces the outbox; `GET /test/outbox` stays the way end-to-end tests read mail. If the `send_email` binding is declared locally without `remote`, `wrangler dev` only logs and writes files [E18].
- Incoming: feed a saved `.eml` file to the shared parser in a unit test; Cloudflare also documents a local way to trigger the `email()` handler ("Test email routing locally", not read in detail).
- Staging (GO-LIVE phase 6): send real system mail to a Gmail and an Outlook inbox and check `spf=pass`, `dkim=pass`, `dmarc=pass`; while SES is still in its sandbox it only sends to verified addresses, which is safe for staging.

### 6.6 Rollback

- Outbound: set `EMAIL_PROVIDER_SYSTEM`, `EMAIL_PROVIDER_TRANSACTIONAL` and `EMAIL_PROVIDER_MARKETING` back to `sendgrid` and redeploy. No code change. Keep the SendGrid account, its key, its domain CNAMEs and its event webhook in place (Essentials, $19.95) for **60 days** after the switch.
- Incoming: point the `in.<domain>` MX records back to SendGrid's (`mx.sendgrid.net`) and re-enable Inbound Parse; the old route stays in the code until the 60 days are over. MX changes take effect within the record's TTL (minutes on Cloudflare DNS).
- Data: nothing to migrate back. The message logs and suppression flags are ours and provider-neutral.

---

## 7. What I could not verify

- **SendGrid's prices above $89.95** (Pro 300K $249, 700K $499, 1.5M $799, 2.5M $1,099; Essentials 100K $34.95; overage about $0.001 an email; extra IP $30) come from a third-party page [E20]. SendGrid's own page today shows only the starting prices [E11]. Get a quote.
- Whether **SendGrid Inbound Parse** costs extra on Essentials. I assumed it is included.
- Whether Cloudflare will ever allow **marketing** mail, its **GA date**, any **SLA**, the **starting daily quota** for a new account, and **where** Email Sending processes mail.
- Whether Cloudflare treats **one platform sending on behalf of many agencies** as acceptable transactional use; the docs do not address it [E4]. Worth one question to Cloudflare before relying on it beyond system mail.
- Whether Cloudflare sends from **shared or dedicated IPs** and how it separates customers' reputations.
- **SES production-access approval** for our use, and AWS's acceptable-use rules for multi-tenant marketing senders; SES's multi-tenant reputation features; SNS or EventBridge cost for events.
- Postmark's prices above list (custom quotes), and whether Resend's transactional plan may carry marketing campaigns.
- **Brevo and Mailgun** were not researched.
- The split of agency mail into customer mail and marketing (50/50) and the 20 system emails per agency are my assumptions; COST-MODEL gives only totals.
- Data processing terms (GDPR, India DPDP) of Cloudflare and AWS were not read.

---

## Decision (owner, 2026-10-21)

**Cloudflare + SendGrid, not Amazon SES.** Incoming mail is received by Cloudflare Email Routing. The platform's own system mail (welcome, invites, password reset, receipts, alerts) is sent through Cloudflare Email Sending, with an automatic fallback to SendGrid. All agency mail (customer emails and campaigns) stays on SendGrid. This is the default; the super admin can switch system mail between Cloudflare and SendGrid, and turn the fallback and reply addresses on or off, on the console Email page without a deploy.

Built in R131 (provider interface, inbound Email Worker, reply addresses) and R132 (Cloudflare default with fallback, console settings, platform delivery log, campaign and template sends through the interface). Section 6.3 above ("SES for agency mail") is superseded: read "SendGrid for agency mail". Go-live steps: `docs/GO-LIVE.md` step 9.1a.

## 8. Sources (all read 2026-10-20 unless stated)

- [E0] Cloudflare Email Service pricing: https://developers.cloudflare.com/email-service/platform/pricing/
- [E1] Cloudflare Email Service overview: https://developers.cloudflare.com/email-service/
- [E2] Cloudflare email deliverability: https://developers.cloudflare.com/email-service/concepts/deliverability/
- [E3] Cloudflare Email Service limits: https://developers.cloudflare.com/email-service/platform/limits/
- [E4] Cloudflare domain configuration: https://developers.cloudflare.com/email-service/configuration/domains/
- [E5] Cloudflare "Send emails" (Cloudflare DNS required; `send_email` binding; REST endpoint): https://developers.cloudflare.com/email-service/get-started/send-emails/
- [E6] Cloudflare Email Sending Workers API (fields, attachments, error codes): https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- [E7] Cloudflare Email Service FAQ ("Can I use Email Service for marketing emails? No. Email Service supports transactional email only."): https://developers.cloudflare.com/email-service/reference/faq/
- [E8] Cloudflare Email Service changelog (public beta 2026-04-16; events to Queues 2026-07-15): https://developers.cloudflare.com/email-service/platform/changelog/
- [E9] Cloudflare email headers allowlist (`List-Unsubscribe`, `List-Unsubscribe-Post`): https://developers.cloudflare.com/email-service/reference/headers/
- [E10] Cloudflare Email Sending event subscriptions: https://developers.cloudflare.com/email-service/reference/event-subscriptions/
- [E11] Twilio SendGrid Email API pricing: https://www.twilio.com/en-us/products/email-api/pricing
- [E12] Cloudflare Email Routing Workers handler: https://developers.cloudflare.com/email-service/api/route-emails/email-handler/
- [E13] Amazon SES pricing: https://aws.amazon.com/ses/pricing/
- [E14] Amazon SES event publishing: https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html
- [E15] Postmark pricing: https://postmarkapp.com/pricing
- [E16] Resend pricing: https://resend.com/pricing
- [E17] Amazon SES regions (suppression list is per region): https://docs.aws.amazon.com/ses/latest/DeveloperGuide/regions.html
- [E18] Cloudflare "Test email sending locally": https://developers.cloudflare.com/email-service/observability/local-development/sending/
- [E19] Amazon SES endpoints and quotas (Mumbai `ap-south-1`): https://docs.aws.amazon.com/general/latest/gr/ses.html
- [E20] Third-party SendGrid price table, which says prices were read from SendGrid's pages on 2026-10-02: https://www.usecarly.com/blog/sendgrid-pricing/
