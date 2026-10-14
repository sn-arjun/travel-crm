# Landing page copy, rewritten

- Written 2026-10-14. Replaces the text of `landing/index.html`. Layout, colours and mock-ups can stay; the text, numbers, testimonials, rating data and the unverifiable stats cannot.
- Every sentence here rests on a row in `docs/FEATURES.md` with status Works, or on a decision the owner still has to make (marked **[owner]**). Nothing here depends on a feature that is Broken, a Placeholder or only partly working unless the sentence says what is partial.
- Items marked **[gate RGn]** must not go live until that readiness gate clears. The gates are defined in `MARKETING-PLAN.md` section 2.4.
- Dollar and rupee prices are the proposal in `docs/COST-MODEL.md`, awaiting owner approval.
- Writing rules used: plain words, no superlatives, no numbers we cannot show.

---

## 0. Call-to-action targets (placeholders)

None of these exist yet. Every call to action on the current page is `href="#"`. The readiness work supplies the endpoints.

| Label on page | Target | Notes |
|---|---|---|
| Book a demo | `{{FORM_DEMO_URL}}` | Form: name, agency, city, team size, phone with country code, "how do enquiries reach you today". Replies by WhatsApp within 2 hours in business hours. |
| Start a 14-day trial | `{{FORM_TRIAL_URL}}` | **[gate RG1, RG2, RG4]** Do not show before a created agency can sign in and the trial ends by itself. Until then, replace with "Join the waitlist" pointing to the demo form. |
| WhatsApp us | `https://wa.me/{{WHATSAPP_NUMBER}}?text=Hi%2C%20I%20would%20like%20a%20demo` | Public marketing link only. |
| Watch the 90-second film | `{{HERO_VIDEO_URL}}` | The planned hero film. Until it exists, use the 74-second narrated assistant pilot from `studio/out/pilot-assistant.mp4` after owner approval of voice (gate G2). |
| Email | `mailto:hello@travelcrm.pro` | Exists on the current page. |
| Privacy, Terms | `{{PRIVACY_URL}}`, `{{TERMS_URL}}` | **[gate RG5]** Remove the GDPR and Security footer links until the pages exist. |

Page title (replace `<title>`): **TravelCRM Pro: CRM for travel agencies and tour operators**
Meta description: **Read every enquiry from WhatsApp, email and your website, get the next step ready to approve, and go from quote to invoice to hotel voucher in one place.**

---

## 1. Hero

**Pill:** Built for travel agencies and tour operators

**Headline:** Every enquiry read. The next step ready to approve.

**Sub-headline:** TravelCRM Pro reads the WhatsApp messages, emails and website forms that reach your agency, and prepares the next step: a new lead, a drafted reply, a payment to record. You click Apply. Then it carries you from the quote to the invoice to the hotel voucher.

**Buttons:** [Book a 20-minute demo] [Watch the 90-second film]

**Under the buttons:** Demo shown on sample data. You review and send every message to a customer. *(Add "14-day trial, no card" only after gate RG4.)*

**Hero stat strip (replaces the four invented numbers):** use four true facts, with no numbers we cannot show:
- WhatsApp, SMS and email in one inbox
- Quote, invoice and voucher in one flow
- Driver app for trips and pickups
- Six roles, so each person sees what they should

---

## 2. The problem

**Section title:** Enquiries arrive faster than a team can track them.

Three short blocks. Replace with exact phrases from your first owner conversations once you have them (marked assumption in the plan).

1. **Messages in five places.** Enquiries come on WhatsApp, calls, email and a website form. Who replied? Who is waiting? Nobody can tell without scrolling.
2. **Quotes take too long.** A quote built from scratch in Word or Excel takes an hour. By then the customer has asked two other agents.
3. **The paperwork follows late.** The customer says yes. Now someone must create the invoice, record the advance, write the hotel vouchers and book the transfer, and something gets missed.

**Closing line:** TravelCRM Pro keeps WhatsApp as the way you talk to customers, and adds a memory and a next step behind it.

---

## 3. How it works

**Section title:** From the first message to the hotel voucher

Five steps, each backed by a Works feature (FEATURES.md):

