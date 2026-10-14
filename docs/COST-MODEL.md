# TravelCRM Pro cost model

- Status: planning document, written 2026-10-09. Nothing is deployed; no bill exists to check against.
- Every price is a public list price retrieved on 2026-10-09, with its source in section 9. Where I could not find a figure it says "not found".
- Three kinds of statement are kept apart: **figures from sources**, **my assumptions**, **my arithmetic**.
- Exchange rate used throughout: **1 USD = ₹96.83** (rate dated 2026-10-08) [C1].
- Companion documents: `docs/decisions/ADR-001-voip.md` (calls), `docs/CALL-AUTOMATION.md`.

---

## 0. One-page summary

### What it costs to run (India, mix of 60% small, 30% medium, 10% large agencies)

| Agencies | Plan revenue per month | Cost per month **as the code is today** | Cost per month **after the fixes in section 7** |
|---|---|---|---|
| 10 | ₹12,500 | about ₹36,700 (loss) | about ₹7,300 (42% margin) |
| 100 | ₹1,25,000 | about ₹3,49,000 (loss) | about ₹38,200 (69% margin) |
| 1,000 | ₹12,50,000 | about ₹34,69,000 (loss) | about ₹3,40,000 (73% margin) |

Calls are not in these totals. They are resold from a prepaid balance at a markup (section 6), so they pay for themselves.

### Where the money goes

As coded, three lines are about 80% of the cost, and none of them is infrastructure:

1. **SMS through Twilio to Indian phones: ₹8.06 a message** [C20]. A hundred texts cost ₹806, against ₹1,000 of Basic revenue.
2. **WhatsApp through Twilio: ₹0.48 on every message, in and out** [C17], on top of Meta's own fee. A small agency's 600 messages cost ₹290 before Meta charges anything.
3. **Login codes through Twilio Verify: ₹12.90 each** ($0.05 plus the SMS) [C19, C20].

Cloudflare (servers, database, storage) is about ₹500 a month at 10 agencies and under 2% of cost at any scale, with one exception to check: the live-updates component may be billed for every hour a user is connected (section 7, item 6).

After the fixes, AI is the largest line (about 45% of cost), which is the intended design.

### Does each plan make money? (India, one agency, per month)

| Plan | Price | Typical agency | As coded | After fixes |
|---|---|---|---|---|
| Basic ₹12,000 a year | ₹1,000 | small: 5 users, 200 leads | **loses about ₹750** | makes about ₹880 (88%) |
| Pro ₹18,000 a year | ₹1,500 | medium: 10 users, 500 leads | **loses about ₹2,700** | makes about ₹1,010 (67%) |
| Enterprise ₹24,000 a year | ₹2,000 | large: 25 users, 1,500 leads | **loses about ₹9,300** | makes about ₹1,000 (50%) |

What drives the losses: SMS, the WhatsApp reseller fee and login codes, all paid by the platform with no limit. What still squeezes Enterprise after the fixes: AI at 25% of revenue (target 20%), and the plan allowing 100 users for a flat ₹2,000 a month.

### What to charge

- **One structure everywhere: per user per month, billed yearly.** Today's Indian prices are exactly ₹200, ₹300 and ₹400 per user per month for a five-user agency. Keep those numbers and charge per user above five.
- **International:** $12 / $29 / $49 per user per month for the UK, EU, US, Australia, Singapore and the Gulf (the figures already on the landing page); lower bands for Malaysia and Thailand ($8 / $19 / $32) and for Sri Lanka, Nepal and Bangladesh ($3 / $5 / $7). Section 5.
- **Messages, texts and calls are not included without limit.** Each plan carries a small allowance; beyond it they come out of one prepaid balance at about twice cost. Section 6.
- **Calls:** India ₹1.50 a minute and ₹299 a month per number; UK $0.05; US $0.03; others in section 6.

---

## 1. Every billable unit, by vendor

List prices. "Included" means included in the vendor's paid plan each month.

### 1.1 Cloudflare [C2–C7]

| Unit | Included each month | Beyond that |
|---|---|---|
| Workers Paid plan | $5 a month minimum | |
| Worker requests | 10 million | $0.30 per million |
| Worker CPU time | 30 million milliseconds | $0.02 per million milliseconds |
| D1 database: rows read | 25 billion | $0.001 per million |
| D1: rows written | 50 million | $1.00 per million |
| D1: storage | 5 GB | $0.75 per GB-month |
| KV (key-value store): reads | 10 million | $0.50 per million |
| KV: writes | 1 million | $5.00 per million |
| KV: storage | 1 GB | $0.50 per GB-month |
| R2 file storage | 10 GB | $0.015 per GB-month |
| R2: write operations (class A) | 1 million | $4.50 per million |
| R2: read operations (class B) | 10 million | $0.36 per million |
| R2: download traffic | free | free |
| Queues | 1 million operations | $0.40 per million |
| Durable Objects: requests | 1 million | $0.15 per million. Incoming WebSocket messages count 20 to 1. |
| Durable Objects: duration | 400,000 GB-seconds | $12.50 per million GB-seconds. Idle connections cost nothing **only** when the hibernation feature is used. |
| Workers AI | 10,000 "neurons" a day free | $0.011 per 1,000 neurons |

Limits that matter (Workers Paid) [C5]: 10 GB maximum per D1 database; 50,000 databases per account; 1,000 database queries per Worker run; about 5,000 bindings per Worker.

Workers AI models used in `backend/src/services/ai-router.ts:77-82` [C6]:

| Model | Input, per million tokens | Output, per million tokens |
|---|---|---|
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (labels every message) | $0.045 | $0.384 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (extraction) | $0.293 | $2.253 |
| `@cf/meta/llama-3.2-11b-vision-instruct` (images) | $0.049 | $0.676 |
| `@cf/meta/llama-3.1-70b-instruct` (the default text model in the code) | **not on the price list** | **not on the price list** |
| `@cf/openai/whisper-large-v3-turbo` (speech to text; not used yet) | $0.0005 per audio minute | |

The figures in `backend/src/services/ai-pricing.ts:16-29` match the price list for the three listed models.

### 1.2 Anthropic [C8]

