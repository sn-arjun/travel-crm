# TravelCRM Pro pricing

- Status: proposal for the owner, written 2026-10-20. The owner delegated pricing on 2026-10-21 ("good profit, also good value for the customer and me"). After approval, a later batch writes the migration from section 7 without re-deciding anything.
- Fixed by earlier owner decisions and kept here: price per agency per YEAR, extra users and AI credit packs sold on top, every allowance capped, communication packs at provider cost × 1.2 or more, no calling in India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh.
- All prices exclude GST and VAT. The tax engine adds them.
- Exchange rates used (open.er-api.com, 2026-10-20): 1 USD = INR 95.05 = GBP 0.7511 = EUR 0.8915 = AUD 1.4325 = AED 3.6725. Costs that the provider bills in USD and that we bill in another currency carry a 3% exchange buffer.
- Inputs: `docs/COST-MODEL.md` (unit costs, usage profile), `docs/decisions/ADR-001-voip.md` (calling), `docs/marketing/MARKETING-PLAN.md` (competitors), the catalogue migrations `backend/drizzle/master/0013`, `0015`, `0021`, `0022`, `0024`, and the code in `backend/src/services/plans/`, `metering/`, `billing/addons.ts`, `voip/metering.ts`.
- Three kinds of statement are kept apart: figures from sources (cited), my assumptions (marked), my arithmetic.

---

## 1. Recommendation

