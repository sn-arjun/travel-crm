# Email sequences

- Written 2026-10-14. Two sequences: trial onboarding (7 emails, 14 days) and demo follow-up (4 emails).
- Sender: the founder by name, from a real address (**[owner]**, `hello@travelcrm.pro` exists on the current site). Plain text with one link. No images except the video thumbnail.
- Placeholders in double braces are filled by hand or by the email tool: `{{first_name}}`, `{{agency}}`, `{{trial_link}}`, `{{demo_link}}`, `{{whatsapp_link}}`, `{{video_link}}`, `{{founder_name}}`.
- Video names are the planned films in `studio/README.md` and `desktop/showcase/SHOWCASE.md`. Where a film does not exist yet, the table at the end names the existing cut to use instead. Every film is shown on sample data; keep the line "Sample data. Messages simulated." on screen.
- Timing assumes the trial ends by itself on day 14 and the account then goes read-only. That needs readiness gate RG4 (`MARKETING-PLAN.md` section 2.4). No sequence runs before RG1 and RG2.
- Indian owners read WhatsApp more than email (assumption). For every email, the founder can send the same text one to one on WhatsApp instead; do not bulk-send on WhatsApp.
- Every email has a reply-to that reaches a person, and a one-line opt-out ("Reply STOP and I will stop writing"). Do not claim a feature in the Broken, Placeholder or partly-working lists (`MARKETING-PLAN.md` section 1.4).

---

## A. Trial onboarding, 7 emails over 14 days

Trial rules used (proposal): 14 days, no card, full features of the plan tried, no texts, no calls, a small AI allowance (about 200 credits). Day 0 is the day the trial starts and the 30-minute onboarding call is booked.

### A1. Day 0: Welcome and your first 30 minutes

- **Goal:** get the onboarding call booked and the contact spreadsheet ready.
- **Subject:** Your TravelCRM Pro trial is open, {{first_name}}
- **Video:** the **handoff film** ("super admin to client handoff": what happens in your first week).
- **Body:**

> Hi {{first_name}},
>
> Your 14-day trial for {{agency}} is open. Here is how to start: {{trial_link}}
>
> The quickest way to get value is a 30-minute call where we set up your company details and bring in your customer list. Pick a time here: {{demo_link}}
>
> Before the call, please save your customers as a spreadsheet (name, phone with country code, email, city). Any layout is fine, we will match the columns together.
>
> This 3-minute film shows what happens in your first week: {{video_link}}
>
> During the trial there are no text messages or phone calls from the system, and AI reading has a small allowance. Everything else works as in the paid plans.
>
> {{founder_name}}
> Reply to this email or message me on WhatsApp: {{whatsapp_link}}

### A2. Day 1: Bring in your customers

- **Goal:** contacts and leads imported (activation step 1).
- **Subject:** Bring your customer list in (5 minutes)
- **Video:** short, **"Import contacts from a spreadsheet"** (planned per-feature short).
- **Body:**

> Hi {{first_name}},
>
> If you have not imported your customers yet, this is the step that makes the rest useful. Upload the spreadsheet, check how the columns match, preview, and choose whether to skip or update duplicates.
>
> Watch the 40-second clip: {{video_link}}
>
> Stuck on a column? Send me the file and I will import it for you. No problem if it is messy.
>
> {{founder_name}}

### A3. Day 3: Your first real enquiry

- **Goal:** the first real enquiry handled in the product (the activation event).
- **Subject:** Try one real enquiry this week
- **Video:** the **assistant film**, "From a WhatsApp message to a booked trip" (edited, calls and chatbot chapters removed).
- **Body:**

> Hi {{first_name}},
>
> The best test of the product is one real enquiry. Next time a customer writes to you on WhatsApp or email, let it land in the inbox and look at what the assistant suggests: usually "create the contact and the lead", with the destination, dates and budget already read from the message. You click Apply, or Dismiss.
>
> Nothing is sent to a customer without you reading and sending it.
>
> This 3-minute film shows one enquiry from first message to hotel voucher, on sample data: {{video_link}}
>
> If you would like, forward me an enquiry (names removed) and I will show you how it would look.
>
> {{founder_name}}