| Model | Input, per million tokens | Output, per million tokens |
|---|---|---|
| Claude Haiku 4.5 (`claude-haiku-4-5`, used in the code) | $1 | $5 |
| Claude Sonnet 5.5 (current Sonnet) | $2 | $10 |
| Claude Haiku 5.5 (prompts up to 100,000 tokens; not used in the code) | $0.10 | $0.50 |
| Batch processing | 50% off | 50% off |

Note from the same page: models from 4.7 onward count roughly 30% more tokens for the same text. Even so, Haiku 5.5 is cheaper per token than the Workers AI 70B model above. See section 7, item 8.

### 1.3 Deepgram (speech to text for recorded calls) [C9]

| Product | Pay as you go |
|---|---|
| Nova-3, pre-recorded, one language | $0.0043 per minute |
| Nova-3, pre-recorded, multilingual | $0.0052 per minute |
| Speaker separation on pre-recorded audio | included |
| Free credit for new accounts | $200 |

The code calls `nova-2` (`backend/src/services/deepgram.ts`); its price is not on the current page. Not found.

### 1.4 Telephony

Full tables are in the ADR, section 3. The figures this model uses:

| Item | Price | Source |
|---|---|---|
| Plivo India, call to or from an Indian phone | ₹0.38 per minute | [C10] |
| Plivo India, softphone leg | ₹0.25 per minute | [C10] |
| Plivo India, phone number | ₹200 per month | [C10] |
| Plivo, recording | free; storage free 90 days, then $0.0004 per minute per month | [C10] |
| Twilio to Indian mobiles (for comparison) | $0.0496 per minute | [C11] |
| Twilio recording | $0.0025 per minute, plus $0.0005 per minute per month stored | [C11] |

### 1.5 WhatsApp Business messaging

How Meta charges since 1 July 2025 [C16]: per delivered template message, by category and by the recipient's country. Marketing templates are always charged. Utility and authentication templates are charged outside an open customer-service window (24 hours after the customer last wrote) and utility templates are free inside it. Ordinary replies inside the window are free. Meta may change rates on the first day of a quarter.

| Item | Price | Source and confidence |
|---|---|---|
| Twilio's own fee | $0.005 per message, inbound and outbound | Twilio [C17] |
| Meta, India, marketing template | ₹0.8631 | Third-party summaries of Meta's January 2026 rate card [C18]. Meta's own page holds the rates in downloadable files I could not read. **Confirm against Meta's file.** |
| Meta, India, utility template | ₹0.115 | same |
| Meta, India, authentication template | ₹0.115 | same |
| Meta rates for the UK, Germany, US, Australia, UAE, Saudi Arabia, Singapore, Malaysia | **not found** | Download the rate card from Meta's pricing page [C16]. |

### 1.6 SMS (Twilio, outbound, per message segment) [C20]

| Country | Price | In rupees |
|---|---|---|
| India | $0.0832 | ₹8.06 |
| United Kingdom | $0.056 | ₹5.42 |
| Germany | $0.112 | ₹10.85 |
| United States | $0.0083, plus carrier fees of $0.0035 to $0.005 | ₹0.80 plus fees |
| Australia | $0.0515 | ₹4.99 |
| UAE | $0.1176 | ₹11.39 |
| Saudi Arabia | $0.1949 | ₹18.87 |
| Singapore | $0.0591 | ₹5.72 |
| Malaysia | $0.3389 | ₹32.82 |

Twilio's India page prices messages from international numbers and says to contact sales for domestic sender rates.

For comparison, an Indian provider's domestic route. MSG91 lists India-to-India SMS at **₹0.25 a message for 5,000, ₹0.20 for 16,500, ₹0.18 for 30,000, ₹0.17 for 60,000 and ₹0.16 for 9,62,500**, before 18% GST [C28]. That is roughly one-fortieth of Twilio's price. Its separate login-code price: not found. Domestic SMS in India also needs sender and template registration with the operators (known as DLT); the cost and steps were not researched.

### 1.7 Login codes: Twilio Verify [C19]

$0.05 per successful verification **plus** the channel fee. By SMS in India that is $0.05 + $0.0832 = $0.1332, about ₹12.90 a login. By email, $0.05 with no channel fee. Failed attempts do not pay the $0.05 but may still pay for the SMS.

### 1.8 Email: SendGrid [C21]

| Plan | Price |
|---|---|
| Free trial | 100 emails a day for 60 days |
| Essentials | from $19.95 a month; no dedicated sending address |
| Pro | from $89.95 a month; one dedicated sending address included |
| Price at each volume step (100,000, 300,000, 700,000, 1.5 million, 2.5 million) | **not found**: the page lists the steps but the fetch did not return the prices. The README's figures (50,000 for $19.95, 100,000 for $34.95) are unverified. |
| For comparison, Amazon SES | $0.10 per 1,000 emails sent, $0.12 per GB of attachments, dedicated sending address $24.95 a month [C29] |

### 1.9 Google Maps [C22]

| Item | Free each month | Then, per 1,000 |
|---|---|---|
| Address autocomplete requests | 10,000 | $2.83 |
| Autocomplete inside a "session" that ends in a place lookup | unlimited | free |
| Place details (basic fields) | 10,000 | $5.00 |
| Distance matrix | 10,000 | $5.00 |
| Geocoding | 10,000 | $5.00 |

Google has separate, lower prices for accounts billed in India with mostly Indian usage [C23]; the figures: not found.

From the code: the address box uses Google's ready-made autocomplete widget and asks only for address and location fields (`desktop/src/components/ui/address-autocomplete.tsx:186-187`). My understanding is that this widget groups keystrokes into a session by itself, so each completed address costs one place lookup rather than one charge per keystroke. Not verified against Google's documentation; check one day's usage in the Google console after launch.

### 1.10 Oracle Cloud (the per-agency WordPress sites) [C24, C25]