1. **A message arrives.** WhatsApp, SMS, email or your website form. It lands in one inbox, filed under the right customer. *(Unified inbox, Works. The first-time connection of your WhatsApp, SMS and email addresses is set up with you.)*
2. **The assistant reads it.** Destination, dates, number of travellers and budget are picked out of the message. It suggests: create the contact and lead. *(AI reads every incoming message, Works; plain rules take over if AI is off or out of credits.)*
3. **You build the quote.** The closest itinerary template is suggested; prices come from your rate cards; one click gives a day-by-day plan with a branded PDF. *(Itinerary, templates, rate cards, quotation PDF, Works.)*
4. **You send it and follow up.** The reply is drafted for you to read and send from the send dialog. Once sent, the lead moves to Proposal Sent and a follow-up is scheduled. *(Works.)*
5. **The customer says yes.** The booking checklist appears; the invoice is drafted; the advance she mentioned in her message is matched to it; hotel vouchers are drafted for each stay. You approve each step. *(Mostly Works; "partly" for invoice-from-itinerary and voucher drafting, so say "drafted", not "done".)*

**Video slot:** the edited assistant film, "From a WhatsApp message to a booked trip" (3:22). Caption it: "Sample data. Messages simulated."

---

## 4. The assistant

**Section title:** An assistant that suggests. You decide.

**Intro:** The assistant works in the background on your enquiries. It never sends a message to a customer on its own, and it never records money without asking.

Three cards, replacing "Call Intelligence", "Itinerary Generation" and "24/7 AI Chatbot" (none of which can be claimed yet):

1. **Reads every message.** Sorts new enquiries from payment news and questions, and prepares the right step.
2. **Asks before it acts.** Each automation is off, ask-first or automatic. Only an admin can switch one to automatic, and only low-risk steps that do not message a customer can be automatic. Customers who opted out are never drafted a message.
3. **Everything is on record.** Every step is logged, and most can be undone with one click. One switch pauses all automations.

**Small print under the cards:** AI reading is metered in monthly credits that come with your plan. When credits run out, the assistant keeps working on plain rules.

**Do not add:** call transcription, call summaries, a 24/7 chatbot, sentiment analysis, AI itinerary in "5 minutes", lead scoring.

---

## 5. Features by workflow

Group by what the agency does, not by module. Each bullet maps to a Works row unless flagged.

### Win the enquiry
- One inbox for WhatsApp, SMS and email, with a conversation thread for each customer
- Website enquiry form that creates the contact and lead
- Duplicate warning and contact merge
- Lead list and pipeline board; assign leads automatically by weight or by source
- Follow-up sequences you define per status

### Build and send the quote
- Itinerary builder, day by day, with templates and clone
- Prices from supplier rate cards; cost and margin visible only to roles that may see them
- Quote versions and a branded PDF
- Send by WhatsApp or email from one send dialog with templates and a preview

### Get paid and confirm
- Invoices with GST calculation (CGST/SGST or IGST) and HSN/SAC codes; credit and debit notes; PDF
- Record payments and advances; payment receipts; outstanding and ageing report
- Hotel, transport, flight and activity vouchers, with a status flow

### Run the trip
- Vehicles and drivers with document expiry dates shown on screen
- Trip assignments with a double-booking check
- Driver app: see trips, accept or reject, update status, check in and out. *(Add "install link" only after gate RG10; until then say "available to customers on request".)*
- Visa application tracker with checklists and documents

### Know where you stand
- Dashboard that links each number to its list
- About 50 built-in reports
- Import from a spreadsheet; export any list

### Keep control
- Six roles with set permissions
- Activity log of who changed what *(Partly works: say "activity log for admins")*
- Your data can be exported

**Not listed on the page until their gates clear:** calling and click-to-call, call transcripts, chatbot, WhatsApp campaigns, scheduled campaigns, automatic reminders for follow-ups and invoices, expiry alerts, online payment links, push notifications, languages other than English, "API access", "white label", "SSO".

---

## 6. Pricing

**Section title:** Priced per person, billed yearly

**Gate:** **[RG4]** and owner approval of `docs/COST-MODEL.md`. Until then publish the section as "Pricing: talk to us" with the sentence "Early agencies get a founder price locked for 24 months" **[owner]**.

### 6.1 India version (recommended first)