### A4. Day 5: Build a quote from your own rates

- **Goal:** one itinerary built and sent from a template and rate cards.
- **Subject:** A quote in minutes from your own templates
- **Video:** short, **"Itinerary from a template and your rate cards"** and, for the owner role, **"The owner's view: cost and margin"** (one film per role).
- **Body:**

> Hi {{first_name}},
>
> Quotes are where agencies lose the most time. In the product, you pick a template, the prices come from your rate cards, and you get a day-by-day plan with a branded PDF. Owners and sales managers can see cost and margin; salespeople cannot.
>
> Start with one template you use often. Save it, then make the next quote from it.
>
> Clip: {{video_link}}
>
> Tell me the three trips you quote most and I will help you set up templates for them.
>
> {{founder_name}}

### A5. Day 7: Your team and what runs by itself

- **Goal:** two or more users active; automations understood.
- **Subject:** Halfway: team members and the assistant's rules
- **Video:** the **automations film** (no calls), and the role film for the team member you invited.
- **Body:**

> Hi {{first_name}},
>
> A week in. Two things worth doing now:
>
> 1. Invite a colleague. Six roles control what each person sees (owner, sales manager, salesperson, operations, accountant, view only).
> 2. Look at Assistant > Automations. Each automation is off, ask-first or automatic. Money and customer messages always ask first. Only low-risk steps, such as scheduling a follow-up, can run on their own, and an admin has to switch that on.
>
> Short film on how it works: {{video_link}}
>
> What has worked, and what has been confusing? One line back is enough.
>
> {{founder_name}}

### A6. Day 10: Plans and prices

- **Goal:** decision conversation booked.
- **Subject:** What it costs, in plain numbers
- **Video:** the **plan comparison film**.
- **Body (India version; international only after gate RG6):**

> Hi {{first_name}},
>
> Four days left. Here is what it costs, no surprises:
>
> Basic: Rs 200 per user per month, billed yearly, plus GST. A team of 5 is Rs 1,000 a month.
> Pro: Rs 300 per user per month, billed yearly, plus GST. A team of 5 is Rs 1,500 a month.
>
> Monthly billing is 20% more. Texts, marketing WhatsApp messages and calls (when available) are paid from a prepaid balance and are never part of the plan.
>
> The difference between the plans is mostly the AI: Basic has 1,000 AI credits a month, Pro has 15,000 and adds the AI composer and itinerary generator. Plan comparison in 2 minutes: {{video_link}}
>
> Do you have 15 minutes on {{day}} to decide what suits {{agency}}? {{demo_link}}
>
> {{founder_name}}

*(Uses the proposal prices from `docs/COST-MODEL.md`. Do not send until the owner approves them.)*

### A7. Day 13: Last day tomorrow

- **Goal:** convert, or learn why not.
- **Subject:** Your trial ends tomorrow
- **Video:** none (keep it short), or the **90-second hero** as a recap.
- **Body:**

> Hi {{first_name}},
>
> Your trial ends tomorrow. After that your account turns read-only; nothing is deleted, and you can export your data at any time.
>
> If it is useful: reply "yes" and I will send an invoice you can pay by UPI or bank transfer. As one of our first agencies you can also have a founder price locked for 24 months (**[owner]** confirm the offer).
>
> If it is not a fit, I would value one line on why. That helps me more than a sale.
>
> {{founder_name}}

### A8. Branches (not extra emails)

- **No login in 3 days:** founder sends a WhatsApp message, not an email.
- **Imported but no enquiry handled by day 5:** offer a 15-minute call to forward a real enquiry together.
- **Asked about calling or the chatbot:** answer from `MARKETING-PLAN.md` section 8.6 ("Not at launch").

---

## B. Demo follow-up, 4 emails

Start the clock after the live demo (`DEMO-SCRIPT.md`). Send the first within 2 hours.