| Item | Figure | Source |
|---|---|---|
| Always Free ARM allowance | 1,500 OCPU-hours and 9,000 GB-hours a month, which the page equates to **2 OCPUs and 12 GB of memory** | Oracle documentation [C24] |
| Always Free disk | 200 GB in total | [C24] |
| Always Free outbound data | 10 TB a month | [C24] |
| Idle reclaim | Oracle may reclaim a free instance if, over 7 days, CPU, network and memory use are all under 20% | [C24] |
| Capacity | "Out of host capacity" errors are possible on free shapes; the remedy offered is upgrading to pay-as-you-go | [C24] |
| Paid ARM compute | $0.013106 per OCPU-hour, $0.0019659 per GB-hour of memory | Third-party price tracker [C25]; Oracle's own price page refused the request. **Confirm.** |
| Paid disk | **not found** | |

Important: `terraform/modules/oracle-cloud/main.tf` asks for 4 OCPUs and 24 GB, and the README calls that free. The documentation retrieved today says the free allowance is half that. If so, the extra 2 OCPUs and 12 GB would be billed at about 2 × $0.013106 × 730 + 12 × $0.0019659 × 730 = **$36 a month** (my arithmetic). Check the Oracle console before provisioning.

### 1.11 Payments [C26, C27]

| Vendor | Fee |
|---|---|
| Razorpay, Indian cards, UPI, net banking | 2% per transaction, plus 18% GST on the fee |
| Razorpay, international cards | up to 3% |
| Razorpay, card subscriptions | 0.9% on top |
| Stripe (India page), Indian cards | 2% |
| Stripe (India page), international cards | 3% (4.3% when charged in another currency), plus 2% if currency conversion is needed |
| Stripe Billing (subscriptions) | 0.7% of billed volume |

Whether Stripe is open to new Indian businesses, and what a foreign-entity Stripe account would cost: not researched.

### 1.12 Other

| Item | Price | Source |
|---|---|---|
| Firebase Cloud Messaging (push notifications) | no cost on both Firebase plans | [C30] |
| Apple Developer Program | $99 a year | [C31] |
| Google Play developer account | $25, one time | [C32] |
| Windows code signing, Microsoft's hosted service (Azure Artifact Signing) | Price not shown on the pricing page. **Not available to Indian organisations**: public certificates are offered to organisations in the US, Canada, EU, UK, Australia, New Zealand, Japan, South Korea, Singapore, Switzerland, Norway and Israel. | [C33] |
| Windows code signing, ordinary certificate from a certificate authority | Roughly $129 to $439 a year depending on the authority, plus about $15 a month if a hosted signing key is used. These are figures from reseller and comparison sites that disagree with each other. Get a quote. | [C34] |
| Domain `.pro` at Cloudflare Registrar | $21.20 a year (`.com` is $10.46) | Third-party tracker of Cloudflare's prices [C35] |

---

## 2. Usage profile per agency per month

All of this table is **my assumption**, starting from the README's small agency (5 users, about 200 leads, 100 SMS, 200 WhatsApp, 500 emails, 120 call minutes; `README.md:629-655`) and scaled up. Change these numbers and everything below changes.

| | Small | Medium | Large |
|---|---|---|---|
| Plan | Basic | Pro | Enterprise |
| Users | 5 | 10 | 25 |
| New leads | 200 | 500 | 1,500 |
| WhatsApp messages received | 400 | 1,300 | 4,000 |
| Emails and web forms received | 200 | 700 | 2,000 |
| WhatsApp messages sent | 200 | 600 | 2,000 |
| of which marketing templates | 50 | 150 | 600 |
| of which utility templates outside the free window | 50 | 150 | 400 |
| of which free replies | 100 | 300 | 1,000 |
| SMS sent | 100 | 200 | 500 |
| Emails sent | 500 | 2,000 | 8,000 |
| Call minutes (80% outbound) | 120 | 300 | 1,000 |
| Phone numbers | 1 | 2 | 4 |
| Login codes (staff and drivers) | 20 | 60 | 200 |
| AI credits in the plan | 1,000 | 15,000 | 25,000 |
| App requests to the server | 44,000 | 1,00,000 | 2,50,000 |
| Files stored | 1 GB | 3 GB | 10 GB |
| Address lookups | 60 | 150 | 500 |
| Hours a day someone is connected | 8 h × 22 days | 10 h × 26 days | 12 h × 30 days |
| Website | 1 | 1 | 1 |

Supporting assumptions:

- **Requests:** 5 users × 22 days × 400 requests a day = 44,000.
- **Database work per received message:** 35 statements, about 700 rows read and 10 written (findings 03, part C: "30–40 D1 statements").
- **AI per received message:** up to 6 credits: 1 to label it and 5 to extract details (`ai-pricing.ts:48-53`). So 600 messages can use 3,600 credits, more than Basic's 1,000. **I assume every plan uses its whole AI allowance**; on Basic the allowance runs out in the first week and the product falls back to fixed rules.
- **One credit = ₹0.02 of provider cost** (owner's sizing). Check: an extraction of 1,500 tokens in and 300 out on the 70B model costs 1,500 × $0.293/M + 300 × $2.253/M = $0.00112 = ₹0.108, charged as 5 credits = ₹0.10. The sizing holds.
- **Scheduled job:** runs every 5 minutes (288 times a day) and loops over every agency with about 2 database queries each (findings 03, part C).
- **Agency mix** for platform totals: 60% small, 30% medium, 10% large.

---

## 3. Monthly platform cost at 10, 100 and 1,000 agencies (India)

### 3.1 Cost per agency, as the code is today

"As coded" means: SMS, WhatsApp and login codes all go through the platform's Twilio account, the platform pays, nothing is capped, and every agency gets its own WordPress and database containers. Rupees per month. My arithmetic from sections 1 and 2.

| Line | Small | Medium | Large | How |
|---|---|---|---|---|
| SMS | 806 | 1,611 | 4,028 | messages × ₹8.06 |
| WhatsApp, Twilio fee | 290 | 920 | 2,905 | (sent + received) × $0.005 = ₹0.484 |
| WhatsApp, Meta fee | 49 | 147 | 564 | marketing × ₹0.8631 + utility × ₹0.115 |
| Login codes | 258 | 774 | 2,580 | codes × ₹12.90 |
| AI, whole allowance | 20 | 300 | 500 | credits × ₹0.02 |
| Website hosting, once the free machine is full | 185 | 185 | 185 | section 3.4 |
| Live updates, if hibernation is not working | 98 | 145 | 201 | section 3.5 |
| Email | 19 | 77 | 309 | emails × ($19.95 ÷ 50,000) |
| Payment fee | 24 | 35 | 47 | 2.36% of the plan price |
| Cloudflare, everything else | 2 | 5 | 12 | section 3.6 |
| Maps | 2 | 5 | 15 | section 3.6 |
| **Total** | **1,753** | **4,204** | **11,346** | |
| Plan price | 1,000 | 1,500 | 2,000 | |
| **Result** | **−753** | **−2,704** | **−9,346** | |
| Calls, if they were bundled (not in the total) | 276 | 589 | 1,430 | Plivo India, softphone: minutes × ₹0.63 + numbers × ₹200 |

### 3.2 Platform totals, as coded

Fixed costs each month (my arithmetic): Cloudflare $5 + SendGrid $19.95 + one Twilio sender number $1.15 + Apple account $99 ÷ 12 = $8.25 + code-signing certificate about $220 ÷ 12 = $18.30 (mid-range, unconfirmed) + domain $21.20 ÷ 12 = $1.77 = **about $54.40 = ₹5,270**. The one-time $25 for Google Play is left out.

Mix-weighted average per agency: SMS ₹1,370; WhatsApp ₹741 + ₹130; login codes ₹645; AI ₹152; plan revenue ₹1,250; payment fee ₹29.50.

| Line | 10 agencies | 100 agencies | 1,000 agencies | Fixed or variable |
|---|---|---|---|---|
| SMS | 13,695 | 1,36,950 | 13,69,500 | variable |
| WhatsApp (Twilio fee + Meta) | 8,705 | 87,050 | 8,70,500 | variable |
| Login codes | 6,450 | 64,500 | 6,45,000 | variable |
| AI | 1,520 | 15,200 | 1,52,000 | variable, capped by credits |
| Website hosting | 0 | 15,910 | 1,82,410 | step: free for about 14 sites |
| Live updates (no hibernation) | 741 | 11,765 | 1,22,000 | variable |
| Email above the base plan | 0 | 6,778 | 16,461 | step |
| Maps | 0 | 1,501 | 58,580 | variable above the free amount |
| Cloudflare usage above the $5 plan | 0 | 968 | 17,720 | variable |
| Payment fees | 295 | 2,950 | 29,500 | variable |
| Fixed | 5,270 | 5,270 | 5,270 | fixed |
| **Total** | **36,676** | **3,48,842** | **34,68,941** | |
| Cost per agency | 3,668 | 3,488 | 3,469 | |
| Plan revenue | 12,500 | 1,25,000 | 12,50,000 | |
| **Result** | **−24,176** | **−2,23,842** | **−22,18,941** | |
| Calls at cost if every agency used them (resold, not in total) | 4,850 | 48,500 | 4,85,000 | variable |

**The three biggest lines at every scale are SMS, WhatsApp and login codes: 79% of cost at 10 agencies and 83% at 1,000.** Fixed cost is 14% of the total at 10 agencies and 0.2% at 1,000: this business has almost no fixed cost, so scale alone does not fix the margin.

Notes on the step lines:

- Email at 100 agencies: about 170,000 emails a month. I used SendGrid Pro's starting price ($89.95) as a floor; the real tier price was not found. At 1,000 agencies (1.7 million emails) the SendGrid price was not found; the figure shown is a placeholder of $170, which is $0.10 per 1,000 emails. Treat both as unknown until quoted.
- Website hosting assumes no free machine beyond the first.

### 3.3 Platform totals after the fixes in section 7

What changes: SMS and marketing WhatsApp come out of the agency's prepaid balance; WhatsApp goes direct to Meta with no reseller fee; login codes go by WhatsApp or email; the live-updates component sleeps when idle; websites share one installation.

Per agency, rupees per month:

| Line | Small | Medium | Large | How |
|---|---|---|---|---|
| WhatsApp utility templates (platform pays) | 6 | 17 | 46 | utility × ₹0.115 |
| Login codes by WhatsApp | 2 | 7 | 23 | codes × ₹0.115 |
| AI, whole allowance | 20 | 300 | 500 | |
| Email | 19 | 77 | 309 | unchanged |
| Website hosting | 40 | 40 | 40 | assumption: shared installation |
| Live updates | 2 | 2 | 2 | assumption: hibernation working |
| Payment fee | 24 | 35 | 47 | |
| Cloudflare and Maps | 4 | 10 | 27 | |
| **Total** | **117** | **488** | **994** | |
| Plan price | 1,000 | 1,500 | 2,000 | |
| **Margin** | **883 (88%)** | **1,012 (67%)** | **1,006 (50%)** | |

Platform totals:

| | 10 agencies | 100 agencies | 1,000 agencies |
|---|---|---|---|
| Per-agency lines (WhatsApp utility ₹13, codes ₹6, AI ₹152, live updates ₹2, payment ₹29.50) | 2,025 | 20,245 | 2,02,450 |
| Website hosting beyond the free machine at ₹40 | 0 | 3,440 | 39,440 |
| Email above the base plan | 0 | 6,778 | 16,461 |
| Maps | 0 | 1,501 | 58,580 |
| Cloudflare usage | 0 | 968 | 17,720 |
| Fixed | 5,270 | 5,270 | 5,270 |
| **Total** | **7,295** | **38,202** | **3,39,921** |
| Cost per agency | 730 | 382 | 340 |
| Plan revenue | 12,500 | 1,25,000 | 12,50,000 |
| **Margin** | **5,205 (42%)** | **86,798 (69%)** | **9,10,079 (73%)** |

Biggest lines after the fixes at 1,000 agencies: AI (₹1,52,000, 45%), Maps (₹58,580, 17%), website hosting (₹39,440, 12%).

### 3.4 Website hosting arithmetic

- From the code: one WordPress container (512 MB limit) and one database container (256 MB) per agency, `MAX_SITES` default 50 (`oci-provisioner/src/server.ts`, per findings 03).
- My arithmetic: 768 MB per site. A 12 GB free machine holds about 14 sites at those limits; a 24 GB machine about 29. Fifty sites would need 38 GB.
- Paid capacity per site (assuming 0.1 OCPU each): 0.768 GB × $0.0019659 × 730 + 0.1 × $0.013106 × 730 = $1.10 + $0.96 = **$2.06, about ₹199 a month**. I used ₹185 after allowing for the free machine's share. Disk is extra and its price was not found.
- That is 18% of the Basic plan price for a brochure website.

### 3.5 Live-updates arithmetic

- From the code: one Durable Object per agency holds every user's live connection; the app sends a keep-alive message every 30 seconds per user (findings 03, part C). The object accepts connections with the hibernation call but also keeps sessions in memory with ordinary event handlers (`backend/src/durable-objects/realtime.ts:82-110`), so whether it actually sleeps is unverified.
- If it does not sleep while anyone is connected: small agency 8 h × 22 days = 633,600 seconds × 0.128 GB = 81,100 GB-seconds a month. At $12.50 per million that is $1.01, about ₹98.
- The 400,000 free GB-seconds cover about four such agencies.
- If it sleeps properly, the cost is close to zero.
- **This needs one measurement on a deployed test Worker before launch.**

### 3.6 Cloudflare arithmetic at 1,000 agencies

Mix-weighted averages per agency: 81,400 requests; 1,560 received messages; 8.5 users.

| Unit | Use at 1,000 agencies | Beyond included | Cost |
|---|---|---|---|
| Requests | about 83 million | 73 million × $0.30 | $21.90 |
| CPU (assuming 10 ms a request) | 830 million ms | 800 million × $0.02 | $16.00 |
| KV reads (one per request for the agency lookup) | 83 million | 73 million × $0.50 | $36.50 |
| KV writes (login-token refresh every 15 minutes per active user) | about 6 million | 5 million × $5.00 | $25.00 |
| D1 rows read (250 per request) | about 20 billion | within 25 billion | $0 |
| D1 rows written | about 40 million | within 50 million | $0 |
| D1 storage (assuming 50 MB an agency) | 50 GB | 45 GB × $0.75 | $33.75 |
| R2 (2.5 GB of files an agency, plus 90 days of recordings) | about 2,870 GB | 2,860 × $0.015 | $42.90 |
| Durable Object requests, Queues | about 10 million, 3 million | | $2.20 |
| **Total above the $5 plan** | | | **about $178 = ₹17,260**. The tables in 3.2 and 3.3 use ₹17,720, which adds $5 for log and queue traffic not itemised here. |

At 100 agencies the same sum is about $10. At 10 agencies everything fits inside the $5 plan.

Two walls that are not about money:

1. **The shared database.** Every agency currently lives in one D1 database (`backend/wrangler.toml` binds only `MASTER_DB`). D1 allows 10 GB per database [C5]. At 50 MB an agency that is about **200 agencies**, after which writes fail. Per-agency databases are designed but not wired.
2. **The scheduled job.** It runs every agency inside one Worker run, about 2 queries each. D1 allows 1,000 queries per run [C5]. At about **500 agencies** the job starts failing part-way through.

---

## 4. Margin per plan at today's Indian prices

| | Basic | Pro | Enterprise |
|---|---|---|---|
| Price per year | ₹12,000 | ₹18,000 | ₹24,000 |
| Price per month | ₹1,000 | ₹1,500 | ₹2,000 |
| Users allowed (`backend/src/routes/admin.ts:96-127`) | 5 | 15 | 100 |
| AI credits a month | 1,000 | 15,000 | 25,000 |
| AI cost at full use | ₹20 (2% of price) | ₹300 (20%) | ₹500 (25%) |
| Cost of the typical agency, as coded | ₹1,753 | ₹4,204 | ₹11,346 |
| **Margin as coded** | **−₹753 (loses money)** | **−₹2,704 (loses money)** | **−₹9,346 (loses money)** |
| Cost after the fixes | ₹117 | ₹488 | ₹994 |
| **Margin after the fixes** | **₹883 (88%)** | **₹1,012 (67%)** | **₹1,006 (50%)** |

Plainly:

- **Every plan loses money at typical usage as the code stands.** The cause is the same on all three: SMS at ₹8.06, a ₹0.48 reseller fee on every WhatsApp message in either direction, and ₹12.90 login codes, all paid by the platform without a limit.
- **Basic survives a light user.** An agency that sends no SMS, sends 100 and receives 200 WhatsApp messages, uses 5 login codes and has its website on the free machine costs about ₹300 to ₹400 a month as coded (my arithmetic: 300 × ₹0.484 + ₹25 Meta + 5 × ₹12.90 + ₹20 AI + ₹19 email + ₹24 payment fee + ₹4, plus up to ₹98 for live updates).
- **AI is on target for Pro (20%), under for Basic (2%) and over for Enterprise (25%).** Basic's 1,000 credits cover about 170 fully analysed messages; a small agency receives 600. Either accept that Basic is "AI taster only" or raise it to about 5,000 credits (₹100 a month, 10% of price).
- **Enterprise is underpriced for what it allows.** A 100-user agency for ₹2,000 a month is ₹20 a user. Every cost in this model grows with users and messages. Section 5 fixes this with per-user pricing.
- **Calls cannot be bundled.** One Indian number is ₹200 a month, 20% of Basic, before a single minute.
- Not modelled: support time, the owner's salary, GST (prices assumed to exclude it), refunds, free trials. A trial as coded gets 2,000 AI credits and full messaging; cap it.

---

## 5. International prices and one consistent structure

### 5.1 The conflict today

| Where | Structure | Figures |
|---|---|---|
| `landing/index.html:426-462` | per user per month | $12 / $29 / $49, shown as ₹999 / ₹2,399 / ₹3,999 |
| `backend/src/routes/admin.ts:96-127` and the owner's decision | per agency per year | ₹12,000 / ₹18,000 / ₹24,000 with 5 / 15 / 100 users |
| `super-admin/src/lib/constants.ts:3-11` | per agency per month | ₹0 / ₹999 / ₹2,499 / ₹4,999 with 2 / 5 / 15 / 50 users |

For a five-user Indian agency on the middle plan those three say ₹1,43,940, ₹18,000 and ₹29,988 a year. A customer who reads the landing page and then gets an invoice will see two different products.

### 5.2 Recommendation: per user per month, billed yearly, with a minimum

Why per user:

- Cost follows users and messages, not the number of agencies. A flat agency price makes the largest customers the least profitable.
- It is how comparable CRMs price (5.4), so buyers outside India expect it.
- **It reproduces today's Indian prices exactly.** ₹12,000, ₹18,000 and ₹24,000 a year are ₹200, ₹300 and ₹400 per user per month for five users. Nothing changes for a five-user agency; a fifteen-user agency pays three times as much, which matches what it costs.

Rules: billed yearly; a monthly option at 20% more; minimum five users in India and three elsewhere; AI credits per agency as today, plus 500 credits per extra user on Pro and Enterprise.

### 5.3 Proposed prices (per user per month, billed yearly)

These are **my proposals**, not sourced figures.

| Market group | Basic | Pro | Enterprise | Minimum | Reasoning |
|---|---|---|---|---|---|
| India | ₹200 | ₹300 | ₹400 | 5 users | Today's prices, restated. |
| UK, EU, US, Australia | $12 | $29 | $49 | 3 users | The landing page's figures. Cost to serve is under $3 an agency after the fixes, so this is priced on value. Show £, € and A$ at round numbers. |
| Gulf (UAE, Saudi Arabia, Qatar) | $12 | $29 | $49 | 3 users | Same as the West. Do not sell here until Arabic and right-to-left screens exist (findings 02) and note that calling is not offered (ADR). |
| Singapore | $12 | $29 | $49 | 3 users | High-income market. |
| Malaysia, Thailand | $8 | $19 | $32 | 3 users | About two-thirds of the Western price. |
| Sri Lanka, Nepal, Bangladesh | $3 | $5 | $7 | 5 users | Indian price levels plus a margin for currency and payment costs (international cards cost up to 3%). |

What a three-user Western agency pays: $36, $87 or $147 a month. What it costs to serve after the fixes: a few dollars plus its AI allowance ($3 to $5).

Before selling outside India (findings 02): invoices that are not GST-only, currency display, a way to take foreign payments, legal pages.

### 5.4 What comparable products charge

Figures from the vendors' own pricing pages, retrieved 2026-10-09.

| Product | What it is | Public price |
|---|---|---|
| Travefy [C36] | Itinerary builder and CRM for travel agents (US) | Core $39 a month and Premium $59 a month, billed yearly, for the first seat. Extra seats $20 a month on Core and $39 on Premium (the page gives two different figures for extra seats in two places). |
| TravelJoy [C37] | CRM and trip workflow for independent agents (US) | Starter $19 a month (12 trips a year). Pro $39 a month, or $32 on yearly billing. Premium: no price shown. |
| Zoho CRM, India page [C38] | General-purpose CRM | Standard ₹800, Professional ₹1,400, Enterprise ₹2,400, Ultimate ₹2,600 per user per month. |
| Sembark [C39] | Travel-agency software (India) | No prices published. The page says per-user monthly subscription plus a mandatory one-time setup fee. |
| Tourwriter | Tour-operator software | Not found (pricing page returned an error). |

How the proposal compares (my arithmetic):

- A three-user agency in the US on Travefy pays $39 + 2 × $20 = **$79** a month on Core, or $59 + 2 × $39 = **$137** on Premium. On TravelCRM Pro it would pay **$36, $87 or $147**. Basic undercuts, Pro is level, Enterprise is slightly above and includes AI, messaging tools and a website.
- In India, Zoho's cheapest paid edition is ₹800 per user per month. TravelCRM Pro at ₹200 to ₹400 is a quarter to a half of that. **There is room to raise Indian prices**, or at least no reason to go lower. This is the owner's call; the model above uses today's prices.
- Sembark's setup fee suggests Indian agencies accept a one-time onboarding charge. Worth considering for data import and website setup.

---

## 6. Reseller pricing for calls and messages

### 6.1 One prepaid balance

The agency buys a balance (₹500, ₹1,000, ₹2,500; or $10, $25, $50) and can switch on automatic top-up. Calls, phone numbers, SMS, marketing WhatsApp messages and AI top-ups all draw from it. Nothing is postpaid. The platform pays its providers in arrears, so an unpaid agency bill would be the platform's loss.

### 6.2 Calls: proposed retail prices

Cost figures are from the ADR, section 3. Retail prices are **my proposals** at roughly twice cost, rounded to something easy to read. Per minute, softphone included.

| Market | Provider | Cost to mobiles | Cost to landlines | Cost inbound | **Retail per minute** | Number: cost | **Number: retail** |
|---|---|---|---|---|---|---|---|
| India (call-bridge, two legs) | Plivo India | ₹0.76 | ₹0.76 | ₹0.76 | **₹1.50** | ₹200 | **₹299** |
| India (softphone, later) | Plivo India | ₹0.63 | ₹0.63 | ₹0.63 | **₹1.25** | ₹200 | **₹299** |
| United Kingdom | Plivo | $0.0303 | $0.0108 | $0.0088 | **$0.05 mobile, $0.025 landline and inbound** | $0.85 | **$3** |
| United States | Plivo | $0.0148 | $0.0148 | $0.0088 | **$0.03** | $0.50 | **$2** |
| Australia | Plivo | $0.0763 | $0.0263 | $0.0088 | **$0.15 mobile, $0.05 landline and inbound** | $2.50 | **$5** |
| Singapore | Plivo | $0.0522 | $0.0373 | $0.0113 | **$0.10 outbound, $0.03 inbound** | $5.00 | **$9** |
| Germany | Twilio | $0.0460 | $0.0323 | $0.0140 | **$0.09 mobile, $0.06 landline, $0.03 inbound** | $1.35 | **$3** |
| Malaysia | Twilio | $0.0840 | $0.0595 | $0.0358 | **$0.16 mobile, $0.12 landline, $0.07 inbound** | $4.00 | **$7** |

Costs include the softphone leg ($0.0033 at Plivo, $0.0040 at Twilio). Twilio recording adds $0.0025 a minute; Plivo recording is free.

### 6.3 Calls: bundles

A bundle is easier to sell than a per-minute price.

| Bundle | Contents | Cost to the platform | Price | Margin |
|---|---|---|---|---|
| India Calling | 1 number + 250 minutes a month (call-bridge) | ₹200 + 250 × ₹0.76 = ₹390 | **₹599 a month** | 35% |
| India Calling Plus | 2 numbers + 700 minutes | ₹400 + 700 × ₹0.76 = ₹932 | **₹1,399 a month** | 33% |
| UK Calling | 1 number + 250 minutes (70% to mobiles) | $0.85 + 250 × $0.0213 = $6.18 | **$12 a month** | 49% |
| US Calling | 1 number + 500 minutes | $0.50 + 500 × $0.0136 = $7.30 | **$15 a month** | 51% |

Unused minutes do not carry over. Extra minutes at the per-minute price. No calling on free trials (fraud; see the ADR checklist).

Do not include calling minutes in any plan at today's Indian prices. If a headline is wanted, put "India Calling" inside Enterprise only after Enterprise is repriced per user.

### 6.4 Messages

| Item | Cost | Proposed retail |
|---|---|---|
| WhatsApp marketing template, India | ₹0.8631 (Meta, to be confirmed) | ₹1.25 |
| WhatsApp utility template, India | ₹0.115 | included: 300 / 1,000 / 3,000 a month by plan, then ₹0.20 |
| WhatsApp replies inside the free window | ₹0 from Meta | free |
| SMS, India | ₹0.16 to ₹0.25 plus GST on an Indian domestic route (MSG91 list price [C28]); ₹8.06 through Twilio | ₹0.50, and only on a domestic route. Never through Twilio. |
| SMS, UK / US / Australia / Singapore | $0.056 / about $0.013 / $0.0515 / $0.0591 | $0.10 / $0.03 / $0.10 / $0.10 |
| AI credit top-up | ₹0.02 a credit | ₹0.05 a credit (pack of 5,000 for ₹250) |

---

## 7. Ten ways to cut cost, ranked by saving

Savings are per agency per month for the mix-weighted Indian agency, from section 3. "Risk" items prevent an open-ended bill and are ranked by the size of that bill.

| # | Change | Saving | Tied to this code |
|---|---|---|---|
| 1 | **Stop paying for SMS out of the plan.** Take SMS out of the included features in India; send customer messages by WhatsApp; if SMS is needed, use an Indian domestic route (₹0.16 to ₹0.25 a message at MSG91's list price, against ₹8.06) and charge the agency's balance. | about ₹1,370 | `backend/src/services/twilio-messaging.ts`, `queues/sms-queue.ts`, `queues/campaign-queue.ts`; README assumes 100 free SMS. |
| 2 | **Send WhatsApp direct through Meta's own Cloud API** instead of through Twilio, which adds $0.005 to every message in and out. Bill marketing templates to the agency's balance. Choose the utility category wherever a template qualifies (₹0.115 against ₹0.8631) and reply inside the free window where possible. | about ₹740 (reseller fee) plus about ₹115 (marketing moved to the balance) | `services/twilio-messaging.ts:59-76` (platform-keyed), `routes/inbound.ts:118`, template categories in the send dialog. No Meta Cloud API code exists yet. |
| 3 | **Replace Twilio Verify by SMS for login codes.** Generate the code in the Worker and deliver it by WhatsApp authentication template (₹0.115) or email; keep driver sessions longer than 7 days; add per-number and per-IP limits so nobody can pump codes to earn from them. | about ₹640 | `services/twilio.ts:10-17`, `routes/driver.ts`, `routes/auth.ts`. |
| 4 | **Fix the usage-cap reset (risk).** The 5-minute job resets daily caps on every run and, on the 1st of the month, resets monthly caps on every run. On the 1st an agency's AI allowance refills 288 times. Worst case for one Pro agency: 15,000 credits × 288 × ₹0.02 = ₹86,400 in a day. | prevents an unbounded AI and call bill | `backend/src/index.ts:373-390`. Reset daily caps once after local midnight and monthly caps once, keyed on `last_reset_at`. |
| 5 | **Calls on a prepaid balance through Plivo, not bundled, and release numbers.** Bundled calls would cost ₹485 an agency. A deleted number that is not released keeps costing ₹200 a month for ever. | about ₹485, plus ₹200 per orphaned number | `routes/calls.ts:411-423` (cap never checked), `routes/voip.ts:495-523` (delete does not call `releaseNumber`), `services/plivo-voice.ts`. |
| 6 | **One shared website installation instead of two containers per agency**, or static sites on Cloudflare Pages. Also correct the machine size: the Terraform asks for twice the free allowance documented today. | about ₹145 a site beyond the free machine; $36 a month on the first machine | `oci-provisioner/src/server.ts` (512 MB + 256 MB per agency, `MAX_SITES` 50), `terraform/modules/oracle-cloud/main.tf:102-134`. |
| 7 | **Make the live-updates component sleep.** Use the hibernation message handlers only, and let the platform answer keep-alive pings automatically so a ping does not wake it. | up to about ₹120 | `backend/src/durable-objects/realtime.ts:82-110`; the 30-second ping in the desktop app. |
| 8 | **Cheaper AI models and no unmetered AI.** Test Claude Haiku 5.5 ($0.10 / $0.50 per million tokens) for extraction and drafting against the Workers AI 70B model ($0.293 / $2.253) and Haiku 4.5 ($1 / $5). Replace the default text model, which is not on Cloudflare's price list. Route call summaries through the credit meter. Cache the fixed instructions (cache reads are 10% of the input price). | AI line from ₹152 towards ₹50 to ₹80, if quality holds | `services/ai-router.ts:77-85`, `services/ai-pricing.ts:16-29`, `services/ai-extraction.ts:109-122` (direct, unmetered). |
| 9 | **Move recordings to our own storage with a retention period**, and transcribe with the cheaper engine by default. Twilio keeps charging $0.0005 a minute a month for every recording ever made; after a year that is 262 minutes × 12 × $0.0005 = $1.57 an agency a month and growing. In R2 the same audio is about 1.5 GB × $0.015 = $0.02. | about ₹150 after a year, growing | `routes/voip-callbacks.ts:230-264` (stores the provider's address only), unused columns `recording_r2_key`, `recording_retention_days`. |
| 10 | **Stop the scheduled job looping over every agency every 5 minutes**, and trim per-request lookups. Fan out one queue message per agency; run daily checks once a day; remove the handlers that query tables which do not exist. Keep the agency lookup out of KV on every request (put it in the login token). Confirm in Google's console that an address costs one lookup, not one charge per keystroke, and ask for India pricing. | about ₹60 a month per agency at 1,000 agencies (KV $61, Maps about $600); mainly removes the 500-agency wall | `backend/src/index.ts:376-391`, `services/automation/schedule.ts`, `cron/*.ts`, `services/tenant-db.ts:16-36`, `desktop/src/components/ui/address-autocomplete.tsx`. |

Also worth doing, smaller: move email to a per-thousand provider once volume passes the SendGrid base plan; cap free trials (no SMS, no calls, 200 AI credits); wire per-agency databases before 200 agencies.

---

## 8. What I assumed and what would change the picture

| Assumption | If it is wrong |
|---|---|
| The platform pays for all messaging, as the code does today. | If agencies connect their own WhatsApp account and pay Meta directly, the WhatsApp line disappears for the platform. Worth checking Meta's partner programmes. |
| 100 SMS a month for a small agency (README). | If agencies send none, the "as coded" loss on Basic shrinks from ₹753 to a small profit. SMS should still be capped. |
| 20 login codes a month for a small agency. | Driver apps with weekly logins dominate this. An agency with 20 drivers uses about 90. |
| Agencies use the whole AI allowance. | Lighter use improves Pro and Enterprise margins by up to 20 to 25 points. |
| Meta's Indian rates from third-party summaries. | Confirm against Meta's rate card; Meta may change rates each quarter. |
| Oracle's free allowance is 2 OCPUs and 12 GB. | If the console still gives 4 and 24, the first 29 sites are free instead of 14. |
| 60 / 30 / 10 agency mix. | More small agencies lowers both revenue and cost per agency; margins after the fixes stay above 60%. |
| Prices exclude GST. | If ₹12,000 includes 18% GST, revenue is ₹10,169 and every margin above falls by about 15% of price. |

---

## 9. Sources

All retrieved 2026-10-09.

- [C1] Exchange rates dated 2026-10-08: https://open.er-api.com/v6/latest/USD
- [C2] Cloudflare Workers pricing (also summarises KV, R2, Queues, D1, Durable Objects): https://developers.cloudflare.com/workers/platform/pricing/
- [C3] Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- [C4] Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- [C5] Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- [C6] Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- [C7] Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- [C8] Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- [C9] Deepgram pricing: https://deepgram.com/pricing
- [C10] Plivo voice pricing, India: https://www.plivo.com/voice/pricing/in/
- [C11] Twilio voice pricing, India: https://www.twilio.com/en-us/voice/pricing/in
- [C16] Meta, WhatsApp Business Platform pricing: https://developers.facebook.com/docs/whatsapp/pricing
- [C17] Twilio WhatsApp pricing: https://www.twilio.com/en-us/whatsapp/pricing
- [C18] Meta India rates as reported: https://www.robylon.ai/blog/whatsapp-business-api-pricing-india , https://www.quickreply.ai/whatsapp-automation/whatsapp-business-api-pricing
- [C19] Twilio Verify pricing: https://www.twilio.com/en-us/verify/pricing
- [C20] Twilio SMS pricing by country: https://www.twilio.com/en-us/sms/pricing/in (and `/gb`, `/de`, `/us`, `/au`, `/ae`, `/sa`, `/sg`, `/my`)
- [C21] SendGrid email pricing: https://www.twilio.com/en-us/products/email-api/pricing
- [C22] Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- [C23] Google Maps Platform pricing overview, India note: https://mapsplatform.google.com/pricing/
- [C24] Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- [C25] Oracle ARM compute prices as tracked by a third party: https://pcr.cloud-mercato.com/providers/oracle/flavors/vm.standard.a1.flex.3-3/pricing (Oracle's own page https://www.oracle.com/cloud/compute/pricing/ returned an error)
- [C26] Razorpay pricing: https://razorpay.com/pricing/
- [C27] Stripe pricing, India: https://stripe.com/pricing
- [C28] MSG91 SMS pricing, India: https://msg91.com/in/pricing/sms
- [C29] Amazon SES pricing: https://aws.amazon.com/ses/pricing/
- [C30] Firebase pricing: https://firebase.google.com/pricing
- [C31] Apple Developer Program fee: https://developer.apple.com/support/enrollment/
- [C32] Google Play registration fee: https://support.google.com/googleplay/android-developer/answer/6112435
- [C33] Azure Artifact Signing, eligible countries: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart ; pricing page with no figures shown: https://azure.microsoft.com/en-us/pricing/details/artifact-signing/
- [C34] Code-signing certificate prices as reported by third parties: https://sslinsights.com/digicert-vs-sectigo-code-signing/ , https://sslinsights.com/sectigo-code-signing-certificate-guide/ , https://codenote.net/en/posts/windows-code-signing-ci-cost-per-signing-volume-2026/
- [C35] Cloudflare Registrar prices as tracked by a third party: https://cfdomainpricing.com/
- [C36] Travefy pricing: https://travefy.com/pricing
- [C37] TravelJoy pricing: https://traveljoy.com/pricing
- [C38] Zoho CRM pricing (India page): https://www.zoho.com/crm/zohocrm-pricing.html
- [C39] Sembark pricing: https://sembark.com/pricing

Code and internal documents read: `backend/wrangler.toml`, `backend/src/index.ts`, `backend/src/middleware/usage-cap.ts`, `backend/src/services/ai-pricing.ts`, `ai-credits.ts`, `ai-router.ts`, `backend/src/durable-objects/realtime.ts`, `desktop/src/components/ui/address-autocomplete.tsx`, `README.md` (cost section), `product-requirment/PRICING-cost-model-v3-final.md` (context only), `docs/launch/findings/01`, `02`, `03`.