> **Basic:** Rs 200 per user per month, billed yearly, plus GST. Team of 5: Rs 1,000 a month.
> **Pro:** Rs 300 per user per month, billed yearly, plus GST. Team of 5: Rs 1,500 a month.
> **Enterprise:** Talk to us. *(Shown with a price only after the chatbot works and the intelligence features are checked on real data; see MARKETING-PLAN.md section 4.2.)*
>
> Minimum 5 users. Pay monthly for 20% more. Bigger than 25 people? Talk to us.

Includes lines (true today):
- **Basic:** the full workflow (inbox, leads, quotes, invoices, vouchers, fleet, visa, reports), the assistant with 1,000 AI credits a month, email support
- **Pro:** everything in Basic, 15,000 AI credits a month, AI message composer, lead extraction from pasted text, itinerary generator and business briefings. Note under the list: *"AI features are rolling out; ask us for the current status."* (they are "partly works")

Small print block (keeps trust, avoids hidden fees):
- Texts, marketing WhatsApp messages and phone calls are not included without limit. They are paid from a prepaid balance. *(Show this line once the prepaid balance exists; until then say "SMS and calls are not part of the launch plans.")*
- AI credits can be topped up: Rs 250 for 5,000 credits. **[owner]**
- We will invoice you; pay by UPI or bank transfer. *(Remove when online billing exists.)*

### 6.2 Alternative: per-agency version to A/B test in demos

> Basic: Rs 12,000 a year for a team of up to 5
> Pro: Rs 18,000 a year for a team of up to 5, Rs 300 per extra user a month

This keeps the "one number" feel of today's admin plans without the 15-user and 100-user flat prices that lose money (COST-MODEL 4 and 5.1). **[owner]** decide after two weeks of demo objections.

### 6.3 International version

**[gate RG6]** Hold until invoices, currency and foreign billing work.

> Basic $12, Pro $29, Enterprise $49 per user per month, billed yearly. Minimum 3 users. Shown in your currency at round numbers.

Do not show to visitors in Sri Lanka, Nepal, Bangladesh, Malaysia or Thailand until the lower bands exist; for them say "Talk to us".

### 6.4 Remove from the pricing section

"Up to 500 leads", "5 GB / 50 GB / unlimited storage", "Unlimited leads", "VoIP calling + transcription", "AI chatbot", "Fleet management as a Pro feature" (fleet is open to every plan), "Custom workflows", "API access", "Dedicated account manager", "SSO & advanced security", "White-label options", "Priority support", and the rupee conversion row (Rs 999, 2,399 and 3,999 per user), which contradicts the Indian proposal. None of the limits or features are enforced, built or both (FEATURES.md "Plan comparison").

---

## 7. FAQ

Replace the five current answers. Each is true today.

**How long does it take to start?**
We set you up together in a 30-minute call. We import your contacts from a spreadsheet, set your company details and invoice numbering, and invite your first two team members. *(Replaces "30 seconds, pre-loaded demo data".)*

**Can I bring my existing customers?**
Yes. Upload a spreadsheet of contacts or leads, match the columns, preview, and choose whether to skip or update duplicates. We will help with the first file. **[owner]** whether "free import for your first 500 contacts" stays.

**Does the assistant send messages to my customers?**
No. It prepares a reply and opens it in the send dialog; you read it and send it. Only an admin can set a low-risk step to run automatically, and none of those messages a customer.

**Does it work with WhatsApp?**
Yes. Customer WhatsApp messages arrive in the inbox and you reply from the same screen using templates. Setting up your number is done with us at the start. *(Do not say "official WhatsApp Business API" until the direct route exists.)*

**What happens if AI is switched off or credits run out?**
The assistant keeps working on fixed rules: it still files messages, creates leads and schedules follow-ups. AI reading is an extra layer.

**Is my data safe?**
Roles control who sees what, an admin can see an activity log, and you can export your data at any time. We are a new company, so we say plainly: ask us how your data is stored before you upload real customers. *(Add "each agency has its own separate database" only after gate RG2.)*

**Which languages does it support?**
The app is in English today. Messages to and from your customers can be in any language. Hindi and Arabic screens are planned, with no date yet.

**Does it make phone calls?**
Not yet. You can log calls and see call history. We will say here when calling is available and in which countries.

**Can I try before I buy?**
*(Gate RG4.)* Yes: 14 days, no card, with an onboarding call. During the trial there are no texts or calls and a small AI allowance.

