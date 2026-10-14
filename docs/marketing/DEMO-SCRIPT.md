# Demo script

- Written 2026-10-14. A 20-minute live demo and a 5-minute version. Both follow one realistic enquiry from a WhatsApp message to a hotel voucher.
- The story is the one recorded in `desktop/e2e/showcase/assistant.spec.ts` and the "Assistant and automations" film: a customer called Meera writes to Sahyadri Holidays (sample agency) about a Kerala trip: Munnar, a houseboat night in Alleppey, some time in Kumarakom, budget about Rs 1.3 lakh. All names and data are sample data.
- Say "what you click" for the left column and "what you say" for the right. Words in quotes are suggestions; use your own.
- Everything here is a Works feature in `docs/FEATURES.md`, or labelled partial. Do not go into calls, the chatbot, campaigns, AI business intelligence or the super admin console in a demo (`MARKETING-PLAN.md` section 1.4).

---

## Before you start (15 minutes, the day before)

1. Stack up on a production build, not the dev server (`desktop/showcase/SHOWCASE.md`, "Regenerate"). Reset to the seed demo data so the lead list is clean.
2. Decide whether AI is on. With AI on, the incoming-message cards carry an "AI" tag and cost real Workers AI requests (the recorded take used 4). With AI off, the same script runs on the rule-based reader and the cards carry no tag. Dry-run once with AI off; run live demos with AI off unless the prospect asks, so you never wait on a slow model or spend credits. Say so honestly if asked.
3. The WhatsApp message arrives through the test simulator (`POST /test/inbound`, the same code path as a provider webhook). Tell the viewer this. Do not pretend a real phone sent it.
4. Know the defects (SHOWCASE.md, "Application findings"): the stray "0" on calendar cards, credit notes shown in the invoice list, drafted replies run the sign-off into the sentence (you edit them in the send dialog), the lead title may read "Munnar family trip". Stay away from those screens or mention them lightly.
5. Have the prospect's real situation in your notes: team size, where enquiries come from, what they use today (Excel, Zoho, Sembark, WhatsApp only).
6. Open the pricing page of `LANDING-COPY.md` in a second tab.

---

## 20-minute version

### 0:00 to 2:00. Open with them, not the product

- **Do:** no screen share yet. Ask three questions, write the answers.
  1. "Tell me about the last enquiry that came in. Where did it arrive and what happened next?"
  2. "Who builds the quote, and how long does it take?"
  3. "What do you use today?"
- **Say:** "I will show you one enquiry from the first message to the hotel voucher. Stop me when something looks different from how you work."
- **Why:** you need their words for the close (MARKETING-PLAN section 8).

### 2:00 to 4:00. The enquiry arrives

- **Do:** share screen on the Inbox. A WhatsApp message from Meera arrives (trigger the simulator).
- **Say:** "This is sample data and the message is simulated. On your account it comes from your own WhatsApp number, email address or website form into this one inbox."
- **Do:** point at the suggestion badge on the message. Open the message detail.
- **Say:** "Before anyone opens it, the assistant has read it. It found the destinations, the number of travellers and the budget. It is not sending anything. It is proposing."
- **Show:** the thread view (all messages with Meera in one place) and the channel filter.
- **Land:** "Everything from one customer in one thread, whoever on your team replied."

### 4:00 to 6:30. One click makes the contact and lead

- **Do:** open the suggestion, show what it will do, click **Apply**.
- **Say:** "Contact and lead created. Nothing typed. If it were wrong I would click Dismiss."
- **Do:** open the lead. Show the timeline and the follow-up that was scheduled automatically.
- **Say:** "The first follow-up was scheduled for about a day later by a rule. You can change that rule or turn it off."
- **Show (30 seconds):** the **Assistant** page with the suggestions queue and the **activity log with undo**.
- **Say:** "Everything the assistant does is written here. Most steps have an undo button."

### 6:30 to 10:00. The quote

- **Do:** from the lead, open the itinerary suggestion: "closest template picked". Click it to create the itinerary.
- **Say:** "It picked your closest template for a Kerala trip. You get a day-by-day plan, priced from your rate cards." *(If AI is off, say: "Here the template match is rule-based.")*
- **Show:** days and items; the rate-card price picker; the **Costs** tab (owner view: cost against selling price; "a salesperson would not see this tab").
- **Show:** preview the **quotation PDF** (branded).
- **Ask:** "How long does this take you today?" Let them answer. Do not argue.

### 10:00 to 12:30. Send, with a person in control

- **Do:** open the drafted reply from the suggestion. It opens in the **send dialog** (channel, template, preview).
- **Say:** "The assistant never sends. The draft opens here. You read it, change it, send it. All messages to customers go through this one dialog."
- **Do:** edit one word, click **Send WhatsApp**.
- **Do:** from the itinerary, **Send via WhatsApp**, choose the itinerary-link template, send.
- **Say:** "The lead moved to Proposal Sent by itself, and a follow-up is set for two days from now."
- **Show:** the lead's status and the new follow-up.

