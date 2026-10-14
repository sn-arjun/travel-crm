# TravelCRM Pro: marketing plan

- Written 2026-10-14 for the founder (one or two people, cost-sensitive).
- Status: proposal. The prices in it are the proposal in `docs/COST-MODEL.md`, which awaits owner approval.
- Three kinds of statement are kept apart: **sourced facts** (with a URL and the date retrieved, 2026-10-14 unless stated), **repo facts** (with a file), and **assumptions** (labelled "assumption"). No customer names, results or testimonials exist, and none are invented.
- A note on sources: the web search tool returned summaries, not the vendors' own pricing pages. Every competitor price below is therefore second-hand. Open the vendor page and confirm before you print any comparison.
- Companion files: `LANDING-COPY.md`, `EMAIL-SEQUENCES.md`, `DEMO-SCRIPT.md` in this folder. The client onboarding playbook will live at `docs/HANDOFF-PLAYBOOK.md` (not written yet).

---

## 0. One-page summary

**Who we sell to first.** Owner-run travel agencies and tour operators in India with 5 to 25 staff. They get most enquiries on WhatsApp and phone, build quotes in Word, Excel or PDF, and often run their own vehicles or hire drivers. The buyer is the owner, who is also the person answering enquiries at night. (assumption: this profile is common; confirm in the first 20 conversations.)

**The one-line promise.** "Every enquiry that reaches your WhatsApp, email or website is read for you, and the next step is ready to approve with one click, from first message to hotel voucher."

**The first 90 days, in five bullets** (full calendar in section 6; weeks run Monday to Sunday from 2026-10-19):
1. Weeks 1 to 3: fix the site (remove unprovable claims, put in real buttons), build a list of 150 target agencies, record 3 short clips from the existing Assistant film, and talk to 15 owners without selling.
2. Weeks 3 to 6: recruit 3 design-partner agencies at a locked founder price, run them on the product by hand with you onboarding, and write down every objection.
3. Weeks 6 to 8: soft launch to the waitlist. Landing page live with demo and WhatsApp buttons. First paid agency target.
4. Weeks 8 to 12: weekly rhythm. Two demos a day on busy days, one short video a week, one search page a week, referral ask after every good demo.
5. Week 13: review the numbers, decide on the first spend, attend SATTE (19 to 21 January 2027, New Delhi) as a visitor if the numbers justify the trip [S1].

**The hard dependency.** Today a new agency cannot log in after being created, tenants share one database, and the packaged desktop app has no working load path (`docs/launch/findings/02-tenant-handoff-international.md`, "Blocks a real client handoff today", items 1 to 5). Nothing in this plan can sell a trial until those are fixed. Section 2.4 lists which marketing messages wait for which fix.

**Budget needed at each level** (monthly; detail in section 10; INR figures are assumptions):

| Level | Per month | What it buys |
|---|---|---|
| Zero-spend | ₹0 beyond tools already owned | Founder time only: about 25 hours a week. Free listings, WhatsApp, LinkedIn, YouTube from the local video pipeline. |
| Lean | ₹30,000 | Above, plus an email tool, a part-time video/content editor, a small paid test (₹10,000), one regional event or a trade-visit fund, referral rewards. |
| Scale | ₹1,50,000 | Above, plus a part-time sales/support hire, a paid review-site listing, sustained ads, event stalls. Only after the lean level shows a cost per paying agency you can afford. |

---

## 1. Positioning

### 1.1 Category

"CRM for travel agencies and tour operators" (the phrase buyers type). Inside it, we compete on **an assistant that works the inbox**, not on being a bigger CRM. Say "travel agency software" in search pages and "CRM" in B2B talk; Indian trade people say both.

### 1.2 The problem, in the buyer's words (assumption: phrased from how Indian and Gulf owners are described in trade sources; replace with exact quotes from your first 15 conversations)

- "Enquiries come on five WhatsApp numbers and nobody knows who replied."
- "My staff makes the quote in Word and it takes an hour. By then the customer has asked two other agents."
- "I find out a customer paid only when I check the bank app."
- "The hotel voucher goes out late or with the wrong date."
- "Drivers call me for every pickup detail."
- "When a staff member leaves, their customers leave with them."

Context that supports the WhatsApp point: WhatsApp has roughly 550 million users in India according to 2026 vendor-blog summaries; Meta's last official figure in the sources was "more than 500 million" (December 2024) [S2]. Those are vendor-blog figures, so use "over 500 million" and not the higher number. Small-business adoption figures in circulation (78%, 97%) are unverified vendor claims and must not be quoted [S2].

### 1.3 What is true in code today (the differentiators we may say)

Each line names the FEATURES.md row it rests on. "Works" is the status in `docs/FEATURES.md`; "partly" means wired with a named gap.