**What does it cost?**
See pricing above. Texts, marketing WhatsApp messages and calls are paid from a prepaid balance, never hidden in the plan.

**Is there a driver app?**
Yes. Drivers see their trips, accept or reject, update status and check in with a photo and location. Ask us for the install link. *(Until RG10.)*

**Can customers pay online?**
Not yet. You record payments and send invoices as PDF. Online payment links are planned.

---

## 8. Final call to action

**Headline:** See your own enquiry go from WhatsApp to voucher.

**Text:** Book a 20-minute demo. Bring one real enquiry (with the name removed) and we will walk it through the product.

**Buttons:** [Book a demo] [WhatsApp us] *(Add [Start a 14-day trial] after gate RG4.)*

**Under the buttons:** Reply within 2 hours on business days. *(Remove "no credit card, free data migration" until RG4 and the owner decision.)*

---

## 9. Footer

- **Brand line (replaces "The only CRM purpose-built for tours & travels..."):** Software for travel agencies and tour operators.
- **Contact:** hello@travelcrm.pro. Phone and city line: **[owner]**. The current page shows "+91 98765 43210" (looks like a placeholder number) and "Mumbai, India · Dubai, UAE" (an office address nobody has confirmed). Show only a real WhatsApp number and a real city.
- **Product:** Features, Pricing, How it works, Demo.
- **Company:** About (write it: who is behind the product), Contact. Remove Blog, Careers, Partner Program until they exist; add "Partner with us" only with a form.
- **Legal:** Privacy Policy, Terms of Service **[gate RG5]**. Remove GDPR and Security links until the pages are real.
- **Social:** keep only the accounts that exist.
- **Copyright:** (c) 2026 TravelCRM Pro. *(Use the registered company name once decided.)*

---

## 10. What was removed and why

Every item below is on the current `landing/index.html` and none can be shown to be true.