Keep one price per agency per year, but anchor it on about INR 250 per user per month in India and about GBP 15 / USD 20 per user per month elsewhere, with fewer users included outside India. India: **Basic INR 14,999 (5 users), Pro INR 29,999 (10 users), Enterprise INR 74,999 (25 users)** a year; UK **GBP 449 / 899 / 1,799** (3 / 5 / 10 users); US and Singapore **USD 590 / 1,190 / 2,390**; Gulf **USD 490 / 990 / 1,990** (no calling). Agencies that sign before 2027-04-01 pay a founder price 20% lower (India INR 11,999 / 23,999 / 59,999, which keeps the owner's original INR 12,000 Basic), locked for 24 months. Allowances are deliberately modest and the same in every market (the schema has no market column on allowances): Basic 3,000 AI credits, 300 WhatsApp template messages, 1,000 emails, 10 login codes, 100 call minutes; Pro and Enterprise scale up from there (section 2). Everything beyond is an upgrade or a pack. Packs are priced from provider cost with `margin_pct` 25 in India and 30 elsewhere, which leaves at least cost × 1.218 after gateway fees. Two cheap code changes must land before selling outside India: split WhatsApp metering into utility and marketing, and give the UK, EU and Australia their own catalogue markets (section 8).

### Why, in short

- **Value.** A five-person Indian agency pays about INR 84,000 a year for Zoho CRM Standard plus a WhatsApp inbox (Wati) plus a website. Our Basic is INR 14,999 with all three (18% of that stack). A five-person UK agency pays about GBP 2,400 a year for Travefy plus Wati plus a dialler; our Pro is GBP 899 plus GBP 3.52 a month for a number (about 39%). Section 5.
- **Profit.** Gross margin for a typical agency at list price (section 4): India 66% small, 52% medium, 54% large; UK 78%, 75%, 74%; UAE 79%, 74%, 72%. At founder prices the small agency still makes 59% in India, 75% in the UK and 77% in the UAE.
- **What changed from the draft.** The draft gave Enterprise 100 users for INR 24,000 (INR 20 a user a month) and lost money on a typical large agency once SMS, login codes and AI were counted. Enterprise now has 25 users at the same per-user rate as the other plans, and every extra user costs INR 2,400 a year.
- **The weakest spot.** In India, login codes still go by Twilio Verify SMS at INR 13.04 each. That one line is 8% to 10% of Pro and Enterprise revenue. Moving login codes to a WhatsApp authentication template (INR 0.14) lifts India Pro from 52% to 62% margin. It is the most valuable code change in this document.

### Margin per plan per market (typical agency, list price, per month)

| Market | Basic | Pro | Enterprise |
|---|---|---|---|
| India (INR) | 828 of 1,250 (66%) | 1,291 of 2,500 (52%) | 3,355 of 6,250 (54%) |
| UK (GBP, includes extra users) | 41.55 of 53.42 (78%) | 93.42 of 124.92 (75%) | 220.62 of 299.92 (74%) |
| UAE / Gulf (USD, includes extra users) | 45.45 of 57.50 (79%) | 98.23 of 132.50 (74%) | 227.62 of 315.83 (72%) |
| US (USD, includes extra users) | 58.31 of 69.17 (84%) | 134.23 of 161.67 (83%) | 320.81 of 386.67 (83%) |
| Australia (AUD, includes extra users) | 70.96 of 99.08 (72%) | 157.11 of 231.17 (68%) | 368.75 of 552.00 (67%) |

"Typical agency" = the COST-MODEL section 2 profile (5, 10 and 25 users), with usage capped at the plan allowance. Packs bought above the allowance are extra revenue at 22% margin and are left out.

---

## 2. Plans

### 2.1 Markets and billing currency

The catalogue groups countries into markets in `backend/src/services/plans/catalogue.ts` (`marketForCountry`). Today: `IN`, `GULF`, `SG`, `MY_TH`, `LK_NP_BD`, and `WEST` for everything else. I add three markets (`UK`, `EU`, `ANZ`) so those agencies are billed in their own currency and their call packs are priced at their own minute cost. Until that code change ships, UK, EU and Australian agencies fall into `WEST` and pay the USD price, which works but is not what they expect.

| Market key | Countries | Bills in | Gateway | Calling |
|---|---|---|---|---|
| IN | India (and agencies with no country) | INR | Razorpay | No |
| UK (new) | GB | GBP | Stripe | Yes |
| EU (new) | EU and EEA countries, CH | EUR | Stripe | Second wave (Germany first) |
| ANZ (new) | AU, NZ | AUD | Stripe | Yes (AU) |
| WEST | US, CA and every country not listed | USD | Stripe | Yes (US) |
| SG | Singapore | USD (SGD later; the key `SG` is also a country code used by call weighting, so a GBP-style split needs a new key) | Stripe | Yes |
| GULF | AE, SA, QA, OM, KW, BH | USD, shown in AED at the fixed 3.6725 peg | Stripe | No |
| MY_TH | Malaysia, Thailand | USD | Stripe | Malaysia in the second wave; Thailand no |
| LK_NP_BD | Sri Lanka, Nepal, Bangladesh, Bhutan, Maldives | USD | Stripe | No |

### 2.2 Yearly prices

List price applies from 2027-04-01. Founder price applies to agencies that sign from 2026-11-01 to 2027-03-31 (section 6). Both are loaded now as `plan_prices` rows with different `valid_from` dates.

| Market | Basic list (founder) | Pro list (founder) | Enterprise list (founder) |
|---|---|---|---|
| IN | INR 14,999 (11,999) | INR 29,999 (23,999) | INR 74,999 (59,999) |
| UK | GBP 449 (359) | GBP 899 (719) | GBP 1,799 (1,439) |
| EU | EUR 529 (419) | EUR 1,059 (849) | EUR 2,119 (1,699) |
| ANZ | AUD 849 (679) | AUD 1,699 (1,359) | AUD 3,399 (2,719) |
| WEST | USD 590 (470) | USD 1,190 (950) | USD 2,390 (1,910) |
| SG | USD 590 (470) | USD 1,190 (950) | USD 2,390 (1,910) |
| GULF | USD 490 (390) | USD 990 (790) | USD 1,990 (1,590) |
| MY_TH | USD 390 (310) | USD 790 (630) | USD 1,590 (1,270) |
| LK_NP_BD | USD 190 (150) | USD 390 (310) | USD 790 (630) |

How the numbers were set:

- India: INR 250 per user per month at the included users on every plan (5, 10, 25). Extra users INR 2,400 a year (INR 200 a month), so an extra user is cheaper than the plan average and upgrading is still worth it for the features and allowances.
- UK, US, SG: about GBP 12.50 / 15 / 15 per included user per month; USD prices are the GBP prices at the day's rate, rounded. EUR and AUD are the USD price converted and rounded.
- Gulf: about 17% below WEST because calling is not offered there.
- MY_TH and LK_NP_BD: about two-thirds and one-third of WEST, as in COST-MODEL 5.3. LK_NP_BD sits a little above India because foreign cards and currency cost more to collect.

### 2.3 Included users and extra users

| Market | Users included (Basic / Pro / Enterprise) | Extra user per year (Basic / Pro / Enterprise) |
|---|---|---|
| IN | 5 / 10 / 25 | INR 2,400 / 2,400 / 2,400 |
| UK | 3 / 5 / 10 | GBP 96 / 120 / 120 |
| EU | 3 / 5 / 10 | EUR 110 / 135 / 135 |
| ANZ | 3 / 5 / 10 | AUD 170 / 215 / 215 |
| WEST | 3 / 5 / 10 | USD 120 / 150 / 150 |
| SG | 3 / 5 / 10 | USD 120 / 150 / 150 |
| GULF | 3 / 5 / 10 | USD 100 / 120 / 120 |
| MY_TH | 3 / 5 / 10 | USD 80 / 100 / 100 |
| LK_NP_BD | 5 / 10 / 25 | USD 40 / 50 / 50 |

Extra users bought mid-year are pro-rated to the paid year (already built, `billing/addons.ts`).

### 2.4 Trial

- 14 days, no card, 3 users, the Pro feature set, no calling (platform setting `voip_calling_on_trial` = 0, owner decision 2026-10-21), no SMS.
- Trial allowances: 500 AI credits, 30 WhatsApp template messages, 10 login codes, 200 emails, 1 GB storage, no website.
- Reason for the small AI allowance: the draft gave a trial 2,000 credits, more than Basic. A trial should show the assistant working, not run a free month of it.

### 2.5 Monthly allowances (same in every market)

The catalogue reads allowances per plan only (`plan_allowances` has no market column), so one set must be safe in the dearest market. Units are per calendar month; nothing carries over.

| Allowance key | Trial | Basic | Pro | Enterprise | Enforced today? |
|---|---|---|---|---|---|
| `ai_credits` | 500 | 3,000 | 15,000 | 30,000 | Yes |
| `whatsapp` (step A: every paid template, utility or marketing) | 30 | 300 | 950 | 2,500 | Yes |
| `whatsapp` (step B: utility templates only) | 20 | 250 | 750 | 2,000 | After the split |
| `whatsapp_marketing` (step B) | 10 | 50 | 200 | 500 | After the split |
| `sms` | 0 | 0 | 20 | 50 | Yes |
| `otp` (login codes) | 10 | 10 | 20 | 40 | Yes |
| `email` (agency sends; system mail is never metered) | 200 | 1,000 | 5,000 | 10,000 | Yes |
| `call_minutes` (only where calling exists) | 0 | 100 | 250 | 500 | Yes |
| `storage_gb` | 1 | 5 | 20 | 50 | No (row is informational) |
| `websites` | 0 | 1 | 1 | 2 | No (row is informational) |

Notes:

- WhatsApp replies inside the 24-hour window the customer opened are free and are not metered (`routes/communications.ts`, `meterOutbound`). The allowance only counts template messages.
- What 3,000 AI credits buys on Basic: about 500 incoming messages read and understood (1 + 5 credits each, `ai-pricing.ts`). A small agency receives about 600 (COST-MODEL section 2), so Basic covers most of a month instead of the first week.
- Call minutes: a minute to the agency's own country counts as one; a dearer destination counts as more than one (`voip/metering.ts`). The phone number itself is a paid add-on (section 3.6); no plan includes one.
- Storage costs almost nothing (R2 USD 0.015 per GB-month; 50 GB is USD 0.75). Websites run on the one shared WordPress installation (owner decision 2026-10-21); R310 sizes the free machine at about 20 sites.

### 2.6 Features per plan

Only six feature keys are enforced by the server today (`backend/src/index.ts:253-271`): `voip_calling`, `ai_extraction`, `ai_intelligence`, `ai_chatbot`, `whatsapp_campaigns`, and `ai_assistant` (which gates every `/ai/*` route). The others are shown or hidden in the desktop app, or not checked at all. R127 (feature switches) will let the super admin change these per plan and per agency.

| Feature key | Trial | Basic | Pro | Enterprise | Change from the 0015 seed |
|---|---|---|---|---|---|
| fleet_management, driver_app, visa_management, supplier_management, marketing_flyers, bulk_sms, bulk_email | Yes | Yes | Yes | Yes | none |
| bulk_whatsapp | Yes | **Yes** | Yes | Yes | **added to Basic.** WhatsApp is how Indian and Gulf agencies talk to customers; the allowance caps the cost. |
| voip_calling | No (setting) | Yes | Yes | Yes | none (only where calling is offered) |
| ai_assistant | Yes | **Yes** | Yes | Yes | **added to Basic** as a taster; 3,000 credits cap the cost. Check that each `/ai/*` sub-feature also checks its own key, because `ai_assistant` opens the whole `/ai/*` prefix. |
| ai_message_compose | Yes | **Yes** | Yes | Yes | **added to Basic** (drafting a reply is the cheapest AI action that shows value) |
| ai_extraction, ai_copilot, ai_call_summary, ai_lead_scoring, ai_itinerary_generate, ai_cost_estimation, ai_ocr, ai_search | Yes | No | Yes | Yes | none |
| advanced_reports | No | No | Yes | Yes | none |
| whatsapp_campaigns | **Yes** | No | **Yes** | Yes | **moved from Enterprise to Pro.** Bulk WhatsApp marketing is the main thing an Indian agency would otherwise buy Wati for (INR 2,499 a month). The `whatsapp_marketing` allowance and packs cap the cost. |
| ai_intelligence | **Yes** | No | **Yes** | Yes | **moved from Enterprise to Pro.** `docs/features.json` already lists the business-intelligence features (`ai.bi-*`) as Pro, but the route is gated by a key only Enterprise had. |
| custom_domain | No | No | **Yes** | Yes | **moved from Enterprise to Pro.** A website on the agency's own domain is expected at this price; it costs us nothing extra on the shared installation. |
| ai_chatbot, ai_dialer_cards, ai_vehicle_recommend, ai_driver_recommend, ai_expense_analysis, ai_margin_insights, ai_payment_prediction, ai_visa_intelligence, ai_campaign_content, ai_campaign_optimize, ai_follow_up_suggest, ai_churn_prediction, ai_daily_briefing, ai_supplier_negotiate, ai_coaching | No | No | No | Yes | none |
| api_access, white_label, priority_support | No | No | No | Yes | none. None of these is enforced or fully built; do not lead Enterprise marketing with them. |

Flags for the owner:

- `docs/features.json` says lead scoring, document scan and plain-English search are Enterprise, but the catalogue has given `ai_lead_scoring`, `ai_ocr` and `ai_search` to Pro since 0015. I keep them in Pro and the feature inventory should be corrected.
- Enterprise is mostly "more": more users, more allowances, the chatbot and the 14 Enterprise AI features (all "partly works" in FEATURES.md). That is honest, but the marketing plan's advice stands: show Enterprise as "talk to us" until the chatbot works on a real site.

---

## 3. Add-ons

### 3.1 How pack prices are computed

- The engine computes a communication pack as `units × unit_cost × (1 + margin_pct / 100)`, rounded up to the cent or paisa (`plans/pricing.ts`). It refuses to sell below cost × 1.20 (`billing/addons.ts`, `MIN_COMM_MARGIN_PCT`).
- Owner rule: cost × 1.2 or more **after** card and gateway fees. Fees assumed: India Razorpay 2% plus 18% GST on the fee = **2.36%**; elsewhere Stripe on an Indian account charging in a foreign currency, 4.3% plus 2% conversion = **6.3%** (COST-MODEL 1.11; not confirmed for this account).
- So `margin_pct` = **25 in India** (net 1.25 × 0.9764 = cost × 1.221) and **30 elsewhere** (net 1.30 × 0.937 = cost × 1.218).
- Packs last for the calendar month in which they are paid (`billing/addons.ts`). See section 6 for why that should change.
- Every price below is computed from the unrounded cost; the engine works from the five-decimal `unit_cost` in section 7 and may differ by one cent or paisa.

### 3.2 AI credit packs (fixed price; not communication, so no margin rule)

Provider cost: about INR 0.02 a credit (COST-MODEL section 2), so 10,000 credits cost about INR 196 or USD 2.07.

| Market | 10,000 credits | 50,000 credits |
|---|---|---|
| IN | INR 499 | INR 1,999 |
| UK | GBP 7 | GBP 27 |
| EU | EUR 8 | EUR 32 |
| ANZ | AUD 13 | AUD 49 |
| WEST, SG, GULF, MY_TH, LK_NP_BD | USD 9 | USD 35 |

The draft pack (5,000 credits for INR 250) is retired. The new India price per credit (INR 0.05, then 0.04 in the large pack) is the same as the draft.

### 3.3 Communication packs: cost, fee, price, margin

"Net / cost" is what is left after the gateway fee, divided by provider cost. Every row is at least 1.2.

| Market | Pack | Provider cost | Price | Gateway fee | Net | Net / cost |
|---|---|---|---|---|---|---|
| IN | 100 SMS (Twilio) | INR 814.56 | INR 1,018.21 | INR 24.03 | INR 994.18 | 1.221 |
| IN | 1,000 WhatsApp utility (step B) | INR 137.07 | INR 171.34 | INR 4.04 | INR 167.30 | 1.221 |
| IN | 1,000 WhatsApp marketing | INR 1,155.27 | INR 1,444.09 | INR 34.08 | INR 1,410.01 | 1.221 |
| IN | 100 login codes (Twilio Verify SMS) | INR 1,304.08 | INR 1,630.11 | INR 38.47 | INR 1,591.64 | 1.221 |
| IN | 5,000 emails | INR 244.76 | INR 305.96 | INR 7.22 | INR 298.74 | 1.221 |
| UK | 500 SMS | GBP 21.66 | GBP 28.16 | GBP 1.77 | GBP 26.39 | 1.218 |
| UK | 1,000 WhatsApp utility (step B) | GBP 17.02 | GBP 22.13 | GBP 1.39 | GBP 20.74 | 1.218 |
| UK | 500 WhatsApp marketing | GBP 24.56 | GBP 31.94 | GBP 2.01 | GBP 29.93 | 1.218 |
| UK | 200 login codes | GBP 16.40 | GBP 21.33 | GBP 1.34 | GBP 19.99 | 1.219 |
| UK | 20,000 emails | GBP 7.74 | GBP 10.06 | GBP 0.63 | GBP 9.43 | 1.218 |
| UK | 500 call minutes | GBP 12.61 | GBP 16.39 | GBP 1.03 | GBP 15.36 | 1.218 |
| EU | 250 SMS | EUR 25.71 | EUR 33.43 | EUR 2.11 | EUR 31.32 | 1.218 |
| EU | 500 WhatsApp utility (step B) | EUR 25.25 | EUR 32.83 | EUR 2.07 | EUR 30.76 | 1.218 |
| EU | 250 WhatsApp marketing | EUR 31.33 | EUR 40.74 | EUR 2.57 | EUR 38.17 | 1.218 |
| EU | 100 login codes | EUR 14.88 | EUR 19.34 | EUR 1.22 | EUR 18.12 | 1.218 |
| EU | 20,000 emails | EUR 9.18 | EUR 11.94 | EUR 0.75 | EUR 11.19 | 1.218 |
| EU | 500 call minutes (active since R137, migration 0029) | EUR 20.38 | EUR 26.50 | EUR 1.67 | EUR 24.83 | 1.218 |
| ANZ | 500 SMS | AUD 37.99 | AUD 49.40 | AUD 3.11 | AUD 46.29 | 1.218 |
| ANZ | 1,000 WhatsApp utility (step B) | AUD 16.67 | AUD 21.68 | AUD 1.37 | AUD 20.31 | 1.218 |
| ANZ | 500 WhatsApp marketing | AUD 62.10 | AUD 80.74 | AUD 5.09 | AUD 75.65 | 1.218 |
| ANZ | 200 login codes | AUD 29.95 | AUD 38.94 | AUD 2.45 | AUD 36.49 | 1.218 |
| ANZ | 20,000 emails | AUD 14.76 | AUD 19.19 | AUD 1.21 | AUD 17.98 | 1.219 |
| ANZ | 250 call minutes | AUD 24.55 | AUD 31.92 | AUD 2.01 | AUD 29.91 | 1.218 |
| WEST | 1,000 SMS | USD 13.30 | USD 17.29 | USD 1.09 | USD 16.20 | 1.218 |
| WEST | 2,000 WhatsApp utility (step B) | USD 6.80 | USD 8.84 | USD 0.56 | USD 8.28 | 1.218 |
| WEST | 500 WhatsApp marketing | USD 12.50 | USD 16.25 | USD 1.02 | USD 15.23 | 1.218 |
| WEST | 200 login codes | USD 12.66 | USD 16.46 | USD 1.04 | USD 15.42 | 1.218 |
| WEST | 20,000 emails | USD 10.00 | USD 13.00 | USD 0.82 | USD 12.18 | 1.218 |
| WEST | 1,000 call minutes | USD 20.50 | USD 26.65 | USD 1.68 | USD 24.97 | 1.218 |
| SG | 500 SMS | USD 29.55 | USD 38.42 | USD 2.42 | USD 36.00 | 1.218 |
| SG | 1,000 WhatsApp utility (step B) | USD 16.00 | USD 20.80 | USD 1.31 | USD 19.49 | 1.218 |
| SG | 500 WhatsApp marketing | USD 36.60 | USD 47.58 | USD 3.00 | USD 44.58 | 1.218 |
| SG | 200 login codes | USD 21.82 | USD 28.37 | USD 1.79 | USD 26.58 | 1.218 |
| SG | 20,000 emails | USD 10.00 | USD 13.00 | USD 0.82 | USD 12.18 | 1.218 |
| SG | 250 call minutes | USD 14.91 | USD 19.39 | USD 1.22 | USD 18.17 | 1.218 |
| GULF | 100 SMS | USD 19.49 | USD 25.34 | USD 1.60 | USD 23.74 | 1.218 |
| GULF | 1,000 WhatsApp utility (step B) | USD 15.70 | USD 20.41 | USD 1.29 | USD 19.12 | 1.218 |
| GULF | 500 WhatsApp marketing | USD 28.81 | USD 37.45 | USD 2.36 | USD 35.09 | 1.218 |
| GULF | 100 login codes | USD 24.49 | USD 31.84 | USD 2.01 | USD 29.83 | 1.218 |
| GULF | 20,000 emails | USD 10.00 | USD 13.00 | USD 0.82 | USD 12.18 | 1.218 |
| MY_TH | 100 SMS | USD 33.89 | USD 44.06 | USD 2.78 | USD 41.28 | 1.218 |
| MY_TH | 1,000 WhatsApp utility (step B) | USD 14.00 | USD 18.20 | USD 1.15 | USD 17.05 | 1.218 |
| MY_TH | 250 WhatsApp marketing | USD 21.50 | USD 27.95 | USD 1.76 | USD 26.19 | 1.218 |
| MY_TH | 50 login codes | USD 19.44 | USD 25.28 | USD 1.59 | USD 23.69 | 1.218 |
| MY_TH | 20,000 emails | USD 10.00 | USD 13.00 | USD 0.82 | USD 12.18 | 1.218 |
| MY_TH | 250 call minutes (inactive until the second wave) | USD 19.79 | USD 25.73 | USD 1.62 | USD 24.11 | 1.218 |
| LK_NP_BD | 2,000 WhatsApp utility (step B) | USD 15.40 | USD 20.02 | USD 1.26 | USD 18.76 | 1.218 |
| LK_NP_BD | 500 WhatsApp marketing | USD 30.20 | USD 39.26 | USD 2.47 | USD 36.79 | 1.218 |
| LK_NP_BD | 20,000 emails | USD 10.00 | USD 13.00 | USD 0.82 | USD 12.18 | 1.218 |

No SMS or login-code packs in LK_NP_BD: Twilio's prices for those countries were not checked.

### 3.4 WhatsApp packs during step A

Until the code meters marketing and utility templates separately, one WhatsApp allowance and one pack cover both, and an agency can spend all of it on marketing. So in step A the `whatsapp` pack is priced at the **marketing** rate. Step A prices of the `whatsapp` pack (same keys and sizes as the step B utility pack):

| Market | Pack | Step A price |
|---|---|---|
| IN | 1,000 | INR 1,444.09 |
| UK | 1,000 | GBP 63.87 |
| EU | 500 | EUR 81.48 |
| ANZ | 1,000 | AUD 161.48 |
| WEST | 2,000 | USD 65.00 |
| SG | 1,000 | USD 95.16 |
| GULF | 1,000 | USD 74.90 |
| MY_TH | 1,000 | USD 111.80 |
| LK_NP_BD | 2,000 | USD 157.04 |

A utility-heavy agency overpays in step A (in India by about 8 times). That is the cost of shipping before the split; the split is a small change and should come first.

### 3.5 Unit costs behind the packs (billing currency, per unit)

| Market | WhatsApp marketing | WhatsApp utility | SMS | Login code | Email | Call minute | Number per month |
|---|---|---|---|---|---|---|---|
| IN | INR 1.15527 | INR 0.13707 | INR 8.14562 | INR 13.04082 | INR 0.04895 | not offered | not offered |
| UK | GBP 0.04913 | GBP 0.01702 | GBP 0.04332 | GBP 0.08200 | GBP 0.00039 | GBP 0.02521 | GBP 2.70769 |
| EU | EUR 0.12534 | EUR 0.05050 | EUR 0.10284 | EUR 0.14875 | EUR 0.00046 | EUR 0.04076 | EUR 1.23960 |
| ANZ | AUD 0.12421 | AUD 0.01667 | AUD 0.07599 | AUD 0.14977 | AUD 0.00074 | AUD 0.09821 | AUD 4.42657 |
| WEST | USD 0.02500 | USD 0.00340 | USD 0.01330 | USD 0.06330 | USD 0.00050 | USD 0.02050 | USD 1.15 |
| SG | USD 0.07320 | USD 0.01600 | USD 0.05910 | USD 0.10910 | USD 0.00050 | USD 0.05965 | USD 5.00 |
| GULF | USD 0.05761 | USD 0.01570 | USD 0.19490 | USD 0.24490 | USD 0.00050 | not offered | not offered |
| MY_TH | USD 0.08600 | USD 0.01400 | USD 0.33890 | USD 0.38890 | USD 0.00050 | USD 0.07915 | USD 4.00 |
| LK_NP_BD | USD 0.06040 | USD 0.00770 | not checked | not checked | USD 0.00050 | not offered | not offered |

Where they come from:

- WhatsApp: Meta per-message rates effective 2026-07-01, from a third-party copy of Meta's rate card (zernio.com, retrieved 2026-10-20). Meta's own page lists further increases on 2026-10-01 for UAE and Saudi marketing and for "Rest of Asia Pacific" (Australia) marketing without the figures, so those three carry a 15% buffer. The EU uses Germany's rates (the dearest named EU market); the Gulf uses Saudi Arabia's (dearest); LK_NP_BD uses Meta's "Other" rate because the new named rates were not found. Messages go direct to Meta (R213); the Twilio route adds USD 0.005 a message and is not assumed.
- SMS: Twilio list prices per country (COST-MODEL 1.6; UK rechecked 2026-10-20: USD 0.056). US includes USD 0.005 carrier fees. India is Twilio's international route at USD 0.0832, the only India SMS route in the code.
- Login codes: Twilio Verify USD 0.05 per successful check plus the SMS (COST-MODEL 1.7; `services/twilio.ts`, `routes/driver.ts`).
- Email: USD 0.0005 an email (my assumption: SendGrid's reported 100,000-email tier at USD 34.95 plus headroom; the draft row was INR 0.08). The owner asked for a Cloudflare Email analysis; if adopted, lower this row.
- Calls: Twilio list prices rechecked 2026-10-20 for GB, AU and SG; US, DE and MY from ADR-001 3.1. Per counted minute = 70% mobile + 30% landline outbound + USD 0.004 softphone leg + USD 0.0025 recording. Inbound minutes are cheaper and count the same, so this is conservative.
- Numbers: Twilio voice pages: GB USD 3.50 (the SMS page shows USD 1.15 for a number without voice; the draft used 1.15, which is too low for a calling number), AU USD 3.00, US USD 1.15, DE USD 1.35, MY USD 4.00. SG: Twilio does not show a national-number price; USD 5.00 is the ADR's Plivo figure.

### 3.6 Phone number rental (monthly; calling markets only)

| Market | Provider cost | Price per month | Net after fee / cost |
|---|---|---|---|
| UK | GBP 2.71 | GBP 3.52 | 1.218 |
| ANZ | AUD 4.43 | AUD 5.76 | 1.219 |
| WEST (US) | USD 1.15 | USD 1.50 | 1.222 |
| SG | USD 5.00 | USD 6.50 | 1.218 |
| EU (active since R137; Germany-based price) | EUR 1.24 | EUR 1.62 | 1.225 |
| NL (draft, **not for sale**) | not entered | not entered | n/a |
| MY_TH (second wave, Malaysia) | USD 4.00 | USD 5.20 | 1.218 |

Release rules already approved: 14 days after cancelling, 7 days of unpaid rent.

**How a number is priced (R137).** The number price is looked up by the agency's own country first, then by its market. A `phone_number` product whose market is the agency's ISO country code (for example `NL`) wins, and once such a product exists, active or draft, it is the only one that country can buy. A Dutch agency therefore gets `PRICE_NOT_CONFIGURED` (the agency is told pricing is not available yet) until the owner enters Twilio's real NL number price and activates the `NL` row and the `phone_number_nl` add-on in the super admin catalogue; it never pays the Germany-based EU price by accident. German agencies and other EU countries without a country row keep the EU price. Call minutes keep their rule: a destination row counts only when active with a price above zero, so a minute to a Dutch number is priced by the EU market row while the NL draft is off.

### 3.7 Headline add-on prices

- Extra user: INR 2,400 / GBP 96–120 / USD 120–150 a year (section 2.3).
- AI credits: INR 499 or USD 9 for 10,000.
- WhatsApp marketing: INR 1,444 for 1,000; GBP 31.94 for 500; USD 16.25 for 500 (US).
- Email: INR 306 for 5,000; GBP 10.06 / USD 13.00 for 20,000.
- Call minutes: GBP 16.39 for 500 (UK); USD 26.65 for 1,000 (US); AUD 31.92 for 250.
- Numbers: GBP 3.52, USD 1.50 (US), AUD 5.76, USD 6.50 (SG) a month.

---

## 4. Margin table

Per agency per month. Usage = COST-MODEL section 2 (small 5 users, medium 10, large 25), capped at the plan allowance. Revenue includes extra users where the plan includes fewer.

Cost lines:

- Infra share: Cloudflare, maps, live updates, the shared website installation (INR 40 a site, COST-MODEL 3.3) and the fixed platform cost (INR 5,270 a month) spread over 100 agencies: INR 99 / 105 / 122 a month for small / medium / large (USD 1.04 / 1.10 / 1.28).
- Gateway fee on the subscription: India 3.42% (Razorpay 2% + 0.9% for subscriptions, plus GST on the fee); elsewhere 7% (Stripe 6.3% + Stripe Billing 0.7%).
- Login codes still by Twilio Verify SMS. The last column shows that line if codes went by WhatsApp.

### 4.1 India (INR, list prices)

| | Small (Basic) | Medium (Pro) | Large (Enterprise) |
|---|---|---|---|
| Revenue | 1,250 | 2,500 | 6,250 |
| WhatsApp templates | 65 | 194 | 632 |
| SMS | 0 | 163 | 407 |
| Login codes | 130 | 261 | 522 |
| Email | 24 | 98 | 392 |
| Calls | 0 | 0 | 0 |
| AI credits | 61 | 303 | 607 |
| Infra share | 99 | 105 | 122 |
| Gateway fee | 43 | 85 | 214 |
| **Total variable cost** | **422** | **1,209** | **2,895** |
| **Gross margin** | **828 (66%)** | **1,291 (52%)** | **3,355 (54%)** |
| Login codes by WhatsApp instead | 1 | 3 | 5 |
| Margin with WhatsApp codes | 957 (77%) | 1,549 (62%) | 3,872 (62%) |

Founder price, small agency: revenue INR 1,000, cost about INR 413, margin INR 587 (59%).

### 4.2 UK (GBP, list prices)

| | Small (Basic + 2 users) | Medium (Pro + 5 users) | Large (Enterprise + 15 users) |
|---|---|---|---|
| Revenue | 53.42 | 124.92 | 299.92 |
| WhatsApp templates | 3.31 | 9.92 | 31.37 |
| SMS | 0.00 | 0.87 | 2.17 |
| Login codes | 0.82 | 1.64 | 3.28 |
| Email | 0.19 | 0.77 | 3.09 |
| Calls (100 / 250 / 500 minutes) | 2.52 | 6.30 | 12.61 |
| AI credits | 0.48 | 2.40 | 4.79 |
| Infra share | 0.81 | 0.85 | 0.99 |
| Gateway fee | 3.74 | 8.74 | 20.99 |
| **Total variable cost** | **11.87** | **31.50** | **79.30** |
| **Gross margin** | **41.55 (78%)** | **93.42 (75%)** | **220.62 (74%)** |

Founder price, small agency: revenue GBP 45.92, margin about GBP 34.58 (75%). Number rental is a separate add-on with its own 22% margin and is left out.

### 4.3 UAE (Gulf market, USD, list prices; no calling)

| | Small (Basic + 2 users) | Medium (Pro + 5 users) | Large (Enterprise + 15 users) |
|---|---|---|---|
| Revenue | 57.50 | 132.50 | 315.83 |
| WhatsApp templates | 3.67 | 11.00 | 35.09 |
| SMS | 0.00 | 3.90 | 9.74 |
| Login codes | 2.45 | 4.90 | 9.80 |
| Email | 0.25 | 1.00 | 4.00 |
| AI credits | 0.62 | 3.10 | 6.20 |
| Infra share | 1.04 | 1.10 | 1.28 |
| Gateway fee | 4.03 | 9.28 | 22.11 |
| **Total variable cost** | **12.05** | **34.27** | **88.22** |
| **Gross margin** | **45.45 (79%)** | **98.23 (74%)** | **227.62 (72%)** |

Founder price, small agency: revenue USD 49.17, margin about USD 37.71 (77%). In AED at the peg: revenue AED 211, margin AED 167 (list price).

### 4.4 Worst case: an agency uses every allowance (step B allowances)

Cost as a share of plan revenue (included users only, list price, fee included). Below 100% means the plan still makes money even when fully used.

| Market | Basic | Pro | Enterprise |
|---|---|---|---|
| IN | 38% | 60% | 51% |
| UK | 38% | 56% | 65% |
| WEST (US) | 21% | 28% | 30% |
| ANZ | 42% | 61% | 68% |
| SG | 41% | 59% | 66% |
| GULF | 35% | 54% | 63% |
| MY_TH | 50% | 81% | 95% |
| LK_NP_BD | 52% | 83% | 95% |
| EU (priced at German rates) | 58% | 91% | **112%** |

- In step A (one WhatsApp allowance, all of it spent on marketing) India Pro rises to about 90% and Enterprise to about 84%. Still not a loss, but thin. This is why the split comes first.
- The EU at German WhatsApp rates loses money at full use on Enterprise. Before selling in Germany, either add a market column to `plan_allowances` (the clean fix) or launch the EU without Germany and use the "Rest of Western Europe" rates (USD 0.0592 / 0.0171), which bring EU Enterprise well under 100%.
- MY_TH and LK_NP_BD Enterprise come close to cost at full use for the same reason: global allowances against low local prices. Same fix.

---

## 5. Value check

Competitor prices retrieved 2026-10-20 unless marked; third-party sources are marked as such. Prices exclude tax.

### 5.1 Competitors

| Product | Market | Price | Source |
|---|---|---|---|
| Zoho CRM | India | INR 800 / 1,400 / 2,400 / 2,600 per user per month (Standard to Ultimate) | Zoho India page via COST-MODEL [C38], 2026-10-09 |
| Zoho CRM | UAE | about AED 45–55 per user per month Standard, AED 75–85 Professional | cloudfysystems.com and codingclave.com (third party, conflicting) |
| Wati (WhatsApp team inbox) | India / global | Growth INR 2,499 a month (some sources INR 2,699); Pro INR 5,999–7,499; USD 59 / 119 / 279 a month billed yearly; Meta fees on top | getmacha.com, quickreply.ai, ycloud.com (third party, conflicting) |
| LeadSquared, Kapture | India | INR 1,250 and about INR 1,500–3,000 per user per month | MARKETING-PLAN section 3 (2026-10-14) |
| CRMtravel | India | from INR 40,000 a year | capterra.in listing |
| Sembark | India | not published; per user plus a one-time setup fee | sembark.com/pricing via COST-MODEL |
| Travefy | US / UK | Core USD 39 a month billed yearly + USD 20 per extra seat; Premium USD 59 + USD 39 | travefy.com/pricing |
| TravelJoy | US | Pro USD 32 a month billed yearly (solo) | COST-MODEL [C37] |
| Tern | US | USD 35 per seat billed yearly | MARKETING-PLAN section 3 |
| Tourwriter | NZ / global | about USD 99 to 299 per user per month | Capterra, GetApp, FitGap (third party; tourwriter.com/pricing returned 404) |
| HubSpot Starter | global | "starts at USD 7" to USD 20 per seat per month (page ambiguous) | hubspot.com/pricing/crm |
| Pipedrive | global | USD 14 / 39 / 49–59 / 79 per seat per month billed yearly | zeeg.me, automationatlas.io (third party; Pipedrive's page blocked) |
| Bitrix24 | global | Basic USD 49 a month for 5 users; Standard USD 99 for 50 (billed yearly) | bitrix24.com/prices |
| Vtiger | global | USD 12 / 30 / 42 per user per month billed yearly | Capterra, prospeo.io (third party) |
| Aircall | UK / US | Essentials about USD 30 per licence per month billed yearly, 3-licence minimum, plus usage | justcall.io, ringly.io (third party) |
| JustCall | global | USD 29 / 49 / 89 per user per month billed yearly | casrai.org, costbench.com (third party) |

### 5.2 What a comparable stack costs a year

| Agency | Stack elsewhere | Stack cost | TravelCRM Pro | Share |
|---|---|---|---|---|
| India, 5 users | Zoho CRM Standard (INR 800 × 5 × 12 = 48,000) + Wati Growth (2,499 × 12 = 29,988) + website (assumption: INR 6,000 for hosting, domain and upkeep) | INR 83,988 | Basic INR 14,999 (founder 11,999) | 18% |
| India, 10 users | Zoho Standard (96,000) + Wati Pro (5,999 × 12 = 71,988) + website (6,000) | INR 1,73,988 | Pro INR 29,999, includes WhatsApp campaigns | 17% |
| UK, 5 users | Travefy Core with 4 extra seats (USD 119 × 12 = 1,428, about GBP 1,073, website builder included) + Wati Growth (USD 708, GBP 532) + Aircall Essentials 3 licences (USD 1,080, GBP 811) | GBP 2,416 | Pro GBP 899 + number GBP 42 a year = GBP 941 | 39% |
| UAE, 5 users | Zoho Standard (AED 45 × 5 × 12 = AED 2,700, USD 735) + Wati Growth (USD 708) + website (assumption: USD 150) | USD 1,593 | Pro USD 990 | 62% |

What the stack has that we do not: mature products, wide integrations, brand trust. What we have that the stack does not, in one login: a travel workflow (itinerary, quote, invoice, voucher, visa, fleet, driver app), a WhatsApp inbox with the assistant reading each message, a website, and calling in the UK, US, Australia and Singapore. The saving is large enough that the owner can say "good value" without discounting, which is why the founder discount is time-limited.

---

## 6. Discounts and policies

| Topic | Recommendation |
|---|---|
| Yearly or monthly | Yearly only at launch (the catalogue and checkout are built for yearly). Add monthly later at **+25%** (INR 1,562 a month for Basic) once a `monthly_price` and monthly gateway plans exist. Do not offer quarterly by hand; it creates manual work. |
| Founder price | 20% off list for agencies that sign from 2026-11-01 to 2027-03-31. Loaded as `plan_prices` rows with `valid_from` 2026-11-01; list rows take over on 2027-04-01. |
| Price lock | Founder agencies keep the founder price for 24 months while they renew without a break. As I read the code, a renewal is charged by the gateway subscription created at checkout (Stripe or Razorpay), so a catalogue change does not reprice it. Verify this in test mode; if renewals re-quote from the catalogue, add a locked price on the subscription row. |
| Design partners | First 10 agencies: 50% off the first year in exchange for weekly feedback and a named case study. Grant by hand (super admin). |
| Nonprofit | No separate tier. Travel agencies are commercial; pilgrimage trusts can ask, and the owner decides case by case. |
| Setup fee | None by default. Offer an optional paid "we import your spreadsheet and set up your website" service (suggest INR 4,999 / GBP 149 / USD 199) outside the catalogue. |
| Refunds | 14-day free trial, no card. Full refund within 30 days of the first yearly payment. After that no refund; cancelling stops the next renewal (`cancel_at_period_end` exists). Extra users are not refunded. Packs are not refunded once any unit is used. |
| Upgrades and downgrades | Upgrade any time, charged pro rata for the rest of the paid year (check the code supports it; I did not find it). Downgrade only at renewal. |
| Pack validity | Today a pack lasts only for the calendar month it was paid in, so a pack bought on the 28th is worth three days. Change it to "this month and next month" (or 60 days) before launch. It costs nothing and removes the most likely complaint. |
| Allowance alerts | Keep the 80% and 100% alerts (built). They are what makes capped allowances feel fair. |
| Tax | Show "plus GST" (India) and "plus VAT where it applies" everywhere. |

---

## 7. Catalogue load appendix

Everything below maps one-to-one to the columns created in `backend/drizzle/master/0015_plan_catalogue.sql` (plus `0013`, `0022`, `0024` rows). IDs are UUIDv7. Dates are UTC.

**Step A** = load now; no code change needed. **Step B** = load when WhatsApp marketing is metered on its own (section 8, change 2); the rows are already inserted in step A with `is_active` 0 and step B only switches them on and changes three allowance amounts.

### 7.1 `plans` (UPDATE existing rows)

| key | name | description | sort_order | is_public | trial_days | is_active |
|---|---|---|---|---|---|---|
| trial | Trial | 14-day trial of the Pro feature set for 3 users. No calling, no SMS. | 0 | 0 | 14 | 1 |
| basic | Basic | Travel CRM, WhatsApp inbox, website and the assistant for a small agency. | 1 | 1 | 0 | 1 |
| pro | Pro | Adds WhatsApp campaigns, AI tools, business intelligence and a custom domain. | 2 | 1 | 0 | 1 |
| enterprise | Enterprise | More users and allowances, website chatbot and every AI feature, priority support. | 3 | 1 | 0 | 1 |

### 7.2 `plan_prices`

Deactivate the 0015 rows for paid plans (`UPDATE plan_prices SET is_active = 0 WHERE id IN ('01a13a7c-5808-7673-bc0d-99f298ff87cb', '01a13a7c-5808-7673-bc0d-99f33173ee8c', '01a13a7c-5808-7673-bc0d-99f4d1d7afbc')`). Keep the trial row `01a13a7c-5807-7e56-adc4-d71a10d865a0` (IN, INR 0, 3 users); other markets fall back to it for the trial seat count. Insert:

| id | plan_key | market | currency | yearly_price | included_users | extra_user_yearly_price | is_active | valid_from |
|---|---|---|---|---|---|---|---|---|
| 01a157e5-2f00-73f2-81bc-235af989ca7d | basic | IN | INR | 11999 | 5 | 2400 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f01-71c7-b9a0-fa2edd093f91 | pro | IN | INR | 23999 | 10 | 2400 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f02-78fd-905a-483667b00301 | enterprise | IN | INR | 59999 | 25 | 2400 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f03-7cdf-8e85-614423507059 | basic | UK | GBP | 359 | 3 | 96 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f04-767e-bbfc-5c8dc264e586 | pro | UK | GBP | 719 | 5 | 120 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f05-785e-a04a-74b1f028306a | enterprise | UK | GBP | 1439 | 10 | 120 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f06-7970-9735-f8fd5fd84112 | basic | EU | EUR | 419 | 3 | 110 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f07-7a48-bc54-4bafadc5bbf8 | pro | EU | EUR | 849 | 5 | 135 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f08-798a-a650-d876d0339759 | enterprise | EU | EUR | 1699 | 10 | 135 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f09-75f4-9ff7-15350610a353 | basic | ANZ | AUD | 679 | 3 | 170 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f0a-7387-a100-7a720faa6157 | pro | ANZ | AUD | 1359 | 5 | 215 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f0b-76a2-9d95-a0dfe6b01f54 | enterprise | ANZ | AUD | 2719 | 10 | 215 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f0c-78d4-8fef-0495c27bb898 | basic | WEST | USD | 470 | 3 | 120 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f0d-75da-a873-03f10fca41cb | pro | WEST | USD | 950 | 5 | 150 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f0e-7ea6-a154-b716a52980b8 | enterprise | WEST | USD | 1910 | 10 | 150 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f0f-7cb9-8cc9-5ee758acfaa8 | basic | SG | USD | 470 | 3 | 120 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f10-71b2-a9cb-e60bd08c505b | pro | SG | USD | 950 | 5 | 150 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f11-7f34-a1cc-b80445132550 | enterprise | SG | USD | 1910 | 10 | 150 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f12-7157-885c-196a60ee7dc8 | basic | GULF | USD | 390 | 3 | 100 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f13-7142-b4d1-c56d275627fb | pro | GULF | USD | 790 | 5 | 120 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f14-7bb1-b277-0ec058b739fc | enterprise | GULF | USD | 1590 | 10 | 120 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f15-7603-b5c2-6528d8dd76cb | basic | MY_TH | USD | 310 | 3 | 80 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f16-7bcd-a454-96e4a77d5f18 | pro | MY_TH | USD | 630 | 5 | 100 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f17-7394-b483-72b2c4ac1023 | enterprise | MY_TH | USD | 1270 | 10 | 100 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f18-7ec7-a1cf-9e38f6ddd9b3 | basic | LK_NP_BD | USD | 150 | 5 | 40 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f19-79d1-8eef-1bb8b5027ed3 | pro | LK_NP_BD | USD | 310 | 10 | 50 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f1a-7127-9be4-69cfd37a143f | enterprise | LK_NP_BD | USD | 630 | 25 | 50 | 1 | 2026-11-01T00:00:00Z |
| 01a157e5-2f1b-7f09-b5a7-485f75702cf5 | basic | IN | INR | 14999 | 5 | 2400 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f1c-70b7-b48b-443610ff3d33 | pro | IN | INR | 29999 | 10 | 2400 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f1d-7184-98e3-3b475cca8af8 | enterprise | IN | INR | 74999 | 25 | 2400 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f1e-7fb9-a671-da116026ac2c | basic | UK | GBP | 449 | 3 | 96 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f1f-7a63-a7c0-78084d530f8f | pro | UK | GBP | 899 | 5 | 120 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f20-799b-b4b0-ea7e9a4d648d | enterprise | UK | GBP | 1799 | 10 | 120 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f21-79ec-b985-50ab43936885 | basic | EU | EUR | 529 | 3 | 110 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f22-72bf-98b3-58d7b145fa90 | pro | EU | EUR | 1059 | 5 | 135 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f23-7495-902b-a5d6f1c3c63f | enterprise | EU | EUR | 2119 | 10 | 135 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f24-7ef9-936f-784ba9dd4acd | basic | ANZ | AUD | 849 | 3 | 170 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f25-71c0-8950-ce5869ca0393 | pro | ANZ | AUD | 1699 | 5 | 215 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f26-785d-ada8-8399ecfaf7aa | enterprise | ANZ | AUD | 3399 | 10 | 215 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f27-71f8-abfd-bed47869a36d | basic | WEST | USD | 590 | 3 | 120 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f28-749a-a4f6-2412faa78e58 | pro | WEST | USD | 1190 | 5 | 150 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f29-76d1-a2ea-d917c987c7b1 | enterprise | WEST | USD | 2390 | 10 | 150 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f2a-7462-bb26-f9596253a1ab | basic | SG | USD | 590 | 3 | 120 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f2b-7034-8792-ba8566e84f1f | pro | SG | USD | 1190 | 5 | 150 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f2c-7c69-a03e-644ab78efcda | enterprise | SG | USD | 2390 | 10 | 150 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f2d-78a9-bbdc-6afcc68db583 | basic | GULF | USD | 490 | 3 | 100 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f2e-7db6-ad61-faa5560eb5d8 | pro | GULF | USD | 990 | 5 | 120 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f2f-71a1-9e3b-1243eaf02fc8 | enterprise | GULF | USD | 1990 | 10 | 120 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f30-73ad-8704-379083c955d9 | basic | MY_TH | USD | 390 | 3 | 80 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f31-7faa-9de8-c207adaf21c0 | pro | MY_TH | USD | 790 | 5 | 100 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f32-7e5c-b624-199ba2904572 | enterprise | MY_TH | USD | 1590 | 10 | 100 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f33-7f1a-b3a9-2bda3f9ba262 | basic | LK_NP_BD | USD | 190 | 5 | 40 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f34-75d3-a805-8b67dcd3c39c | pro | LK_NP_BD | USD | 390 | 10 | 50 | 1 | 2027-04-01T00:00:00Z |
| 01a157e5-2f35-7c57-9f63-d29e7ad480f1 | enterprise | LK_NP_BD | USD | 790 | 25 | 50 | 1 | 2027-04-01T00:00:00Z |

Rows for `UK`, `EU` and `ANZ` are harmless before the market split: no agency maps to those keys until `marketForCountry` changes.

### 7.3 `plan_allowances` (replace all rows; `monthly_amount`)

| plan_key | ai_credits | whatsapp (step A) | whatsapp (step B) | whatsapp_marketing | sms | otp | email | call_minutes | storage_gb | websites |
|---|---|---|---|---|---|---|---|---|---|---|
| trial | 500 | 30 | 20 | 10 | 0 | 10 | 200 | 0 | 1 | 0 |
| basic | 3000 | 300 | 250 | 50 | 0 | 10 | 1000 | 100 | 5 | 1 |
| pro | 15000 | 950 | 750 | 200 | 20 | 20 | 5000 | 250 | 20 | 1 |
| enterprise | 30000 | 2500 | 2000 | 500 | 50 | 40 | 10000 | 500 | 50 | 2 |

One row per (plan_key, allowance_key). Insert the `whatsapp_marketing`, `storage_gb` and `websites` rows in step A; the meter ignores keys it does not know. In step B change only the `whatsapp` amounts.

### 7.4 `plan_features` (replace all rows)

- **trial**: fleet_management, driver_app, bulk_sms, bulk_whatsapp, bulk_email, marketing_flyers, visa_management, supplier_management, advanced_reports, whatsapp_campaigns, ai_intelligence, ai_assistant, ai_extraction, ai_copilot, ai_call_summary, ai_lead_scoring, ai_message_compose, ai_itinerary_generate, ai_cost_estimation, ai_ocr, ai_search (21 rows; no voip_calling, no custom_domain).
- **basic**: fleet_management, driver_app, bulk_sms, bulk_whatsapp, bulk_email, marketing_flyers, visa_management, supplier_management, voip_calling, ai_assistant, ai_message_compose (11 rows).
- **pro**: fleet_management, driver_app, bulk_sms, bulk_whatsapp, bulk_email, marketing_flyers, visa_management, supplier_management, advanced_reports, voip_calling, custom_domain, whatsapp_campaigns, ai_intelligence, ai_assistant, ai_extraction, ai_copilot, ai_call_summary, ai_lead_scoring, ai_message_compose, ai_itinerary_generate, ai_cost_estimation, ai_ocr, ai_search (23 rows).
- **enterprise**: every pro row, plus api_access, white_label, priority_support, ai_chatbot, ai_dialer_cards, ai_vehicle_recommend, ai_driver_recommend, ai_expense_analysis, ai_margin_insights, ai_payment_prediction, ai_visa_intelligence, ai_campaign_content, ai_campaign_optimize, ai_follow_up_suggest, ai_churn_prediction, ai_daily_briefing, ai_supplier_negotiate, ai_coaching (41 rows; unchanged from 0015).

### 7.5 `comm_unit_costs`

Deactivate the older rows they supersede (the newest active row wins anyway, but this keeps the console clear): `UPDATE comm_unit_costs SET is_active = 0 WHERE id IN ('01a13a7c-5809-7633-8fcc-ef0842316a28', '01a13a7c-5809-7633-8fcc-ef098058a7b8', '01a13a7c-5809-7633-8fcc-ef0ae4e6ccfb', '01a13b10-0000-7000-8000-000000000e01', '01a2c000-0304-7000-8000-000000000001', '01a2c000-0304-7000-8000-000000000002', '01a2c000-0305-7000-8000-000000000001', '01a2c000-0305-7000-8000-000000000002', '01a2c000-0305-7000-8000-000000000003', '01a2c000-0305-7000-8000-000000000004', '01a2c000-0305-7000-8000-000000000005', '01a2c000-0305-7000-8000-000000000006', '01a2c000-0305-7000-8000-000000000007')`. The inactive India call and number rows from 0015 stay inactive. Insert:

| id | channel | market | provider | unit_cost | currency | margin_pct | effective_from | is_active | step |
|---|---|---|---|---|---|---|---|---|---|
| 01a157e5-2f36-7548-a96f-9b001096bc4d | whatsapp | IN | Meta India, marketing rate (interim) | 1.15527 | INR | 25 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f37-7f9b-ac56-af0875654ffb | whatsapp | IN | Meta India, utility rate | 0.13707 | INR | 25 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f38-75e7-9731-6cb47a683107 | whatsapp_marketing | IN | Meta India, marketing rate | 1.15527 | INR | 25 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f39-748a-b07e-98add8e4dc4a | sms | IN | Twilio IN | 8.14562 | INR | 25 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f3a-76b0-9798-f2856dd70526 | otp | IN | Twilio Verify $0.05 + Twilio IN | 13.04082 | INR | 25 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f3b-78b8-8062-1d42c81bb19b | email | IN | SendGrid (draft $0.0005 an email) | 0.04895 | INR | 25 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f3c-78da-8d50-9f3fbd5c1ebb | whatsapp | UK | Meta United Kingdom, marketing rate (interim) | 0.04913 | GBP | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f3d-702e-b8f1-62bab5d9596c | whatsapp | UK | Meta United Kingdom, utility rate | 0.01702 | GBP | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f3e-7660-a7fd-30f442ca3022 | whatsapp_marketing | UK | Meta United Kingdom, marketing rate | 0.04913 | GBP | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f3f-73db-86d1-bf8a0cb12a9d | sms | UK | Twilio GB | 0.04332 | GBP | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f40-7ff5-8bc2-1a5f518e56c7 | otp | UK | Twilio Verify $0.05 + Twilio GB | 0.082 | GBP | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f41-7a73-9d1e-ea7ca07d137c | email | UK | SendGrid (draft $0.0005 an email) | 0.00039 | GBP | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f42-78ad-a7cb-b2253380a481 | call_minute | UK | Twilio GB, 70% mobile + softphone + recording | 0.02521 | GBP | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f43-7c9b-ac8f-5985aafd1d7c | phone_number | UK | Twilio GB local number, monthly | 2.70769 | GBP | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f44-78cf-9515-80a2b6323d35 | whatsapp | EU | Meta Germany (dearest EU), marketing rate (interim) | 0.12534 | EUR | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f45-7c90-a164-6c4de524c670 | whatsapp | EU | Meta Germany (dearest EU), utility rate | 0.0505 | EUR | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f46-7acd-9b90-80d43af07cdf | whatsapp_marketing | EU | Meta Germany (dearest EU), marketing rate | 0.12534 | EUR | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f47-717d-8d11-0129f13da077 | sms | EU | Twilio DE | 0.10284 | EUR | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f48-7cbe-961b-293b8742c271 | otp | EU | Twilio Verify $0.05 + Twilio DE | 0.14875 | EUR | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f49-7b07-ab9d-d61de0260def | email | EU | SendGrid (draft $0.0005 an email) | 0.00046 | EUR | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f4a-752c-9ea7-ca87c01b6c58 | call_minute | EU | Twilio DE, 70% mobile + softphone + recording | 0.04076 | EUR | 30 | 2026-11-01T00:00:00Z | 1 | A (active since R137, migration 0029) |
| 01a157e5-2f4b-7261-9e7a-8bfe8eda9884 | phone_number | EU | Twilio DE local number, monthly | 1.2396 | EUR | 30 | 2026-11-01T00:00:00Z | 1 | A (active since R137, migration 0029) |
| 01a157e5-2f4c-7037-be21-5389912999ae | whatsapp | ANZ | Meta Rest of Asia Pacific +15%, marketing rate (interim) | 0.12421 | AUD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f4d-76f6-b8d9-e37b7af8772b | whatsapp | ANZ | Meta Rest of Asia Pacific +15%, utility rate | 0.01667 | AUD | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f4e-70ba-a8bb-4dc679ecd296 | whatsapp_marketing | ANZ | Meta Rest of Asia Pacific +15%, marketing rate | 0.12421 | AUD | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f4f-7272-a6b0-c76745884a99 | sms | ANZ | Twilio AU | 0.07599 | AUD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f50-7d14-b76e-e9d1d8768129 | otp | ANZ | Twilio Verify $0.05 + Twilio AU | 0.14977 | AUD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f51-7653-b6ef-bb5d22f10118 | email | ANZ | SendGrid (draft $0.0005 an email) | 0.00074 | AUD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f52-71bf-83e1-45c93759dd81 | call_minute | ANZ | Twilio AU, 70% mobile + softphone + recording | 0.09821 | AUD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f53-766d-a9ca-c004b3cb547e | phone_number | ANZ | Twilio AU local number, monthly | 4.42657 | AUD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f54-726a-ae39-a0d834f8b32c | whatsapp | WEST | Meta North America, marketing rate (interim) | 0.025 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f55-7dc2-9997-0b9e4989a882 | whatsapp | WEST | Meta North America, utility rate | 0.0034 | USD | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f56-7ca9-9f76-b476c5931820 | whatsapp_marketing | WEST | Meta North America, marketing rate | 0.025 | USD | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f57-743d-91a8-a138d7e77557 | sms | WEST | Twilio US incl. carrier fee | 0.0133 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f58-7a45-8b62-6f84dcb1a318 | otp | WEST | Twilio Verify $0.05 + Twilio US incl. carrier fee | 0.0633 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f59-75da-a74a-a5238962dd86 | email | WEST | SendGrid (draft $0.0005 an email) | 0.0005 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f5a-7bc7-a562-64748e12ef39 | call_minute | WEST | Twilio US, 70% mobile + softphone + recording | 0.0205 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f5b-7a6b-a2f8-49d2eda27d13 | phone_number | WEST | Twilio US local number, monthly | 1.15 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f5c-77c5-9733-4d257032c13a | whatsapp | SG | Meta Singapore, marketing rate (interim) | 0.0732 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f5d-77ee-9265-cc80d140d76c | whatsapp | SG | Meta Singapore, utility rate | 0.016 | USD | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f5e-7d39-ac3d-7ff41decea52 | whatsapp_marketing | SG | Meta Singapore, marketing rate | 0.0732 | USD | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f5f-77c0-b484-c18a669c751c | sms | SG | Twilio SG | 0.0591 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f60-7b74-8af5-2385d87c9ce4 | otp | SG | Twilio Verify $0.05 + Twilio SG | 0.1091 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f61-7fa7-9ed7-7a8fc84d9aa8 | email | SG | SendGrid (draft $0.0005 an email) | 0.0005 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f62-74cc-8e4f-cbda968edabc | call_minute | SG | Twilio SG, 70% mobile + softphone + recording | 0.05965 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f63-7fa4-88ed-5aeb98e0f60e | phone_number | SG | Twilio SG local number, monthly | 5 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f64-7d02-b0f5-967ae1582380 | whatsapp | GULF | Meta Saudi Arabia +15%, marketing rate (interim) | 0.05761 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f65-726c-b57d-30de95a0746e | whatsapp | GULF | Meta Saudi Arabia +15%, utility rate | 0.0157 | USD | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f66-7f18-9441-f0eca3f6e3b1 | whatsapp_marketing | GULF | Meta Saudi Arabia +15%, marketing rate | 0.05761 | USD | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f67-7887-9d85-7fe5dee12fac | sms | GULF | Twilio SA (dearest Gulf) | 0.1949 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f68-7f43-84f8-85d141412fe7 | otp | GULF | Twilio Verify $0.05 + Twilio SA (dearest Gulf) | 0.2449 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f69-709c-9e9c-1c84e92e048c | email | GULF | SendGrid (draft $0.0005 an email) | 0.0005 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f6a-73bc-91c3-1237f41a04ef | whatsapp | MY_TH | Meta Malaysia, marketing rate (interim) | 0.086 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f6b-7415-8f5f-7ea4f78b6f44 | whatsapp | MY_TH | Meta Malaysia, utility rate | 0.014 | USD | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f6c-7872-b09d-1b79154a998b | whatsapp_marketing | MY_TH | Meta Malaysia, marketing rate | 0.086 | USD | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f6d-7ce8-8b97-a296543d9c1d | sms | MY_TH | Twilio MY | 0.3389 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f6e-7d31-835a-58e9a0e72cee | otp | MY_TH | Twilio Verify $0.05 + Twilio MY | 0.3889 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f6f-7a9c-93ba-f5f7ba199b5a | email | MY_TH | SendGrid (draft $0.0005 an email) | 0.0005 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f70-7efa-ad95-db553bbc3e45 | call_minute | MY_TH | Twilio MY, 70% mobile + softphone + recording | 0.07915 | USD | 30 | 2026-11-01T00:00:00Z | 0 | A (second wave) |
| 01a157e5-2f71-7b89-8090-c784836636c9 | phone_number | MY_TH | Twilio MY local number, monthly | 4 | USD | 30 | 2026-11-01T00:00:00Z | 0 | A (second wave) |
| 01a157e5-2f72-730c-8a16-b52b65964e6e | whatsapp | LK_NP_BD | Meta "Other" (LK/NP/BD not found), marketing rate (interim) | 0.0604 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f73-7799-924a-4d82173eb9ea | whatsapp | LK_NP_BD | Meta "Other" (LK/NP/BD not found), utility rate | 0.0077 | USD | 30 | 2026-11-01T00:00:01Z | 0 | B: set is_active 1 |
| 01a157e5-2f74-78a4-ad3c-a456c8a59acc | whatsapp_marketing | LK_NP_BD | Meta "Other" (LK/NP/BD not found), marketing rate | 0.0604 | USD | 30 | 2026-11-01T00:00:00Z | 0 | B: set is_active 1 |
| 01a157e5-2f75-7e80-915c-f1910ac67c02 | email | LK_NP_BD | SendGrid (draft $0.0005 an email) | 0.0005 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f76-7b5f-8e5d-ca152a75e88e | call_minute | GB | Twilio GB destination weight (USD) | 0.03259 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f77-7f6a-81bc-f70dff1803f8 | call_minute | US | Twilio US destination weight (USD) | 0.0205 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f78-7b9a-a609-6443dfbe1bff | call_minute | AU | Twilio AU destination weight (USD) | 0.06656 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f79-74f1-a267-9f62111d7e9b | call_minute | DE | Twilio DE destination weight (USD) | 0.04439 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |
| 01a157e5-2f7a-7600-9eaa-4b53e2dbe78d | call_minute | MY | Twilio MY destination weight (USD) | 0.07915 | USD | 30 | 2026-11-01T00:00:00Z | 1 | A |

Notes on these rows:

- The `step` column is guidance, not a database column.
- The `GB`, `US`, `AU`, `DE`, `MY` rows are country rows that `voip/metering.ts` uses for minute weights (the agency's own country is its base minute). They stay in USD so every weight compares like with like. The `SG` row is both Singapore's market row and its country row, which is why `SG` bills in USD.
- In step B, set the two `B` rows per market to `is_active` 1. The utility `whatsapp` row has a later `effective_from` by one second, so it replaces the interim marketing-rate row without deleting it.

### 7.6 `addon_products`

Changes to existing rows:

| key | change |
|---|---|
| extra_user | none (`fixed_price` NULL; the price comes from `plan_prices` for the agency's market, so one row serves every market) |
| ai_credit_pack_5000 | `is_active` = 0 |
| email_1000 | `is_active` = 0 |
| call_minutes_100_west | `is_active` = 0 |
| call_minutes_100_sg | `is_active` = 0 |
| sms_100, whatsapp_1000, otp_100 (IN) | none; repriced by the new IN unit-cost rows |
| phone_number_west, phone_number_sg | none; repriced by the new rows |
| call_minutes_100 (IN) | stays inactive |

New rows (`fixed_price` NULL means the engine prices the pack from `comm_unit_costs`):

| key | name | kind | channel | units | fixed_price | currency | market | is_active |
|---|---|---|---|---|---|---|---|---|
| ai_credits_10000_in | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 499 | INR | IN | 1 |
| ai_credits_50000_in | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 1999 | INR | IN | 1 |
| email_5000_in | 5,000 emails | comm_pack | email | 5000 | NULL | INR | IN | 1 |
| whatsapp_marketing_1000_in | 1,000 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 1000 | NULL | INR | IN | 0 |
| ai_credits_10000_uk | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 7 | GBP | UK | 1 |
| ai_credits_50000_uk | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 27 | GBP | UK | 1 |
| sms_500_uk | 500 SMS | comm_pack | sms | 500 | NULL | GBP | UK | 1 |
| whatsapp_1000_uk | 1,000 WhatsApp messages | comm_pack | whatsapp | 1000 | NULL | GBP | UK | 1 |
| whatsapp_marketing_500_uk | 500 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 500 | NULL | GBP | UK | 0 |
| otp_200_uk | 200 login codes | comm_pack | otp | 200 | NULL | GBP | UK | 1 |
| email_20000_uk | 20,000 emails | comm_pack | email | 20000 | NULL | GBP | UK | 1 |
| call_minutes_500_uk | 500 call minutes | comm_pack | call_minute | 500 | NULL | GBP | UK | 1 |
| phone_number_uk | Phone number (per month) | comm_pack | phone_number | 1 | NULL | GBP | UK | 1 |
| ai_credits_10000_eu | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 8 | EUR | EU | 1 |
| ai_credits_50000_eu | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 32 | EUR | EU | 1 |
| sms_250_eu | 250 SMS | comm_pack | sms | 250 | NULL | EUR | EU | 1 |
| whatsapp_500_eu | 500 WhatsApp messages | comm_pack | whatsapp | 500 | NULL | EUR | EU | 1 |
| whatsapp_marketing_250_eu | 250 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 250 | NULL | EUR | EU | 0 |
| otp_100_eu | 100 login codes | comm_pack | otp | 100 | NULL | EUR | EU | 1 |
| email_20000_eu | 20,000 emails | comm_pack | email | 20000 | NULL | EUR | EU | 1 |
| call_minutes_500_eu | 500 call minutes | comm_pack | call_minute | 500 | NULL | EUR | EU | 1 |
| phone_number_eu | Phone number (per month) | comm_pack | phone_number | 1 | NULL | EUR | EU | 1 |
| ai_credits_10000_anz | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 13 | AUD | ANZ | 1 |
| ai_credits_50000_anz | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 49 | AUD | ANZ | 1 |
| sms_500_anz | 500 SMS | comm_pack | sms | 500 | NULL | AUD | ANZ | 1 |
| whatsapp_1000_anz | 1,000 WhatsApp messages | comm_pack | whatsapp | 1000 | NULL | AUD | ANZ | 1 |
| whatsapp_marketing_500_anz | 500 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 500 | NULL | AUD | ANZ | 0 |
| otp_200_anz | 200 login codes | comm_pack | otp | 200 | NULL | AUD | ANZ | 1 |
| email_20000_anz | 20,000 emails | comm_pack | email | 20000 | NULL | AUD | ANZ | 1 |
| call_minutes_250_anz | 250 call minutes | comm_pack | call_minute | 250 | NULL | AUD | ANZ | 1 |
| phone_number_anz | Phone number (per month) | comm_pack | phone_number | 1 | NULL | AUD | ANZ | 1 |
| ai_credits_10000_west | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 9 | USD | WEST | 1 |
| ai_credits_50000_west | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 35 | USD | WEST | 1 |
| sms_1000_west | 1,000 SMS | comm_pack | sms | 1000 | NULL | USD | WEST | 1 |
| whatsapp_2000_west | 2,000 WhatsApp messages | comm_pack | whatsapp | 2000 | NULL | USD | WEST | 1 |
| whatsapp_marketing_500_west | 500 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 500 | NULL | USD | WEST | 0 |
| otp_200_west | 200 login codes | comm_pack | otp | 200 | NULL | USD | WEST | 1 |
| email_20000_west | 20,000 emails | comm_pack | email | 20000 | NULL | USD | WEST | 1 |
| call_minutes_1000_west | 1,000 call minutes | comm_pack | call_minute | 1000 | NULL | USD | WEST | 1 |
| ai_credits_10000_sg | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 9 | USD | SG | 1 |
| ai_credits_50000_sg | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 35 | USD | SG | 1 |
| sms_500_sg | 500 SMS | comm_pack | sms | 500 | NULL | USD | SG | 1 |
| whatsapp_1000_sg | 1,000 WhatsApp messages | comm_pack | whatsapp | 1000 | NULL | USD | SG | 1 |
| whatsapp_marketing_500_sg | 500 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 500 | NULL | USD | SG | 0 |
| otp_200_sg | 200 login codes | comm_pack | otp | 200 | NULL | USD | SG | 1 |
| email_20000_sg | 20,000 emails | comm_pack | email | 20000 | NULL | USD | SG | 1 |
| call_minutes_250_sg | 250 call minutes | comm_pack | call_minute | 250 | NULL | USD | SG | 1 |
| ai_credits_10000_gulf | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 9 | USD | GULF | 1 |
| ai_credits_50000_gulf | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 35 | USD | GULF | 1 |
| sms_100_gulf | 100 SMS | comm_pack | sms | 100 | NULL | USD | GULF | 1 |
| whatsapp_1000_gulf | 1,000 WhatsApp messages | comm_pack | whatsapp | 1000 | NULL | USD | GULF | 1 |
| whatsapp_marketing_500_gulf | 500 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 500 | NULL | USD | GULF | 0 |
| otp_100_gulf | 100 login codes | comm_pack | otp | 100 | NULL | USD | GULF | 1 |
| email_20000_gulf | 20,000 emails | comm_pack | email | 20000 | NULL | USD | GULF | 1 |
| ai_credits_10000_my_th | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 9 | USD | MY_TH | 1 |
| ai_credits_50000_my_th | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 35 | USD | MY_TH | 1 |
| sms_100_my_th | 100 SMS | comm_pack | sms | 100 | NULL | USD | MY_TH | 1 |
| whatsapp_1000_my_th | 1,000 WhatsApp messages | comm_pack | whatsapp | 1000 | NULL | USD | MY_TH | 1 |
| whatsapp_marketing_250_my_th | 250 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 250 | NULL | USD | MY_TH | 0 |
| otp_50_my_th | 50 login codes | comm_pack | otp | 50 | NULL | USD | MY_TH | 1 |
| email_20000_my_th | 20,000 emails | comm_pack | email | 20000 | NULL | USD | MY_TH | 1 |
| call_minutes_250_my_th | 250 call minutes | comm_pack | call_minute | 250 | NULL | USD | MY_TH | 0 |
| phone_number_my_th | Phone number (per month) | comm_pack | phone_number | 1 | NULL | USD | MY_TH | 0 |
| ai_credits_10000_lk_np_bd | 10,000 AI credits | ai_credit_pack | NULL | 10000 | 9 | USD | LK_NP_BD | 1 |
| ai_credits_50000_lk_np_bd | 50,000 AI credits | ai_credit_pack | NULL | 50000 | 35 | USD | LK_NP_BD | 1 |
| whatsapp_2000_lk_np_bd | 2,000 WhatsApp messages | comm_pack | whatsapp | 2000 | NULL | USD | LK_NP_BD | 1 |
| whatsapp_marketing_500_lk_np_bd | 500 WhatsApp marketing messages | comm_pack | whatsapp_marketing | 500 | NULL | USD | LK_NP_BD | 0 |
| email_20000_lk_np_bd | 20,000 emails | comm_pack | email | 20000 | NULL | USD | LK_NP_BD | 1 |

In step B, set every `whatsapp_marketing_*` row to `is_active` 1.

### 7.7 Other settings

- `catalogue_notes`: replace the `drafts` row with "Prices and allowances from docs/PRICING.md (2026-10-20), approved by the owner on <date>. Founder prices valid 2026-11-01 to 2027-03-31; list prices from 2027-04-01."
- `platform_settings`: `voip_calling_on_trial` stays '0'.
- Go-live: `VOIP_CALLING_COUNTRIES` = `US` until the market split ships; add `GB,AU,SG` after it (section 8, change 1). Otherwise a UK or Australian agency in `WEST` would buy minute packs priced at the US minute and use them on dearer UK or Australian minutes.

### 7.8 Rows added after step B: Netherlands drafts (R137, migration 0029)

Migration 0029 also switches the EU call-minute and phone-number unit costs and the `call_minutes_500_eu` and `phone_number_eu` add-ons on (is_active 1 in 7.5 and 7.6 above). Kept apart from 7.5 and 7.6 on purpose: those tables are the step A and B load and a test compares them with migrations 0026 and 0028. These rows are **drafts with no price**; the owner enters Twilio's real NL prices in the super admin catalogue and activates them.

| id | channel | market | provider | unit_cost | currency | margin_pct | effective_from | is_active |
|---|---|---|---|---|---|---|---|---|
| 01a15fab-db01-7d72-bf77-cee76f237fa0 | phone_number | NL | DRAFT: enter Twilio's NL price before selling | 0 | EUR | 30 | 2026-11-01T00:00:00Z | 0 |
| 01a15fab-db02-7c41-83ce-0f5ac346d509 | call_minute | NL | DRAFT: enter Twilio's NL price before selling | 0 | USD | 30 | 2026-11-01T00:00:00Z | 0 |

| key | name | kind | channel | units | fixed_price | currency | market | is_active |
|---|---|---|---|---|---|---|---|---|
| phone_number_nl | Phone number (per month) | comm_pack | phone_number | 1 | NULL | EUR | NL | 0 |

---

## 8. Code changes this pricing depends on

In order of importance. None is large.

1. **Market split.** `marketForCountry`: GB → `UK`; EU and EEA countries and CH → `EU`; AU and NZ → `ANZ`. About ten lines plus tests. Needed for GBP, EUR and AUD billing and for correctly priced call packs. Until then keep `VOIP_CALLING_COUNTRIES=US`.
2. **WhatsApp split (step B).** Meter marketing templates against a `whatsapp_marketing` allowance and utility templates against `whatsapp`. The category is already chosen at send time (`metaCategoryForTemplate`) and recorded (`recordWhatsAppCategory`); add the channel to `CHANNEL_SPECS` and `allowanceChannel`. Needed before selling outside India.
3. **Pack offers in the 402 body.** `packOffers` in `metering/meter.ts` lists every active pack for a channel in every market. With more than one market loaded, a UK agency at its limit would be offered India packs in INR. Filter by the agency's market as `listOffers` already does.
4. **Login codes by WhatsApp or email** instead of Twilio Verify SMS (COST-MODEL item 3). India cost per code falls from INR 13.04 to INR 0.14.
5. **Pack validity** to "this month and next" instead of the month of purchase.
6. **Market column on `plan_allowances`** (later). Needed before selling Enterprise in Germany, Malaysia, Thailand, Sri Lanka, Nepal or Bangladesh at full allowance (section 4.4).
7. Optional: raise `MIN_COMM_MARGIN_PCT` in `billing/addons.ts` from 20 to 25 so the code floor matches the after-fee rule, not only the catalogue rows.

---

## 9. What I could not verify, and what to check first

### 9.1 Not verified

- **Meta WhatsApp rates.** Taken from a third-party copy of Meta's rate card dated 2026-07-01; Meta's own page holds them in CSV and PDF files I could not read. Meta lists increases on 2026-10-01 for UAE, Saudi and Asia-Pacific marketing without figures (I added 15%). Sri Lanka, Nepal and Bangladesh have new named rates I did not find.
- **Stripe fees for this business.** Whether an Indian-registered business can open Stripe, and what it pays to charge GBP, EUR and AUD cards (I assumed 6.3% plus 0.7% for subscriptions, no fixed fee). If there is a fixed fee per payment (for example USD 0.30), the smallest packs (UK 20,000 emails at GBP 10.06, US number at USD 1.50 a month) fall below cost × 1.2 after fees; raise their size or the number margin.
- **Twilio Singapore number price** (not on Twilio's page; USD 5.00 is Plivo's figure) and whether Twilio sells Singapore numbers to resellers at all.
- **Email cost per message** (SendGrid tier prices were not visible; USD 0.0005 is my estimate). Cloudflare Email may be cheaper.
- **AI credit cost** (INR 0.02 a credit is the owner's sizing, checked once in COST-MODEL against one model).
- **India SMS route.** Twilio's international route to Indian phones may be poorly delivered without DLT registration. A domestic route (MSG91 at INR 0.16–0.25) is not in the code.
- **Competitor prices** for Wati, Zoho UAE, Pipedrive, Tourwriter, Aircall and JustCall come from third-party pages that disagree. Sembark publishes no prices. The INR 6,000 and USD 150 website figures are my assumptions.
- **Price lock on renewal.** I believe renewals charge the amount fixed at checkout by the gateway, but I did not trace a renewal end to end.
- **Upgrade pro-rata.** I did not find code for charging the difference on a mid-year upgrade.
- Whether prices including or excluding GST: this document assumes excluding.

### 9.2 The three numbers to sanity-check first

1. **India prices: INR 14,999 / 29,999 / 74,999 a year** (founder INR 11,999 / 23,999 / 59,999). Basic keeps the original INR 12,000 as the founder price, but Pro is 67% above the draft and Enterprise triples (with 25 users instead of 100). Check with the first five Indian prospects that INR 29,999 for ten people does not cause more price objections than the draft did.
2. **The non-India gateway fee: 6.3% on packs and 7% on subscriptions**, which sets `margin_pct` at 30 outside India. If Stripe for this account costs less (or a fixed fee applies), `margin_pct` and the small packs change. Confirm it with one test-mode payment in GBP.
3. **India login codes at INR 13.04 each** (Twilio Verify by SMS). It costs 8% to 10% of Pro and Enterprise revenue in India, and a 100-code pack sells for INR 1,630. If drivers log in weekly, agencies will hit the 10 / 20 / 40 allowance and complain. Either approve moving codes to WhatsApp (INR 0.14) before launch or raise the allowance and accept the lower margin.

---

## 10. Sources

Retrieved 2026-10-20 unless marked.

- Exchange rates: https://open.er-api.com/v6/latest/USD
- Meta WhatsApp pricing (model, rate-change schedule, rate-card files): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md
- Meta per-message rates effective 2026-07-01 (third-party copy): https://zernio.com/blog/whatsapp-business-api-pricing ; cross-check: https://www.messagecentral.com/blog/whatsapp-business-api-pricing-2026
- Twilio SMS, United Kingdom: https://www.twilio.com/en-us/sms/pricing/gb
- Twilio Voice, United Kingdom: https://www.twilio.com/en-us/voice/pricing/gb
- Twilio Voice, Australia: https://www.twilio.com/en-us/voice/pricing/au
- Twilio Voice, Singapore: https://www.twilio.com/en-us/voice/pricing/sg
- Travefy: https://travefy.com/pricing
- HubSpot: https://www.hubspot.com/pricing/crm
- Bitrix24: https://www.bitrix24.com/prices/
- Zoho CRM (page showed no amounts on 2026-10-20; India figures from COST-MODEL [C38], 2026-10-09): https://www.zoho.com/crm/zohocrm-pricing.html
- Zoho CRM UAE (third party): https://cloudfysystems.com/blog/zoho-crm-pricing-uae-2026 , https://codingclave.com/blog/best-crm-software-uae
- Wati (third party): https://www.getmacha.com/blog/wati-pricing-explained , https://www.quickreply.ai/others/wati-pricing , https://www.ycloud.com/blog/wati-pricing.md
- Pipedrive (third party): https://zeeg.me/post/pipedrive-pricing , https://automationatlas.io/answers/pipedrive-pricing-explained-2026/
- Tourwriter (third party; vendor page returned 404): https://www.capterra.com/p/39473/TourWriter/pricing/ , https://us.fitgap.com/products/024613/tourwriter
- Vtiger (third party): https://www.capterra.com/p/112491/vtiger-CRM/pricing , https://prospeo.io/s/vtiger-crm-pricing-reviews-pros-and-cons
- Aircall and JustCall (third party): https://www.ringly.io/blog/aircall-pricing , https://costbench.com/software/business-phone/justcall/
- Indian travel CRMs (third party): https://www.techjockey.com/blog/best-travel-crm , https://www.capterra.in/software/1052892/crmtravel
- Earlier sources reused through `docs/COST-MODEL.md` section 9 (2026-10-09), `docs/decisions/ADR-001-voip.md` section 11 (2026-10-09 and 2026-10-14) and `docs/marketing/MARKETING-PLAN.md` section 12 (2026-10-14).

The arithmetic was done with two scripts kept outside the repository (scratchpad `pricing.mjs` and `appendix.mjs`); every figure above can be recomputed from the unit costs in section 3.5 and the usage profile in COST-MODEL section 2.