### B1. Same day: Thanks and the clip

- **Goal:** keep the thread warm; give them something to forward to a partner or colleague.
- **Subject:** The demo clip and next step, {{first_name}}
- **Video:** the **90-second hero** (or the edited **assistant film** if they cared about the inbox).
- **Body:**

> Hi {{first_name}},
>
> Thank you for your time today. As promised, here is the short film of what you saw: {{video_link}} (sample data, messages simulated).
>
> What I heard: {{one pain they named, in their words}}. In the product that is handled by {{the one feature}}.
>
> Next step I suggest: a 14-day trial with a 30-minute set-up call where we bring in your customers. Choose a time: {{demo_link}}
>
> {{founder_name}}

### B2. Day 2: One feature, chosen by their pain

- **Goal:** show depth in the area they cared about.
- **Subject:** On your point about {{topic}}
- **Video:** the matching **feature short** (inbox, itinerary from rate cards, invoices and vouchers, fleet and driver app, or automations without calls).
- **Body:**

> Hi {{first_name}},
>
> You mentioned {{topic}}. This 40-second clip shows how it works: {{video_link}}
>
> If you send me one real example (names removed), I will show you how it would look in the product.
>
> {{founder_name}}

### B3. Day 5: Prices and the trial

- **Goal:** answer the money question before they ask again.
- **Subject:** Prices, and what is not included
- **Video:** the **plan comparison film**.
- **Body:**

> Hi {{first_name}},
>
> In case it helps your decision: Basic is Rs 200 per user per month and Pro is Rs 300, billed yearly, plus GST. A team of 5 is Rs 1,000 or Rs 1,500 a month.
>
> What is not in the plan: texts, marketing WhatsApp messages and calls. Those are paid from a prepaid balance so a quiet month costs you nothing extra. Calling is not available yet.
>
> The trial is 14 days with a set-up call. 2-minute comparison: {{video_link}}
>
> Shall I open a trial for {{agency}}? Reply "yes" and I will set it up.
>
> {{founder_name}}

### B4. Day 10: Close the loop

- **Goal:** get a decision or a reason.
- **Subject:** Should I close your file?
- **Video:** none.
- **Body:**

> Hi {{first_name}},
>
> I do not want to keep writing if the timing is wrong. Three options:
>
> 1. Yes, let us start a trial. Reply "start".
> 2. Not now. Reply with the month to talk again.
> 3. Not a fit. One line on why would help me a lot.
>
> {{founder_name}}

---

## C. Video map

| Planned film | Used in | If it does not exist yet, use |
|---|---|---|
| Super-admin-to-client handoff | A1 | Skip the film and link the one-page "your first week" text from `docs/HANDOFF-PLAYBOOK.md` once written |
| Per-feature short, "Import contacts" | A2 | Chapter "Contacts" (01:10) of the full walkthrough, trimmed |
| Assistant film, edited | A3, B1 | `desktop/showcase/TravelCRM-Assistant.mp4` with the end chapters kept as shown; label as sample data |
| Itinerary from a template and rate cards; owner role film | A4 | Walkthrough chapters "Itineraries" (04:28), "Itinerary templates" (05:34), "Rate cards" (06:33) |
| Automations film (no calls) and role films | A5 | Assistant film chapter "You stay in control" (02:39) |
| Plan comparison film | A6, B3 | The `plans` scene type in the studio kit (`studio/README.md`) once prices are approved |
| 90-second hero | A7, B1 | Narrated pilot, 74 seconds (`studio/out/pilot-assistant.mp4`), after owner voice approval (gate G2) |
| Per-feature shorts for B2 | B2 | Walkthrough chapters: Inbox, Invoices (08:24), Vouchers (10:32), Fleet (12:41 to 16:44), Driver app (16:44) |

Do not link the **calls and VoIP**, **chatbot**, **WhatsApp campaigns** or **super admin** chapters of the full walkthrough in any email until their gates clear (`MARKETING-PLAN.md` section 7.1).