| # | Claim on current page | Where | Why removed |
|---|---|---|---|
| 1 | "Trusted by travel agencies worldwide" | Social proof heading | No customers exist. |
| 2 | "500+ Travel Agencies" | Social proof; final CTA "Join 500+ travel agencies" | No evidence; the product has no live tenants. |
| 3 | "$2.4M+ Revenue Managed" | Social proof | No evidence. |
| 4 | "12+ Countries" | Social proof | No evidence; international selling is blocked (findings 02). |
| 5 | "99.9% Uptime" and "99.9% Uptime SLA" | Social proof and hero stat | No monitoring exists (FEATURES.md, "Monitoring and logging: Placeholder"); no SLA is written. |
| 6 | Six named agencies: Wanderlust Travels, Desert Rose Tourism, Pacific Tours, Alpine Adventures, Coral Bay Travel, Siam Journeys | Social proof | Not customers. Naming businesses without permission is a legal risk. |
| 7 | Three named testimonials (Rajesh Kumar of Wanderlust Travels, Mumbai; Ahmed Al-Rashid of Desert Rose Tourism, Dubai; James Thompson of UK Holidays, London) with figures "saved 70%", "conversion 18% to 32%", "3 hours saved daily" | Testimonials | Invented or unverifiable. The same names and a "Rajesh Kumar / Bali" lead also appear in the hero mock-up. |
| 8 | "4.9 from 127 ratings" in the JSON-LD | Structured data | Fabricated rating data can lead to a search-engine penalty and is misleading. Keep the offers only if the prices are approved, and fix operating-system list (see 21). |
| 9 | "+32% Conversion rate" and "85% Conversion" and "147 New Leads, $124K Revenue" | Hero mock-up cards | Invented numbers. If the mock-up stays, label it "Sample data" and use no percentages. |
| 10 | "5 min Itinerary creation" and "Proposals in 5 Minutes" | Hero stat, feature 2 | Not measured. AI itinerary generator is partly working. Say "from a template and your rate cards" instead. |
| 11 | "10+ Languages" and "English, Hindi, Arabic, Spanish, French, Thai, and Bahasa Indonesia" | Hero stat, FAQ | Desktop interface language switch is a placeholder; 0 of 193 pages use the translations; no right-to-left (findings 02). |
| 12 | "50+ Reports" | Hero stat | Kept in a softer form ("about 50 built-in reports") because FEATURES.md says Works. |
| 13 | "Built-in VoIP calling with AI transcription", "Click-to-call VoIP", "AI call transcription & summaries", "Call Intelligence", "Zero data entry", sentiment analysis flags at-risk deals | Feature 3, AI section | Place-a-call is Broken, transcripts and AI call summary are Placeholders, sentiment analysis does not exist, and calling is not offered in several markets (ADR-001). |
| 14 | "24/7 AI Chatbot... Qualifies leads, books appointments" and "AI chatbot" in Pro | AI section, pricing | Chatbot endpoints sit behind login and fail for visitors (Broken). |
| 15 | "WhatsApp template campaigns", "WhatsApp campaigns" in Pro, "bulk campaigns" | Feature 3, pricing, FAQ | Campaign scheduling is Broken, WhatsApp campaigns are Enterprise and partly working. |
| 16 | "AI-powered lead scoring & priority ranking", "AI follow-up sequences", "smart scoring" | Feature 1 | Lead scoring is an Enterprise feature that is partly working; follow-up sequences work but are not AI. |
| 17 | "Never lose a lead again", "Never miss a lead" | Feature 1, AI card | Absolute promise we cannot keep. |
| 18 | "8-stage Kanban board" | Feature 1 | The mock-up shows four stages; the pipeline board is partly working. Say "pipeline board". |
| 19 | "Version history & client approval tracking" | Feature 2 | Quote versions work; client approval tracking is not in FEATURES.md. |
| 20 | "One-click PDF & WhatsApp sharing" | Feature 2 | Send is partly working. Say "send from the send dialog". |
| 21 | "operatingSystem: Web, Windows, Android, iOS" | JSON-LD | The product is a desktop app (Windows, Mac, Linux) plus a driver app; no web app or store listing. |
| 22 | "No credit card, 14-day free trial, 30s setup", "instant access with pre-loaded demo data" | Hero, FAQ, CTA | Trials never expire and a created agency cannot log in today (findings 02); no demo-data seeding is described. |
| 23 | "Free data migration for your first 500 contacts" | FAQ, CTA | A promise that needs the owner to agree to do it by hand. Spreadsheet import itself works. |
| 24 | "Is my data secure with DB-per-tenant? ... physically separated" and "enterprise-grade security at SMB pricing" | FAQ | All agencies share one database today (FEATURES.md "Separate database per agency: Broken"). Provider keys are stored in plain text. |
| 25 | "We support both WhatsApp Business API for bulk campaigns and regular WhatsApp... Templates, auto-replies, and chatbot included" | FAQ | The direct Business API route does not exist (COST-MODEL 7); chatbot is broken. |
| 26 | "Up to 500 leads", "Unlimited leads", "5 GB / 50 GB / Unlimited storage" | Pricing | Not enforced anywhere. |
| 27 | "Custom workflows", "API access", "Dedicated account manager", "SSO & advanced security", "White-label options", "Priority support" | Pricing | Not built or not enforced (FEATURES.md "Plan comparison"). Note "Custom workflows" is closest to "Build your own rules", which works but is not a plan feature. |
| 28 | "The only CRM purpose-built for tours & travels. AI-powered, WhatsApp-native, international-ready." | Footer | "Only" is false (see competitor list); "international-ready" is false (findings 02). |
| 29 | Rupee conversions Rs 999 / 2,399 / 3,999 per user | Pricing | Disagrees with the Indian proposal (Rs 200 / 300 / 400). |
| 30 | "+91 98765 43210", "Mumbai, India · Dubai, UAE" | Footer | Looks like a placeholder number; offices unconfirmed. |
| 31 | Dead links: Start Free Trial, Watch Demo, Privacy, Terms, GDPR, Security, API Docs, Changelog, Careers, Blog, Partner Program, About, Integrations | Everywhere | Every call to action is `href="#"`; the pages do not exist. |
| 32 | "Revenue $124K", "Ahmed Hassan / Dubai", "Maria Garcia", etc. in mock-ups | Mock-ups | Sample data presented without a label. Add "Sample data" to every mock-up. |

**Rule going forward:** every number on the page needs a source file or a dated record in `docs/marketing/`. Customer names go on the page only with written permission, saved in the repo's private notes.