### 12:30 to 15:00. The customer says yes

- **Do:** trigger Meera's second message: go ahead, advance paid.
- **Say:** "Two things in one message. The assistant understood both: she confirmed, and she told us she paid."
- **Do:** apply the suggestion to mark the lead **Won**. Show the **booking checklist** tasks created automatically (vouchers, traveller documents, transfers, balance payment).
- **Do:** open the invoice suggestion; apply it. Show the invoice drafted from the itinerary and the payment she mentioned matched to it, with the bank reference.
- **Say:** "It matched the payment she told us about to the invoice it drafted. You confirm. Invoices carry GST: CGST and SGST or IGST by state, with HSN or SAC codes."
- **Note:** invoice from itinerary and payment matching are partly working; say "drafted" and "suggested".

### 15:00 to 17:00. Vouchers and the trip

- **Do:** record the advance (or show it recorded); the assistant offers **hotel vouchers**, one per hotel stay in the itinerary, dates worked out.
- **Say:** "Once the advance is in, a voucher is drafted for each stay. You review and send."
- **Do:** open one voucher; show the status flow draft, sent, confirmed.
- **Do (optional, if they have vehicles):** open the suggestion "line up a vehicle and driver for arrivals": a free vehicle that fits the group, a free driver, the trip form pre-filled. Then 20 seconds on the driver app screen or the film clip: the driver accepts, updates status and checks in with a photo.
- **Say:** "The same system holds your vehicles, drivers and trips."

### 17:00 to 18:30. You stay in control

- **Do:** open the automations list.
- **Say:** "Each automation is off, ask first, or automatic. Money and messages always ask. Only an admin can switch one to automatic, and only low-risk steps like scheduling a follow-up. One switch pauses everything."
- **Show:** the daily checks that draft reminders for quiet quotes and overdue invoices *(partly working: say "drafts"; do not mention automatic reminders or alerts)*.
- **Say:** "AI reading uses monthly credits that come with the plan. When they run out, the rules keep working."

### 18:30 to 19:30. Price, plainly

- **Do:** show the pricing section.
- **Say:** "Proposal for early agencies: Rs 200 per user a month on Basic, Rs 300 on Pro, billed yearly plus GST. For a team of five that is Rs 1,000 or Rs 1,500 a month. Texts and calls are not part of the plan." *(Use only if the owner has approved the prices; otherwise say "I will send you the early-agency price today".)*

### 19:30 to 20:00. Close

- **Ask:** "If this handled your next five enquiries, what would you want to see first?"
- **Propose:** "A 14-day trial, with a 30-minute call where we bring in your customer list from a spreadsheet. Shall we find a time now?" Book it in the call.
- **After:** send follow-up email B1 within 2 hours (`EMAIL-SEQUENCES.md`).

---

## 5-minute version

For a first call, a hallway chat at an event, or a screen-share when they have little time.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Inbox with the new WhatsApp enquiry (simulated, say so) | "Sample data. This is how an enquiry looks the moment it arrives. The assistant already read it: destinations, travellers, budget." |
| 1:00 | Apply the suggestion; open the lead | "One click: contact and lead, nothing typed. A follow-up is already scheduled." |
| 2:00 | Create the itinerary from the template; show the PDF | "Closest template, priced from your rate cards. A branded PDF." |
| 3:00 | Send dialog with the drafted reply; send | "The assistant drafts. You read and send. It never messages a customer by itself." |
| 3:45 | Second message: she says yes and has paid; invoice drafted; vouchers drafted | "It understood the yes and the payment. Invoice and hotel vouchers are drafted. You approve each step." |
| 4:30 | Activity log | "Everything is logged, most steps can be undone." |
| 4:45 | Close | "Want to see it with one of your own enquiries? Twenty minutes, I will book it now." |

If you have only 90 seconds, show the inbox suggestion and one click (first two rows) and play the 90-second hero film.

---

## If they ask

| Question | Say |
|---|---|
| "Can it call?" | "Not at launch. You can log calls. We will tell you when and where calling arrives." |
| "Is there a chatbot on my website?" | "Not yet. Your website form can create leads straight into the inbox." |
| "Can I run WhatsApp campaigns?" | "Not as a launch feature. Drafting and sending one to one is what works today." *(Campaigns are partly working; scheduled campaigns are broken.)* |
| "Is my data separate from other agencies?" | "I will give you the exact answer when we start your trial. I will not promise before I can show you." *(Until gate RG2.)* |
| "Does it support Hindi / Arabic?" | "The screens are English today. Your customer messages can be in any language." |
| "Can customers pay online?" | "Not yet. You record payments and send PDFs." |
| "What did that cost in AI?" | "AI reading is metered in credits included in the plan; the Usage tab shows what was used. Rules are always free." |

## After the demo (2 minutes)

Write down: their words for the problem, objections raised, features they asked for that do not exist, who else decides, the next step and date. Feed the objection log and the weekly dashboard (`MARKETING-PLAN.md` section 9.3).