| Claim we can make | Evidence | Status |
|---|---|---|
| The assistant reads every incoming WhatsApp, SMS and email message and prepares the next step: create the lead, update it, mark won, record a payment, or draft a reply. You click Apply or Dismiss. | "AI reads every incoming message", "Suggestions queue" | Works (falls back to plain rules when AI is off or out of credits) |
| Money and customer messages always ask first. Every step is logged and most can be undone. | "Per-automation mode", "Activity log with undo", "Safety rails" | Works |
| One inbox for WhatsApp, SMS and email, one thread per customer. | "Unified inbox", "Conversation thread per contact" | Works. Inbound WhatsApp/SMS/email intake itself is "partly works" (needs the platform's provider accounts). |
| Quote to voucher in one flow: itinerary from a template and rate cards, branded PDF, send by WhatsApp or email, lead moves to Proposal Sent, follow-up scheduled, invoice from the itinerary, payment recorded, vouchers drafted per hotel stay. | Itinerary rows, "Move the lead to Proposal Sent", "Draft hotel vouchers once the advance is in" | Mostly works. "Send the quote" and "invoice from itinerary" are partly works. Say "draft", not "automatic". |
| Rate cards and supplier directory feed prices into the quote. | "Pick prices from rate cards while quoting" | Works |
| Fleet, drivers and trips in the same system; the driver app shows trips, accepts or rejects, updates status, checks in with photo and location. | Fleet rows, driver rows | Works / partly (check-in photo and location is partly works) |
| Roles: six fixed roles with permissions; owners see cost and margin, salespeople do not. | "Six roles", "Itinerary detail" | Works |
| Import your contacts and leads from a spreadsheet; export any list. | Import/export rows | Works |
| About 50 built-in reports. | Reports rows | Works |

**Per-agency data isolation** is a differentiator only once built. As of 2026-10-09 all agencies would share one database (FEATURES.md, "Separate database per agency: Broken"). Wait for readiness gate RG2 (section 2.4).

### 1.4 What we must not claim yet

Taken from FEATURES.md statuses and the findings. Each stays out of every asset until the named fix ships.

| Do not claim | Why | Wait for |
|---|---|---|
| "Click to call", VoIP, AI call transcription and summaries, caller pop-up | Place-a-call is Broken; transcripts and AI call summary are Placeholders; ADR-001 not yet signed off; India launch shape is call-bridge only and needs a legal check | G1 sign-off and call build; never in UAE, Saudi Arabia, Qatar, Thailand, Sri Lanka, Nepal, Bangladesh (ADR-001 section 4) |
| Website chat widget and WhatsApp chatbot answering 24/7 | Broken: endpoints sit behind login | Chatbot fix |
| Automatic reminders for follow-ups, overdue tasks, invoice due dates, visa and passport expiry, fleet document expiry | All Broken (scheduled jobs read tables that do not exist) | Cron fix |
| Schedule a campaign for later | Broken | Cron fix |
| Online payment collection (card, UPI) from the agency's customers | Placeholder: only a payment_link column | Payment gateway work |
| Driver push notifications, driver app on a store | Placeholder | Push SDK and store listings |
| Arabic interface, right-to-left, 10+ languages, "Spanish, French, Thai, Bahasa" | Desktop i18n is wired into 0 of 193 pages; no RTL | Arabic/RTL work (RG7) |
| GST-free invoicing, VAT, multi-currency billing, sales tax | Invoices always compute GST; money display hard-coded to INR | International invoicing (RG6) |
| Seat limits, 14-day trial that ends by itself | Not enforced; trial never expires | RG4 |
| "AI itinerary in 5 minutes", AI lead scoring, ask-your-data, BI briefings | All "partly works"; showcase notes record slow or empty results (health score 0/100, team revenue Rs 0) | Quality pass; test on real data before naming |
| 99.9% uptime, SLA, SSO, white label, API access, dedicated account manager | No monitoring; listed in plans but not built or enforced | Never until real |
| GDPR compliance, SOC, "enterprise-grade security" | No consent records, erasure, 2FA; provider keys stored in plain text | RG6 and security work |
| Number of customers, revenue managed, ratings, testimonials, agency names | None exist | Real customers, with written permission |

---

## 2. Markets: order and why

### 2.1 Order

1. **India** (start now, sell from the weeks 6 to 8 soft launch).
2. **Gulf, through Indian-run and South-Asian-run agencies in UAE** (after international invoicing, English interface only). Not Arabic-first.
3. **UK, Australia, US, through specialists who sell India and South Asia trips**, and through reseller partners (after RG6).
4. **South and South-East Asia** (Sri Lanka, Nepal, Bangladesh, Malaysia, Thailand, Singapore) through partners, last.

### 2.2 Why this order

- India is where the product is built (rupee prices, GST, HSN/SAC, Indian phone formats, UPI id setting), where the founder speaks the buyer's language, and where demos can be in person or by phone. FEATURES.md shows Indian-specific pieces work; the international pieces are "partly works".
- Gulf second, by a specific route: agencies run by Indian expatriates use English software and WhatsApp the same way. TAAI itself held its 2025 convention in Abu Dhabi, which shows the trade link [S3]. The blockers are VAT/currency fields and billing (findings 02, "Blocks selling outside India", items 1 to 3). The Arabic interface is a separate and later blocker; do not target Arabic-first agencies yet.
- UK/EU/US/Australia are crowded with US-built tools priced $19 to $59 a seat (section 3). The wedge is narrow: agencies that sell India and South Asia, who deal with Indian ground handlers and want a shared workflow. Needs consent records, erasure, 2FA and a UK/EU data position (findings 02, item 7 to 9). Treat this as a second-year market unless a partner brings it.
- SE and South Asia are price-sensitive (the cost model proposes $3 to $7 per user in Sri Lanka, Nepal and Bangladesh) and calling is not offered there. They suit partner-led selling, not founder time.

### 2.3 ICP and buying triggers by market group

| | India | Gulf | UK / EU / US / Australia | SE / South Asia |
|---|---|---|---|---|
| Who | Owner-run tour operators, DMCs and travel agencies, 5 to 25 staff. Sub-segments: (a) outbound holiday packagers, (b) domestic and inbound operators with vehicles and drivers, (c) pilgrimage and group operators (assumption: strong WhatsApp load). | Indian/South-Asian-run agencies in UAE, Oman, Qatar, Saudi, 3 to 15 staff, selling to the diaspora and tourists. | Independent agents and small specialists selling India, Sri Lanka, Nepal; consortia and host agencies later. | Small DMCs and inbound operators. |
| Decision maker | Owner or partner | Owner or general manager | Owner | Owner |
| Buying triggers (assumption, to verify) | Peak season overload (many Indian agencies are busiest around Diwali, winter and summer holidays); a staff member leaving with customer numbers; a missed high-value enquiry; GST invoicing mistakes; outgrowing Excel at 3+ staff; cost of Zoho/LeadSquared per seat. | Ramadan/Umrah/Hajj and summer peaks; one phone handling hundreds of enquiries [S4]; need to see response time by staff member. | Need to deal with Indian suppliers; client expects fast WhatsApp reply; tool renewal. | Peak-season overload; partner agency asks for faster quotes. |
| Language / channel | English, Hindi; WhatsApp, phone calls, LinkedIn, trade groups | English first; WhatsApp | English | English |
| Currency shown | INR, GST | USD list, AED/SAR display after RG6 | USD/GBP/EUR/AUD display after RG6 | USD |
| Calling | Not marketed at launch (ADR-001) | Not offered | Offered in UK, US, AU after build (ADR-001) | Not offered |
| Blocking work | RG1 to RG5 | RG6 (VAT, currency, billing) | RG6 plus consent/erasure/2FA | RG6 |

Market-size caveat: I found no reliable national count of Indian travel agencies. Association figures only: TAAI says about 2,500 member companies; a TAFI report puts it at roughly 1,400 members; TAFI also said about 1,000 agents are registered with the Ministry of Tourism [S5]. These overlap and are not the market. Do not state a market size in public material. (assumption: the reachable list of owner-run agencies is in the tens of thousands; unverified.)

### 2.4 Readiness gates that decide when each message can go live

Gate names are this plan's own labels for items in `docs/launch/findings/02-tenant-handoff-international.md`.

| Gate | What must be true | Unlocks |
|---|---|---|
| RG1 Handoff | A created agency's admin can sign in; welcome/invite email arrives; reset links use the real host (findings 02, blockers 1, 7) | Any trial, any paid agency |
| RG2 Isolation and deploy | Per-agency database wired; production deploy has bindings and migrations; CORS allows the real origin; file access checks tenant (blockers 2 to 4, 9) | The words "your data is isolated", any agency that holds real customer data |
| RG3 Installer | Packaged desktop app loads, has a real download link and configurable API address (blocker 5) | "Download" button |
| RG4 Plans and trial | One plan list; seat limits; trial ends by itself with caps (no SMS, no calls, small AI allowance per COST-MODEL section 4 and 6.3) (blocker 8) | "14-day trial", the pricing page |
| RG5 Site basics | Real Privacy and Terms pages; form endpoints for demo, trial, contact; real sender email | Any live CTA |
| RG6 International | Tax type respected on invoices, currency display, foreign billing, consent and erasure, 2FA (blockers listed under "Blocks selling outside India") | Any sale outside India |
| RG7 Arabic | Interface in Arabic and right-to-left | Arabic-first Gulf agencies, Saudi |
| RG8 Jobs | Reminder, expiry and campaign-scheduler jobs fixed | Reminder and campaign messages |
| RG9 Calls | G1 signed, legal opinion on India, call build finished | Any calling message, in allowed countries only |
| RG10 Driver store | Store listing or install link, push | "Get the driver app" |

---

## 3. Competitor brief

All prices below come from search summaries retrieved 2026-10-14 unless marked "COST-MODEL" (retrieved 2026-10-09 and recorded in `docs/COST-MODEL.md` section 5.4). Where sources disagree, both are shown. Strengths and gaps are drawn only from what the sources say; gaps marked "assumption" are inferences to test.

| # | Competitor | What it is | Public price | Strength | Gap / how we position |
|---|---|---|---|---|---|
| 1 | **Sembark** (India) | Travel CRM for Indian operators, DMCs and agencies | No prices published; per-user monthly plus a mandatory one-time setup fee (COST-MODEL, https://sembark.com/pricing). Vendor claims 1,000+ travel businesses (self-reported) and itineraries "under 60 seconds" (https://www.capterra.in/software/1011309/sembark-travel) | Closest direct rival: India focus, WhatsApp and itinerary sending, leads from ad platforms, operations calendar, payments tracking, MIS reports | Price not visible, setup fee. We show a price and can start without a setup fee (owner decision). Our difference is the assistant that reads each message and proposes the step with an undo trail, plus driver app. Do not claim they lack WhatsApp or itineraries. |
| 2 | **Zoho CRM** | General CRM, big in Indian SMB | Rs 800 per user per month Standard (techjockey list, https://www.techjockey.com/blog/best-travel-crm); COST-MODEL records Rs 800 / 1,400 / 2,400 / 2,600 on Zoho's India page; another summary says Rs 1,300 (https://www.techjockey.com/blog/best-travel-crm via search) | Brand trust, many integrations, one vendor for finance and mail | Not travel-specific as sold: no itinerary, rate card, voucher or fleet flow out of the box (assumption: check Zoho's travel templates). We are a quarter to a half of the cheapest paid tier on price (COST-MODEL 5.4, Rs 200 to 400). |
| 3 | **LeadSquared Travel CRM** | Indian sales CRM with a travel page | Rs 1,250 per user per month from its own travel page per search summary (https://leadsquared.com/travel-crm); a partner lists Lite from Rs 2,500 with a 20-user minimum | Strong for lead-heavy teams and larger sales floors | Cost and minimums suit bigger teams. We suit the 5 to 25 person owner-run agency. |
| 4 | **Kapture CRM** | Customer-service CRM with travel modules | Rs 2,494.57 per user per month (https://www.techjockey.com/blog/best-travel-crm); another blog says custom, about Rs 1,500 to 3,000 | Service desk and field-agent features | Priced and built for larger teams; implementation extra per one blog (low-confidence source). |
| 5 | **Freshsales / Tutterfly / other Indian listings** | General CRM, and a small travel CRM | Freshsales Rs 999 per user per month (listicle, unverified); Tutterfly Rs 700 per month, user basis not stated (https://www.techjockey.com/blog/best-travel-crm) | Low entry price | Check each one's current page before comparing. Price alone will not beat us; workflow depth is the argument. |
| 6 | **Travefy** (US) | Itinerary builder and CRM | Core $39 and Premium $59 a month billed yearly for the first seat; extra seats about $20 or $39 (COST-MODEL, https://travefy.com/pricing) | Polished client itineraries, US trade standing | USD, US workflows, no GST/Indian suppliers (assumption). A 3-user agency pays $79 to $137 against our $36 to $147 (COST-MODEL 5.4). |
| 7 | **TravelJoy** (US) | CRM and trip workflow for independent agents | Starter $19, Pro $39 a month ($32 yearly) (COST-MODEL, https://traveljoy.com/pricing) | Cheap, built for solo advisors | Solo-advisor orientation; limits on trips on Starter (12 a year per COST-MODEL). We fit teams with operations. |
| 8 | **Tern** (US) | CRM and itineraries for travel advisors | $49 per seat monthly, $35 per seat on quarterly or annual (https://tern.travel/pricing); a help page shows older figures ($39 monthly; $25 to $33 for 3 to 24 seats) | Full feature set on every plan; AI assist; commission reconciliation for agencies | US commission model. If a UK/US prospect uses Tern, win on the India-specialist workflow and messaging, not on price. |
| 9 | **Pipedrive / HubSpot** | General sales CRMs | Pipedrive Lite about $14 annual per seat up to $79 on Ultimate; plans renamed in 2025 and sources differ (https://marketbetter.ai/blog/pipedrive-pricing-breakdown-2026/ and others). HubSpot Starter about $10 to $20 per seat, free tier for up to two users (https://saascrmreview.com/hubspot-pricing/) | Free or cheap entry, huge ecosystems | No quote, voucher, fleet or itinerary. They manage a sales pipeline, not a trip. |
| 10 | **Wati** (WhatsApp team inbox) | WhatsApp shared inbox and chatbot, India | Growth Rs 2,499 per month for 5 users, Rs 699 each extra; Pro Rs 5,999; Business Rs 16,999; lower annual figures; Meta's message fees on top (https://support.wati.io/l/en/article/atywjbbe2t-what-is-the-pricing-for-wati and https://www.ycloud.com/blog/wati-pricing) | Mature WhatsApp tooling, official API | Only the inbox. Agency pays Wati and a CRM. We bundle the inbox with leads, quote, invoice and voucher (the Rs 1,000 a month for 5 users in our Basic proposal compares with Rs 2,499 for Wati Growth alone). Note: our WhatsApp sending still needs the platform's provider accounts and, per COST-MODEL section 7, a direct Meta route. |
| 11 | **Spreadsheets + personal WhatsApp** | The real incumbent | Free | Zero friction | Our true competitor in India. Positioning: "keep WhatsApp, add memory and a next step." |

### 3.1 How to use this table

- Never print a competitor's price in public copy without opening their live page that day. Keep screenshots with dates.
- In demos, ask "what are you using today?" first. Answer by competitor using the "How we position" column.
- Pricing talk: our nearest price comparisons are Zoho Rs 800 and Wati Growth Rs 2,499 (for five users). Do not call ourselves "cheapest"; call it "priced for a small agency, with the travel workflow included."
- Review the table every quarter: Pipedrive already renamed plans in 2025 and sources conflict.

---

## 4. Pricing page recommendation

### 4.1 Proposal restated (from COST-MODEL sections 5 and 6; awaiting owner approval)

Per user per month, billed yearly. Monthly billing 20% more. Minimum 5 users in India and 3 elsewhere.

| Market | Basic | Pro | Enterprise | Minimum users |
|---|---|---|---|---|
| India | Rs 200 | Rs 300 | Rs 400 | 5 |
| UK, EU, US, Australia, Singapore, Gulf | $12 | $29 | $49 | 3 |
| Malaysia, Thailand | $8 | $19 | $32 | 3 |
| Sri Lanka, Nepal, Bangladesh | $3 | $5 | $7 | 5 |

Whether prices include or exclude GST is open (COST-MODEL section 8 notes that if Rs 12,000 includes 18% GST, every margin falls). Show "plus GST" until the accountant confirms.

### 4.2 What each tier includes, today and honestly

The server blocks only a few groups by plan (FEATURES.md "Plan comparison"). So the real differences are:

| | Basic | Pro | Enterprise |
|---|---|---|---|
| Core CRM, inbox, itineraries, quotes, invoices, vouchers, tasks, reports, import/export, fleet, visa, assistant and automations | Yes | Yes | Yes |
| AI credits a month for the assistant (read 1, understand 5, scan 15, create 60) | 1,000 | 15,000 | 25,000 |
| AI composer, lead extraction from pasted text, itinerary generator, briefings, business intelligence (all "partly works") | No | Yes | Yes |
| Ask-your-data, lead scoring, document scan, smart follow-ups, chatbot, WhatsApp campaigns | No | No | Yes (chatbot Broken; others partly works) |
| Calls | Not at launch in any plan (ADR-001, COST-MODEL 6.3: not bundled) | | |

Observations:
- Basic already has the headline feature (the assistant, on rule-based reading when credits run out). Basic's 1,000 credits cover about 170 fully analysed messages (COST-MODEL section 4), so a busy small agency will run out in the first weeks and fall back to rules. Tell them honestly: "AI reading for your first few hundred enquiries each month, then rules."
- **Recommendation: launch with two public tiers, not three.** Show Basic and Pro. Show Enterprise as "Talk to us" without a price until the chatbot works and the intelligence features are verified on real data. Reason: three of its headline items are Broken or partly works (FEATURES.md), and the cost model says Enterprise is the least profitable at today's flat-agency prices. This is a recommendation; the owner may keep three.
- Rename for readers: **Starter / Professional** are the landing page's names; the server uses basic / pro / enterprise; the console uses other names. Pick one set before publishing (RG4).

### 4.3 Per-user or per-agency: both pages, and a recommendation

**Option A: per user (the proposal).**

> Basic: Rs 200 per user per month, billed yearly (minimum 5 users: Rs 1,000 a month, Rs 12,000 a year). Pro: Rs 300 per user per month (5 users: Rs 1,500 a month, Rs 18,000 a year).

**Option B: per agency (today's admin API).** The admin API has Rs 12,000, 18,000 and 24,000 a year with 5, 15 and 100 users (`docs/COST-MODEL.md` 5.1).

> Basic: Rs 12,000 a year, up to 5 users. Pro: Rs 18,000 a year, up to 15 users. Enterprise: Rs 24,000 a year, up to 100 users.

Why B might sell better: a small-agency owner wants one number, the 15-user Pro at Rs 18,000 looks very cheap, and Indian buyers compare "total per year". Why it loses: a 15-user Pro under A pays Rs 54,000 a year, three times B; a 100-user Enterprise at Rs 2,000 a month is Rs 20 a user and is the cost model's worst margin (50% before AI at 25% of revenue).

**Recommendation: show A, but present it the way B reads.** On the India page lead with the team total:
- A slider or three buttons: "Team of 5 / 10 / 15", showing the monthly and yearly total beside the per-user figure ("5 people: Rs 1,000 a month plus GST").
- Pack prices equal per-user x users, so there is nothing to explain at invoice time.
- Keep one line "Over 25 people? Talk to us" instead of a 100-seat flat price.
- Test B-style wording ("Rs 12,000 a year for a team of 5") in the first two weeks of demos and keep whichever gets fewer price objections. Record the objection counts.

**Price room.** COST-MODEL 5.4 notes that Zoho's cheapest paid tier is Rs 800 and our proposal is a quarter to a half of it, so there may be room to raise Indian prices. Do not raise now (nothing proven to charge for yet); but give design partners a **founder price locked for 24 months** so later increases do not hurt (owner decision).

### 4.4 Trial terms (recommendation; needs RG4)

- 14 days, no card, full features of the plan being tried, no SMS, no calls, AI allowance capped at about 200 credits (COST-MODEL section 4 and 6.3).
- Trial starts with a 30-minute onboarding call (our time) and **import of their contacts from a spreadsheet** (feature Works). Do not promise "30 seconds to set up" or "pre-loaded demo data".
- Free data migration: the landing page offers it for the first 500 contacts. Keep only if the owner agrees to do it by hand; label it as "we import your spreadsheet", not an automated migration.
- Day 10: email asks to convert. Day 15: account becomes read-only (needs engineering). Data kept for 30 days (assumption; align with the terms).

### 4.5 Annual versus monthly

- Annual billing is the default (it matches the cost model).
- Indian owners may balk at paying a year up front. Offer a **monthly option at +20%** (as the cost model proposes) and **quarterly at +10%** (assumption, owner's choice). Convert design partners to annual with the founder-price lock.
- Until Razorpay or Stripe checkout exists (FEATURES.md: online billing is a Placeholder; only manual payment recording exists), invoice by UPI or bank transfer and record it in the super admin. Say so honestly: "We invoice you; pay by UPI or bank transfer."

### 4.6 Add-ons

| Add-on | Price (proposal, COST-MODEL 6) | When to show |
|---|---|---|
| AI credit top-up | Rs 0.05 a credit; pack of 5,000 for Rs 250 | At launch (needs the credit meter UI) |
| Prepaid messaging balance | Rs 500 / 1,000 / 2,500 top-ups; marketing WhatsApp template Rs 1.25 each; utility templates included 300 / 1,000 / 3,000 a month by plan then Rs 0.20; India SMS Rs 0.50 on a domestic route only | When direct Meta route and DLT route exist |
| Extra WhatsApp volume | Same balance | Same |
| Calling | India call-bridge: Rs 599 a month with 1 number and 250 minutes; UK $12, US $15 bundles; per minute Rs 1.50 India | Hidden until RG9. Never shown for UAE, Saudi, Qatar, Thailand, Sri Lanka, Nepal, Bangladesh |
| One-time setup / data import | Owner decision (Sembark charges a mandatory setup fee) | Offer as optional paid "done for you" in week 9+ |

### 4.7 Price presentation per market

- **India:** Rs, plus GST, per user per month billed yearly, with team totals. UPI/bank transfer mention. English page with a Hindi version later (assumption: only after 10 customers).
- **Gulf (after RG6):** USD list with AED display; "per user per month, billed yearly".
- **UK/EU/US/Australia:** USD with GBP, EUR, AUD shown at round numbers (COST-MODEL 5.3). Do not show until foreign billing and tax invoices exist.
- **SE/South Asia:** the lower USD bands; show only to visitors in those countries (needs geo detection; otherwise quote by message).
- Always show: what is not included (calls, SMS, marketing WhatsApp are prepaid-balance items). Hidden usage fees destroy trust with a new vendor.

---

## 5. Channels for a tiny team, ranked

Ranking is by expected return per founder hour and per rupee, for the first 90 days. All returns are assumptions until measured; the "first metric" column is how you find out.

| Rank | Channel | Weekly routine | Hours / week | Cost / month | First metric |
|---|---|---|---|---|---|
| 1 | **Founder-led sales and demos** (phone, video call, in person in your own city) | Book 6 to 10 demos a week; 20-minute script (`DEMO-SCRIPT.md`); follow-up within 2 hours with the clip and a trial link; log every objection in a sheet | 10 | Rs 0 | Demos held per week; demo-to-trial rate |
| 2 | **WhatsApp outreach to a hand-built list** | Add 25 new agencies a day to a sheet from Google Maps, association member lists and LinkedIn; send 15 personal messages a day with a 20-second clip; no bulk blasts. Use your own WhatsApp Business app, one to one, with a relevant opening line. | 5 | Rs 0 | Reply rate (target 15 to 20%, assumption) |
| 3 | **Referral from design partners and early customers** | After each good demo or at day 14, ask for two introductions; track the source on every lead; reward what you can afford, such as one month free per paying referral | 1 | Reward cost only | Leads per customer |
| 4 | **Short video (YouTube Shorts, Instagram Reels, WhatsApp Status) from the feature shorts** | Publish 2 clips a week (workflow in section 7.4); each ends with "book a demo" and a WhatsApp link | 3 | Rs 0 (local pipeline; Remotion is free for companies of up to 3 people per `studio/README.md`) | Clicks to the WhatsApp link; demo bookings that cite video |
| 5 | **LinkedIn** (founder profile, not company page) | 3 posts a week: one clip, one lesson from a demo, one question to owners; 20 connection requests a day to agency owners; reply to every comment | 3 | Rs 0 | Profile views, connection acceptance, DMs |
| 6 | **Search pages (SEO)** per use case and per destination niche | One page a week from the list in section 7.3; basic on-page SEO; one link from each page to the demo form | 3 | Rs 0 (hosting exists) | Impressions in Search Console, then demo bookings from organic. Slow: expect little before month 4 (assumption). |
| 7 | **Travel-trade associations and events** | Join TAAI, TAFI and OTOAI regional chapter groups as a member or guest; attend local chapter meets; SATTE 19 to 21 January 2027 as a visitor [S1] (no 2026 TAAI or OTOAI convention dates were found [S1]) | 2 (spiky) | Rs 5,000 to 20,000 per event trip (assumption) | Conversations per event; demos booked |
| 8 | **Partnerships** | Four types, in section 5.1 | 2 | Rs 0 | Introductions per partner |
| 9 | **Review sites** | Create free profiles (the Capterra network lists vendors free, with paid per-click placement [S7]); ask each paying customer for an honest review; no fake reviews | 1 | Rs 0 free; paid per-click is a scale-level item | Reviews collected |
| 10 | **Paid ads** | Not before week 9. One test: Google search ads on "travel agency software India" style queries and a Meta lead ad; stop after 14 days if cost per demo is above Rs 3,000 (assumption) | 2 | Rs 10,000 (lean) | Cost per demo booked |

### 5.1 Partnerships in detail

| Partner type | Why | What to do | Caution |
|---|---|---|---|
| Accounting firms and GST consultants serving agencies | They see agency billing pain; invoices, credit notes and HSN/SAC work (FEATURES.md) | Offer a referral fee or a free account for their own practice; a one-page "GST invoices for travel agencies" explainer | Do not give tax advice in marketing; an accountant confirms GST treatment |
| Travel-tech vendors and B2B travel portals | Agencies already buy tickets and hotels from portals; a portal may recommend a CRM | Co-written guide, listing in a partner directory, cross-demos | A portal may sell its own CRM; check first |
| Trade associations (TAAI, TAFI, OTOAI chapters) | One talk reaches dozens of owners | Offer a free 20-minute session "stop losing WhatsApp enquiries" at a chapter meet | Associations may ask for a sponsorship fee |
| Reseller or white-label partners abroad (UK, Gulf, SE Asia) | They have the relationships and the language | Wait for RG6. Revenue share of 20% for the first year (assumption); one reference customer per region first | White label is listed in plans but not built (FEATURES.md); promise only a branded login page if even that |

### 5.2 What not to do

- No cold email blasts or bulk WhatsApp to scraped numbers: it can get your number blocked, and India's data protection duties take full effect around May 2027 [S8]. Keep outreach one to one with an opt-out line.
- No fake counts, testimonials or logos (the old landing page had them; see `LANDING-COPY.md` section 10).
- No marketing to a country where the product cannot yet invoice correctly.

---

## 6. Launch plan: 90 days, week by week

Owner of every item: the founder (assumption). Week 1 starts Monday 2026-10-19; week 13 ends Sunday 2027-01-17. Three phases: **pre-launch** (weeks 1 to 5), **launch** (weeks 6 to 8), **post-launch** (weeks 9 to 13).

The calendar assumes engineering ships RG1 to RG5 (section 2.4) by the end of week 5. If they slip, shift week 6 onwards and keep doing the weeks 1 to 5 work (it is useful regardless). Do not start a trial for a real agency before RG1 and RG2.

| Week | Dates | Do | Output |
|---|---|---|---|
| 1 | 19 to 25 Oct | Replace the landing page text with `LANDING-COPY.md`; point every button to a real WhatsApp link and a simple form (placeholders: section 8.1); remove the JSON-LD rating. Fix the one-line promise. Start the target sheet. | Honest site; sheet with 50 agencies |
| 2 | 26 Oct to 1 Nov | Talk to 8 owners for 20 minutes each, no selling: "how does an enquiry travel through your office?" Record exact phrases. Cut a 30-second and a 60-second clip from the existing Assistant film (check section 7.1 first). Start the shared objection log. | 8 conversations; first real quotes for copy |
| 3 | 2 to 8 Nov | 7 more conversations. Choose 3 design-partner candidates (one outbound packager, one with vehicles, one pilgrimage or group operator). Offer: free use for 60 days, founder price locked for 24 months (owner decision), weekly feedback call. Join two trade WhatsApp or LinkedIn groups as a member. | 15 conversations; 3 candidates |
| 4 | 9 to 15 Nov | Onboard design partner 1 by hand (needs RG1; until then, run it on your own demo tenant). Import their spreadsheet. Sit with them through the first day of real enquiries. | Partner 1 live |
| 5 | 16 to 22 Nov | Partners 2 and 3. Write up three before/after stories only with their written permission. Fix the five most embarrassing problems they find. Draft FAQ answers from real questions. | 3 partners; objection log with 30 lines |
| 6 | 23 to 29 Nov | **Soft launch.** Announce to the 150-name list and your network, one to one. Publish demo and trial forms (needs RG4 and RG5). Publish the first YouTube video (the edited Assistant film). First LinkedIn post. | First 10 demos booked |
| 7 | 30 Nov to 6 Dec | 2 demos a day on busy days. Trial emails run (`EMAIL-SEQUENCES.md`). First SEO page. First referral asks. | 10 demos done; 3 trials |
| 8 | 7 to 13 Dec | First paid agency target. Ask each design partner for an honest sentence, with permission to quote and name them. Publish the second video. | 1 to 2 paying (target, assumption) |
| 9 | 14 to 20 Dec | Review numbers (section 9). Decide on the Rs 10,000 ad test. Open free review-site profiles. Start the daily LinkedIn routine. | Decision log |
| 10 | 21 to 27 Dec | Year-end: many Indian agencies are busy with holiday travellers (assumption), so shift to short evening demos and recorded-demo links. Post the plan-comparison clip. | Steady pipeline |
| 11 | 28 Dec to 3 Jan | Quiet week: write 3 SEO pages in advance; update the FAQ; send a "what's new" email to all trials and leads. | 3 pages queued |
| 12 | 4 to 10 Jan | Ask satisfied customers for reviews and referrals. Plan the SATTE visit (book travel only if the funnel supports it). Prepare a one-page leave-behind. | 10 review asks sent |
| 13 | 11 to 17 Jan | Review the 90 days against section 9. Choose the lean or zero budget for the next quarter. Write the next 90 days. | Review document |

After week 13: SATTE 19 to 21 January 2027, New Delhi [S1]. For the Gulf and other countries, nothing starts until RG6.

---

## 7. Content plan

### 7.1 What video exists and what to check before using it

Existing assets (`desktop/showcase/SHOWCASE.md`, `studio/README.md`):
- "Assistant and automations, From a WhatsApp message to a booked trip", 3:22, with chapters.
- Story cut "A day at Sahyadri Holidays", 10:20.
- Full walkthrough, 29:53, every area.
- Narrated pilot, 74 seconds, built by the local pipeline. Planned films: 90-second hero, super-admin-to-client handoff, one film per role, plan comparison, one short per feature, automations-and-calls film, master cut.

Cautions:
1. **The full walkthrough includes chapters that show things we must not claim yet**: "Calls & VoIP" (22:08), "Chatbot" (22:28), "WhatsApp campaigns" (25:10), "AI assistant" (25:17), "Super admin" (29:14). Publish only edited cuts that leave these out until the gates in section 1.4 clear.
2. **Fix the on-screen defects listed in SHOWCASE.md "Application findings" before a public release**: the stray "0" on calendar cards, credit notes in the invoice list, unreadable segment criteria, raw `[Subject: ...]` in inbox previews, and the AI team-performance page showing Rs 0.
3. **Label demo data.** All recordings use "Sahyadri Holidays" demo data, and the incoming WhatsApp messages are delivered through a test simulator (SHOWCASE.md). Add an on-screen line "Demo data. Messages simulated." to the first and last frame so nobody thinks it is a customer.
4. **The automations-and-calls film waits for RG9.** Make an "automations" version without calls now.
5. The narrated voice awaits owner approval (gate G2 in `docs/launch/STATE.json`). Do not publish at volume before approval.

### 7.2 Which video goes where

| Asset | Landing page | YouTube | LinkedIn | WhatsApp Status and 1:1 | Demo follow-up | Trial emails |
|---|---|---|---|---|---|---|
| 90-second hero | Hero, muted loop | Pinned | Founder post, week 6 | Status | Demo email 1 | Welcome |
| Assistant film (3:22, edited) | "How it works" | Full upload with chapters | Native upload, 2 posts | Link to YouTube | Demo email 2 | Day 3 |
| Per-feature shorts (30 to 45 s) | Under each feature block | Shorts | Weekly clip | Status, 2 a week | Demo email 3, chosen by their pain | Days 2 to 12 by topic |
| Handoff film | Footer "how we start you" | Playlist | Post to prospects who ask how to move over | On request | Demo email 4 | Day 1 |
| One film per role | "For owners, sales, operations, accounts, drivers" | Playlist "By role" | Role-targeted post | Per-role forwards | By attendee role | Day 5 |
| Plan comparison | Pricing page | Short | Post when prices are approved | On request | Demo email 3 | Day 10 |
| Automations (no calls) | Assistant section | Upload | Post | Status | Demo email 2 | Day 6 |
| Calls film | Not published until RG9 and G1 | | | | | |
| Master cut | Link only | Upload | Link | On request | Offer to long evaluations | |

### 7.3 Twenty SEO page and article titles

Search volumes were not researched (no keyword tool access); the order is by buyer intent. Write for India first. (assumption: check titles in Search Console after 4 weeks.)

1. Best CRM for travel agencies in India: what to look for before you buy
2. Travel agency software: quote, invoice and voucher in one place
3. How to manage WhatsApp enquiries as a travel agency without losing leads
4. Travel itinerary software for tour operators: day-wise quotes from templates and rate cards
5. How to price a tour package: cost, margin and mark-up on a quote
6. GST invoices for travel agencies in India: a plain-language checklist (reviewed by an accountant before publishing)
7. How to create a hotel voucher for a tour booking, with a free template
8. Tour operator software with a driver app: assigning trips, vehicles and drivers
9. Travel CRM vs Excel: when a spreadsheet stops working
10. Lead follow-up for travel agents: a 7-step sequence that fits a WhatsApp inbox
11. What to ask in a travel CRM demo: 15 questions
12. Zoho CRM for travel agencies: what it does and where a travel-specific tool helps
13. Sembark alternatives for Indian tour operators (written fairly, with sources)
14. How to set up a pipeline for a DMC: stages from enquiry to final payment
15. Rate card management for travel suppliers: keep hotel and transport prices current
16. Visa application tracker for travel agencies: checklists, documents, status
17. Kerala tour operator software: quoting houseboats, hotels and transfers
18. Rajasthan, Himachal and Goa tour operator software: seasonal rate cards and group quotes (one page per region, built with real operator input)
19. Umrah and Hajj travel agency software: handling hundreds of enquiries in peak season (only if a pilgrimage operator becomes a design partner)
20. How an AI assistant helps a travel agency without sending anything on its own

Pages 12 and 13 name competitors; use only facts from their pages that you have saved with a date.

### 7.4 Repurposing workflow for each feature short

One feature short (30 to 45 seconds, from `studio/clips/<id>.json`) becomes seven assets in about 90 minutes:

1. Render the short with the local pipeline (`node src/build.mjs <clip>`). It also produces an `.srt` and chapters (studio README).
2. Export a 9:16 crop with burned captions for Shorts, Reels and Status (assumption: add a vertical layout to the clip kit, or crop in ffmpeg).
3. Upload the 16:9 file to YouTube with the `.srt`; the title uses the buyer's phrase ("Reply to WhatsApp enquiries faster"), not the feature name.
4. LinkedIn: native upload, three lines: the problem in the buyer's words, what the clip shows, a question.
5. WhatsApp: post to Status and keep a 20-second cut ready to send in one-to-one chats.
6. Write the matching SEO page or add the clip to an existing one; the transcript is the first draft.
7. Add the clip to the matching email slot (`EMAIL-SEQUENCES.md`) and to the demo follow-up library.

Track which clip each lead saw (a UTM tag or a "how did you hear about us" field).

---

## 8. Sales process

### 8.1 Lead capture on the site

Placeholders until RG5 supplies real endpoints (nothing exists today; every call to action is `href="#"`):

| Button | Target (placeholder) |
|---|---|
| Book a demo | `{{FORM_DEMO_URL}}`: name, agency, city, team size, phone with country code, "how do enquiries reach you today" |
| Start trial | `{{FORM_TRIAL_URL}}`: name, agency, email, phone, team size, country |
| WhatsApp us | `https://wa.me/{{WHATSAPP_NUMBER}}?text=Hi%2C%20I%20would%20like%20a%20demo` (a marketing link on the public site only; inside the CRM all messaging goes through the Communication Hub) |
| Contact | `mailto:hello@travelcrm.pro` (exists) |

Handling: every submission lands in one sheet within 5 minutes and the founder replies within 2 hours in business hours, by WhatsApp. Tag the source (video, LinkedIn, referral, search, event, outreach).

### 8.2 The funnel

Lead, WhatsApp reply, demo booked, demo held, trial, onboarding call, import done, first real enquiry in the CRM, day-10 conversion call, paying.

The best early predictor to watch (assumption): "first real enquiry handled in the product within 3 days of trial start".

### 8.3 Demo

Twenty-minute script and 5-minute version: `DEMO-SCRIPT.md`. It follows one Kerala family enquiry from WhatsApp to hotel voucher.

### 8.4 Trial onboarding

Day 0 call (30 minutes, you drive, they watch): import their contacts, set the company profile and numbering, invite two staff. Day 1: connect enquiry sources (website form key and receiving addresses, both in the Integrations page per FEATURES.md). Day 3 check: "did a real enquiry come in?". Emails: `EMAIL-SEQUENCES.md`.

### 8.5 Handoff to the client

After payment the client follows `docs/HANDOFF-PLAYBOOK.md` (to be written by the readiness work; it does not exist yet). Marketing's part: a "welcome and what happens next" email with the handoff film, the support WhatsApp number and a named person. Until the playbook exists, use the trial onboarding steps above.

### 8.6 Objections and answers

Answers use only what is true today. Where the honest answer is "not yet", say so and give a date only if one exists.

| Objection | Answer |
|---|---|
| "We use Excel and WhatsApp and it works." | Keep WhatsApp. The product adds a memory and a next step: the lead, quote and follow-up exist the moment a message arrives. Show 2 minutes of the inbox. |
| "Is my customer data safe with a new company?" | Be specific: roles limit who sees what; every change is logged for admins; you can export everything at any time. Say plainly that you are a new vendor and offer design-partner terms and a data export on request. Say "separate database per agency" only after RG2. Do not say "enterprise-grade" or "GDPR compliant". |
| "What if AI sends something wrong to a customer?" | The assistant never sends a customer message on its own. Replies open in the send dialog for a person to read and send; only low-risk steps that do not message a customer can run automatically, and only an admin can switch them on. Everything is logged and most steps can be undone (FEATURES.md "Safety rails"). |
| "Does it work with our WhatsApp number?" | Today it works through the platform's WhatsApp provider accounts; confirm the route for that agency before promising. Do not say "official WhatsApp Business API connected" until the direct route exists (COST-MODEL section 7, item 2). |
| "Can it call customers?" | Not at launch. Call logging is there; in-app calling is being planned. Never promise a date. |
| "Zoho or LeadSquared is cheaper or free for two users." | For a general CRM that may be true. Ask who builds the quote and the voucher today. Ours is Rs 200 per user a month for the full workflow (proposal). |
| "I don't want to pay a year up front." | Monthly is available at 20% more (proposal), or start as a design partner. |
| "Does it work in Hindi?" | The interface is English today. Hindi and Arabic are not complete in the desktop app (FEATURES.md: the language switch is a placeholder). Customer messages in any language are fine. |
| "We have drivers; can they use it?" | The driver app is built and works against the system; the store link is not published yet. Offer a direct install to design partners (needs RG10). |
| "Online payment links for customers?" | Not yet. You can record payments and issue invoices with PDF; online collection is planned, no date. |
| "What if you shut down?" | Export contacts, leads, invoices and more as files any time. State what you commit to, for example a data export for 90 days after cancellation (owner decision). |
| "Is there a contract?" | Annual billing, monthly at +20%, cancel before renewal. The terms page must exist first (RG5). |

---

## 9. Metrics

### 9.1 KPI tree, visitors to paying agencies

```
Paying agencies = Trials started x trial-to-paid rate
Trials started  = Demos held x demo-to-trial rate (+ self-serve trial forms)
Demos held      = Demos booked x show rate
Demos booked    = Qualified conversations x booking rate
Qualified conversations
                = Outreach sent x reply rate
                + Site visitors x form rate
                + Referrals + Event contacts
Retained agencies = Paying agencies still active at day 60 and day 90
```

### 9.2 90-day targets (all assumptions; reset after week 6 using real data)

| Metric | Target by week 13 | Basis |
|---|---|---|
| Owner conversations (no selling) | 15 | weeks 2 and 3 |
| Design-partner agencies live | 3 | week 5 |
| Outreach messages sent (one to one) | 600 | about 15 a day over 8 weeks |
| Replies | 100 to 120 | 15 to 20% reply |
| Demos held | 40 | |
| Trials started | 12 | 30% of demos |
| Paying agencies (including design partners who convert) | 5 | 40% of trials |
| Average paying users per agency | 6 | assumption |
| Monthly recurring revenue | about Rs 7,500 to 10,000 | 5 agencies x 6 users x Rs 250 to 300 at proposed prices |
| Day-60 active share of customers | 80% or more | assumption |
| Reviews and referrals | 5 reviews, 10 introductions | |
| Cost per paying agency at the lean level | under Rs 20,000 | Rs 30,000 x 3 months / 5; high on purpose, early |

These are small numbers on purpose. The aim of the first 90 days is to learn which agency type converts, not volume.

### 9.3 Weekly dashboard (one sheet, 15 minutes each Monday)

1. Outreach sent, replies, reply rate, by channel
2. Demo bookings, held, no-shows
3. Trials started, trials active (a real enquiry handled), trials converted
4. New paying agencies, MRR, cancellations
5. Top 3 objections this week (count)
6. Video views and clicks by clip; search impressions and clicks
7. Referral introductions
8. Spend this week (ads, tools, events, rewards)
9. Support questions by topic (feeds the FAQ)
10. Product blockers raised by prospects (feeds engineering)

---

## 10. Budgets

All INR figures are assumptions. Exchange rate used in the repo: 1 USD = Rs 96.83 (COST-MODEL, rate dated 2026-10-08).

### 10.1 Zero-spend (Rs 0 a month beyond what you already pay)

Time: about 25 hours a week of founder time (demos 10, outreach 5, content 6, partners and referrals 3, admin 1).
Buys: channels 1 to 9 of section 5: founder demos, one-to-one WhatsApp, LinkedIn, YouTube and Shorts from the local pipeline, free review-site profiles, free event attendance in your city, referral by free months, Search Console and a spreadsheet funnel.
Does not buy: paid reach, an editor, travel to events, or reply speed beyond one person's capacity.

### 10.2 Lean (Rs 30,000 a month, assumption)

| Item | Rs / month | Why |
|---|---|---|
| Email sending and sequences | 2,000 | The cost model puts SendGrid Essentials at $19.95 (about Rs 1,930); a marketing-email tool may differ |
| Part-time editor or designer for clips and posts | 8,000 | Frees about 5 founder hours |
| Paid test (search ad plus one Meta lead ad), capped | 10,000 | Run 14 days at a time (section 5, rank 10) |
| Events or trade visits | 5,000 | One local chapter meet a month; SATTE travel needs extra |
| Referral rewards and design-partner goodwill | 5,000 | Free months cost margin, not cash; this is a float |
| **Total** | **30,000** | |

### 10.3 Scale (Rs 1,50,000 a month, assumption)

Only after lean shows a cost per paying agency you can live with, and at least 10 paying agencies.

| Item | Rs / month | Why |
|---|---|---|
| Part-time sales and support person | 40,000 | Takes demos and onboarding; the founder keeps closing |
| Paid review-site listing | 48,000 | A commonly cited Capterra minimum is about $500 (about Rs 48,400), not confirmed [S7] |
| Sustained ads | 35,000 | After conversion rates are known |
| Events and a stall at a regional chapter or trade show | 15,000 | |
| Content and video editor | 8,000 | Same as lean |
| Email tool and sequences | 4,000 | |
| **Total** | **1,50,000** | |

---

## 11. Risks and mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| **Trust in a new vendor holding customer data** | Owners refuse to upload real customers | Design partners first; an honest "new vendor" line; export-anytime promise; show roles and the audit trail in the demo; name the data location only after RG2; written permission for any quote; fix plain-text provider keys and the file-access hole before charging (findings 02). |
| **Marketing ahead of the product** (trial users hit broken login, shared database, missing reminders) | Reputation damage a tiny team cannot recover from | Gate every message to RG1 to RG10; no trial before RG1 and RG2; keep the section 1.4 list visible. |
| **WhatsApp policy change** | Messaging stops or costs jump | Meta's rule banning general-purpose AI chatbots on the Business API took effect 2026-01-15, while business support and booking bots stay allowed; Meta decides what counts as the primary use case [S6]. Our assistant drafts replies for a person to send and is not a general chatbot. Keep email and SMS as fallbacks; follow Meta's price changes (quarterly, per COST-MODEL 1.5). Do not build the pitch on one provider. |
| **Competitor price cuts or free tiers** (HubSpot free for two users; Zoho entry price) | Price objections | Compete on workflow, not price; keep the founder-price lock; re-check competitor pages quarterly. |
| **A direct rival (Sembark) with a head start** | Longer sales cycles | Pick segments they may serve less (owner-run with vehicles and drivers; pilgrimage); win on visible price and the assistant; do not attack them. |
| **Indian data protection law** | Fines, trust issues | Main duties take effect around May 2027 [S8]; plan consent, notice and breach handling with the product work; keep outreach one to one; do not claim compliance yet. |
| **Telecom rules around calling in India and the Gulf** | Legal exposure | Do not market calling (ADR-001 sections 4 and 9a). |
| **Founder overload** (one person selling, onboarding and supporting) | Slow replies, burnout | Hard cap of 25 hours a week for marketing; stop channels with no result at week 9; limit design partners to 3; hire the part-time person only at the scale level. |
| **Demo data looks fake or simulated** | Loss of credibility | Label demo data; later replace with a design partner's permitted story. |
| **Unverified numbers on the old site stay live** (500+ agencies, $2.4M, 4.9 from 127, six named agencies, three named testimonials) | Legal and trust risk | Replace the page in week 1 (`LANDING-COPY.md` section 10). Remove the JSON-LD rating. |
| **Currency and tax errors for foreign customers** | Wrong invoices | Do not sell abroad before RG6. |

---

## 12. Sources

All retrieved 2026-10-14 through a web search tool that returns summaries; confirm on the page before quoting.

- [S1] SATTE 2027, 19 to 21 January 2027, Yashobhoomi, New Delhi: https://www.satte.in/ ; same dates for ATITHI 2027: https://www.eoibaghdad.gov.in/page/atithi-2027-reverse-buyer-seller-meet-rbsm-19-21-january-2027-at-yashobhoomi/ ; TAAI's 68th convention was in Abu Dhabi, 17 to 19 September 2025, and no 2026 TAAI or OTOAI convention dates were found: https://traveltradejournal.com/taai-to-host-its-68th-annual-convention-and-exhibition-in-abu-dhabi-from-september-17-19-2025/
- [S2] WhatsApp users in India (550 million vendor-blog figure; Meta "more than 500 million" in December 2024; SMB adoption claims unverified): https://hyperleap.ai/blog/whatsapp-statistics-india-2026 and https://www.grabon.in/indulge/tech/whatsapp-statistics/
- [S3] TAAI Abu Dhabi convention: see S1.
- [S4] UAE agencies and WhatsApp (vendor blogs, unverified figures): https://www.go4whatsup.com/gcc/whatsapp-for-umrah-hajj-agencies/ and https://www.chatdaddy.tech/blog/whatsapp-crm-uae
- [S5] Association sizes: TAAI about 2,500 members (https://travtalkindia.com/taai-sees-sharp-membership-growth-set-to-add-nearly-400-500-soon-sunil-kumar/); TAFI about 1,400 members and about 1,000 registered with the Ministry of Tourism (https://travtalkindia.com/tafi-adds-183-new-members/)
- [S6] WhatsApp Business API ban on general-purpose AI chatbots from 2026-01-15: https://respond.io/blog/whatsapp-general-purpose-chatbots-ban and https://www.business-standard.com/technology/tech-news/meta-bans-ai-chatbots-from-whatsapp-business-api-chatgpt-to-shut-down-jan-2026-125102200335_1.html
- [S7] Capterra free listing and pay-per-click (ownership moved to G2 in early 2026 per one source): https://www.rfp.wiki/vendors/capterra and https://b2bsaasreviews.com/?p=11011
- [S8] India DPDP Rules 2025 phases (notified November 2025; main duties around May 2027): https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force- and https://www.voicendata.com/policy/dpdp-framework-unfolds-with-staged-compliance-plan-10715945
- Competitor prices: see section 3 for each URL. Travefy, TravelJoy, Zoho and Sembark figures were retrieved 2026-10-09 and recorded in `docs/COST-MODEL.md` section 5.4 and sources C36 to C39.
- Repo evidence: `docs/FEATURES.md`, `docs/features.json`, `docs/COST-MODEL.md`, `docs/decisions/ADR-001-voip.md`, `docs/launch/findings/02-tenant-handoff-international.md`, `landing/index.html`, `studio/README.md`, `desktop/showcase/SHOWCASE.md`, `desktop/e2e/showcase/assistant.spec.ts`.
