# TravelCRM Pro: what the product does today

_Written from the code on 2026-10-09 (not from the old requirement documents). "Works" means the screen and the server side both exist and are connected, ideally with an automated test. Where something was not checked, it says so._

## What this is

TravelCRM Pro is a customer and operations system for tours and travel agencies. An agency uses it to catch enquiries, turn them into quotes, take payments, issue vouchers, assign vehicles and drivers, and keep its team and customers in step. Five things ship:

1. **The desktop app** (Windows, Mac, Linux) that the agency team uses all day.
2. **The server** behind it: the API, background jobs, message intake and the Assistant that prepares next steps.
3. **The driver mobile app** for drivers to accept trips, check in and out and send photos and location.
4. **The super admin console** where the platform owner creates and manages agencies, plans and billing.
5. **The landing page**, plus **per-agency WordPress websites** that the platform can host for each agency.

Important context for every feature below: the server is built to give each agency its own database, but as configured today all agencies would share one database (see "Not finished yet"). Features that send real messages, make calls, or use AI also need the platform's accounts with Twilio, SendGrid, Deepgram and Cloudflare AI or Anthropic; without them the screens work but nothing is delivered.

**Status words:** Works / Partly works (wired, with a real gap named in the "Not finished yet" list) / Placeholder (a screen or endpoint that does nothing real) / Broken (cannot succeed as written).

**Who can use it** lists the roles that can perform the feature. The six roles are Admin, Sales manager, Salesperson, Operations, Accountant and View only; drivers are separate and use only the driver app.

## Summary

| Area | Features | Works | Partly works | Placeholder | Broken |
|---|---:|---:|---:|---:|---:|
| Enquiries and inbox | 19 | 8 | 10 | 1 | 0 |
| Contacts | 13 | 11 | 2 | 0 | 0 |
| Leads and pipeline | 14 | 11 | 3 | 0 | 0 |
| Follow-ups and tasks | 15 | 11 | 2 | 0 | 2 |
| Itineraries and templates | 13 | 10 | 3 | 0 | 0 |
| Rate cards and suppliers | 11 | 8 | 3 | 0 | 0 |
| Invoices and payments | 20 | 12 | 6 | 1 | 1 |
| Vouchers | 6 | 3 | 3 | 0 | 0 |
| Travellers and visa | 9 | 6 | 2 | 0 | 1 |
| Fleet and driver app | 24 | 15 | 6 | 2 | 1 |
| Calls | 13 | 3 | 6 | 3 | 1 |
| Assistant and automations | 60 | 25 | 34 | 0 | 1 |
| Marketing | 15 | 7 | 7 | 0 | 1 |
| Documents | 3 | 2 | 1 | 0 | 0 |
| Reports and dashboard | 10 | 7 | 3 | 0 | 0 |
| Import and export | 7 | 6 | 1 | 0 | 0 |
| Settings and team | 20 | 10 | 7 | 3 | 0 |
| Super admin console | 17 | 0 | 11 | 5 | 1 |
| Landing page | 7 | 2 | 3 | 2 | 0 |
| Agency websites (WordPress) | 5 | 0 | 4 | 1 | 0 |
| Platform services | 11 | 0 | 7 | 2 | 2 |
| **Total** | **312** | **157** | **124** | **20** | **11** |

Evidence for "Works" is strongest where an end-to-end test exists: the latest recorded full run (desktop/audit/fix/FINAL-E2E.md) passed 766 tests with 38 skipped (skips are plan-gated AI and chatbot pages, AI generation with no provider, and super admin).

## Enquiries and inbox

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Customer WhatsApp and SMS arrive in the inbox | Messages a customer sends to the agency number are matched to a contact and lead and appear in the inbox. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Plivo WhatsApp and SMS inbound | Same inbound pipeline for agencies that use Plivo instead of Twilio. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Customer emails arrive in the inbox | Emails sent to the agency enquiry address are parsed and filed against the right contact and lead. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Website enquiry form creates a lead | A form on the agency website posts an enquiry with an API key and a contact and lead are created. | Admin, Sales manager, Salesperson | All plans | Works |
| Lead capture webhook (older) | Older API-key webhook that creates a lead from an external form or ad platform. | Admin only | All plans | Works |
| Website-form API keys | Admin creates and revokes keys; a key is shown once and used by the website form and webhook. | Admin only | All plans | Partly works |
| Map agency numbers and mailboxes to the workspace | Admin registers which WhatsApp, SMS, email or voice address belongs to the workspace so inbound messages find their owner. | Admin only | All plans | Partly works |
| Unified inbox | One searchable list of messages across email, WhatsApp and SMS with channel filter, hover actions, detail drawer and CSV export. | Everyone | All plans | Works |
| Conversation thread per contact | All messages with one contact in one thread, filterable by channel, with a Send message action. | Everyone | All plans | Works |
| Compose a message | Pick a recipient from a searchable list, choose a channel and template, write and send. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Send-message dialog on every record | One dialog on contacts, leads, invoices, vouchers and more: choose channel and template, preview, send through the Communication Hub. No raw mailto or wa.me links anywhere. | Admin, Sales manager, Salesperson | All plans | Works |
| Bulk send to many contacts | Three-step wizard to send one message to a chosen list on email, SMS or WhatsApp. | Admin, Sales manager | All plans | Partly works |
| Message history and log | Per-contact message history and a log of every message sent. | Everyone | All plans | Works |
| Send a stored document by message | Attach a stored document to an outbound message. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Message templates | Reusable email, SMS and WhatsApp templates with placeholders, live preview using a real contact, SMS character counter and duplicate. | Admin, Sales manager | All plans | Works |
| Email signature | Each user sets a signature that is appended to outbound emails. | Everyone | All plans | Works |
| Delivery and open tracking | Twilio status callbacks and SendGrid events update message status to delivered, opened or clicked. | Runs automatically | All plans | Partly works |
| Public unsubscribe link | Recipients can opt out from a link inside marketing messages. | Runs automatically | All plans | Placeholder |
| Live updates | New messages, suggestions and notifications appear without refreshing, over a websocket. | Everyone | All plans | Partly works |

## Contacts

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Contact list | Searchable, filterable list of customers with infinite scroll, hover actions, detail drawer and CSV export. | Everyone | All plans | Works |
| Add and edit a contact | Create or edit a customer with phone picker, address autocomplete and typed relations; edit forms pre-fill every stored value. | Admin, Sales manager, Salesperson | All plans | Works |
| Contact profile with related records | One page with the contact, related leads, invoices and itineraries, and a timeline of activity. | Everyone | All plans | Works |
| Contact activity timeline | Chronological history of everything that happened with a contact. | Everyone | All plans | Works |
| Duplicate warning | Entering an email or phone that already exists shows a warning before saving. | Admin, Sales manager, Salesperson | All plans | Works |
| Merge two contacts | Pick two contacts, preview the combined record, merge and remove the duplicate. | Admin, Sales manager | All plans | Works |
| Tags and bulk tag | Tag contacts and apply a tag to many at once. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Custom fields | Admin adds extra fields to contacts; values save with each contact. | Admin only | All plans | Works |
| Share a contact with a teammate | Share a contact so it shows up under Shared with me for the recipient. | Admin, Sales manager, Salesperson | All plans | Works |
| Birthdays and anniversaries | Store birthday and anniversary and list upcoming occasions. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Import contacts from a spreadsheet | Upload, map columns, preview, handle duplicates (skip or update) and import contacts. | Admin only | All plans | Works |
| Export contacts | Download the filtered list as CSV or Excel. | Admin, Sales manager | All plans | Works |
| Delete a contact | Contacts are soft-deleted so history is kept. | Admin, Sales manager | All plans | Works |

## Leads and pipeline

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Lead list | Searchable list with status and priority filters, infinite scroll, hover actions and export. | Everyone | All plans | Works |
| Pipeline board | Switch between table and a board of pipeline columns and drag leads between stages. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Add and edit a lead | Create a lead with contact and owner chosen from searchable lists; opening from a contact pre-fills the contact. | Admin, Sales manager, Salesperson | All plans | Works |
| Lead detail with timeline | Lead page with status, notes, follow-ups, activities, itineraries, invoices and payments. | Everyone | All plans | Works |
| Change lead status | Move a lead through new, contacted, proposal sent, won, lost and so on; changes persist and fire automations. | Admin, Sales manager, Salesperson | All plans | Works |
| Record why a lead was lost | Marking a lead lost asks for a reason that feeds the lost-deal report. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Lead notes | Add, edit and delete notes on a lead. | Admin, Sales manager, Salesperson | All plans | Works |
| Unassigned leads and bulk assign | See leads with no owner and assign many to a teammate at once. | Admin, Sales manager | All plans | Works |
| Bulk status change and bulk delete | Select many leads to change status or delete together. | Admin, Sales manager | All plans | Partly works |
| Auto-assign new leads | Admin sets weighted rules so new leads go to the right salesperson. | Admin only | All plans | Works |
| Lead routing by source | Admin routes leads from a given source to a given teammate. | Admin only | All plans | Works |
| Follow-up sequences | Admin defines follow-up steps that are created automatically when a lead reaches a status. | Admin only | All plans | Works |
| Export leads | Download leads as CSV or Excel. | Admin, Sales manager | All plans | Works |
| Import leads | Bring leads in from a spreadsheet with contact matching. | Admin only | All plans | Works |

## Follow-ups and tasks

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Follow-ups list | Everything due to be chased, with type and status filters, reschedule, complete with outcome and cancel. | Admin, Sales manager, Salesperson | All plans | Works |
| Schedule a follow-up | Create a follow-up against a lead chosen from a searchable list. | Admin, Sales manager, Salesperson | All plans | Works |
| Follow-up reminders | Reminder notifications when a follow-up is due. | Admin, Sales manager, Salesperson | All plans | Broken |
| Task list | Tasks with status, priority and category filters, bulk complete, infinite scroll and export. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Task detail, subtasks and comments | Open a task to change status, add subtasks and discuss in comments. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Task linked to a lead | Create a task from a lead; the lead is pre-filled and the task shows on the lead. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Overdue task notifications | Daily notification to the assignee about overdue tasks. | Runs automatically | All plans | Broken |
| Calendar | Month and week calendar of events with drag-and-drop rescheduling and CSV export. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Create and edit events | Add meetings and reminders to the calendar. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Notification centre | Bell and full list of notifications with unread filter, mark all read, bulk actions and export; badges in the sidebar. | Everyone | All plans | Works |
| Team announcements | Admin broadcasts a notice to chosen roles; it appears in each person notification list. | Admin only | All plans | Works |
| Notification preferences and quiet hours | Each user chooses channels and quiet hours. | Everyone | All plans | Partly works |
| Push notifications | Push alerts to the phone or desktop. | Runs automatically | All plans | Partly works |
| Sticky notes | Coloured notes on the dashboard: create, edit, recolour and delete. | Everyone | All plans | Works |
| Bookmarks | Star a record and find it later in one list with search, open and remove. | Everyone | All plans | Works |

## Itineraries and templates

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Itinerary list | Searchable list of quotes with status filter, infinite scroll and CSV export. | Everyone | All plans | Works |
| Build an itinerary day by day | Create an itinerary with days, items, prices and a lead picked from a searchable list; apply a rate card price from a picker. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Itinerary detail | View the quote with days, items and costs (cost tab only for roles allowed to see cost). | Everyone | All plans | Works |
| Clone an itinerary | Copy an itinerary to start a similar quote. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Quote versions | Create a new version of a quote and look back at earlier versions. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Quotation PDF | Preview and download a branded quotation PDF. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Send the quote to the customer | Email or WhatsApp the quote through the send dialog; marks the lead Proposal Sent via automation. | Admin, Sales manager, Salesperson, Operations | All plans | Partly works |
| Customer share link | Generate a link to the quote and revoke it again. | Admin, Sales manager, Salesperson, Operations | All plans | Partly works |
| Itinerary templates | Library of reusable itineraries with preview of the day outline; create a template or save one from an existing itinerary. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Create an itinerary from a template | Pick a template and a lead and get a ready itinerary. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Itinerary defaults | Admin sets default terms, inclusions and validity for new quotes. | Admin only | All plans | Works |
| Cost and margin on a quote | Costs tab compares supplier cost with selling price. | Admin, Sales manager | All plans | Partly works |
| Pick prices from rate cards while quoting | The itinerary editor looks up matching supplier rate cards and fills prices. | Admin, Sales manager, Salesperson, Operations | All plans | Works |

## Rate cards and suppliers

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Supplier rate cards | Searchable list of rates by supplier and category with validity dates, bulk delete and export. | Everyone | All plans | Works |
| Add and edit a rate card | Form with supplier picker, currency inputs and date validation. | Admin, Operations | All plans | Works |
| Renewal task before a rate card expires | Automation creates a task a set number of days before validity ends. | Admin only | All plans | Works |
| Supplier directory | Suppliers with category, status and preferred filters, hover actions, bulk delete and export. | Everyone | All plans | Works |
| Add and edit a supplier | Form with phone picker, category and preferred switch. | Admin, Operations | All plans | Works |
| Supplier profile, rates and ledger | Supplier page with rate cards, payments made and a running ledger. | Everyone | All plans | Partly works |
| Rate comparison | Compare rates from several suppliers side by side. | Everyone | All plans | Partly works |
| Record payments to suppliers | Log what has been paid to each supplier and see outstanding amounts. | Admin, Accountant | All plans | Partly works |
| Rate and mark preferred suppliers | Give a supplier a star rating and flag it as preferred. | Admin, Operations | All plans | Works |
| Accounts (suppliers view) | Accounts page that frames the supplier list as payables, with category filter and export. | Everyone | All plans | Works |
| HSN and SAC code library | Pre-loaded searchable tax code list; admin can add custom codes; used on invoice lines. | Admin, Accountant | All plans | Works |

## Invoices and payments

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Invoice list | Searchable list with status filter, hover send action, bulk PDF download and export. | Everyone | All plans | Works |
| Create and edit an invoice | Invoice form with contact and lead pickers, line items, HSN codes and GST; non-draft invoices are locked from editing. | Admin, Sales manager, Accountant | All plans | Works |
| GST calculation | CGST/SGST or IGST worked out from company and customer state. | Admin, Sales manager, Accountant | All plans | Partly works |
| Create an invoice from an itinerary | One action turns an accepted quote into an invoice. | Admin, Sales manager, Accountant | All plans | Partly works |
| Invoice detail with payment history | Totals, balance due, payments applied and notes. | Everyone | All plans | Works |
| Download invoice as PDF or CSV | Generate a PDF or CSV of one invoice in the browser. | Admin, Sales manager, Accountant | All plans | Works |
| Bulk invoice PDFs | Select invoices and download a zip of PDFs prepared by a background job. | Admin, Sales manager, Accountant | All plans | Works |
| Void or duplicate an invoice | Cancel an invoice while keeping the record, or duplicate it. | Admin, Sales manager, Accountant | All plans | Works |
| Send an invoice | Email or WhatsApp the invoice via the send dialog. | Admin, Sales manager, Accountant | All plans | Partly works |
| Invoice defaults and numbering | Admin sets bank details, terms and the numbering pattern and financial-year start. | Admin only | All plans | Works |
| Credit notes | Issue a credit note against an invoice and apply it to reduce the balance. | Admin, Sales manager, Accountant | All plans | Works |
| Debit notes | Issue a debit note that increases the balance due. | Admin, Sales manager, Accountant | All plans | Works |
| Draft a reminder for overdue invoices | Assistant drafts a reminder message for each overdue invoice for a person to send. | Admin, Sales manager, Accountant | All plans | Works |
| Automatic invoice due reminders | Hourly job that reminds about invoices coming due. | Runs automatically | All plans | Broken |
| Record a payment | Record a payment against an invoice or as an advance against a lead; validates amount against balance due. | Admin, Accountant | All plans | Works |
| Payments list and receipts | Searchable payment list with method filter, receipt view, delete (reverses the invoice) and export. | Everyone | All plans | Works |
| Link an advance payment to an invoice | Attach an advance received earlier to an invoice created later. | Admin, Accountant | All plans | Partly works |
| Online payment collection from customers | Customers pay an invoice online by card or UPI. | Runs automatically | All plans | Placeholder |
| Exchange rates | Look up live currency rates for multi-currency quotes. | Everyone | All plans | Partly works |
| Multi-currency display | Show money in the agency currency. | Everyone | All plans | Partly works |

## Vouchers

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Voucher list | Hotel, transport, flight and activity vouchers with filters, bulk send and export. | Everyone | All plans | Works |
| Create and edit a voucher | Typed vouchers (hotel, transport, flight, activity) with lead and supplier pickers; title auto-generated when blank. | Admin, Sales manager, Operations | All plans | Works |
| Voucher status flow | Move draft to sent to confirmed; only drafts can be edited. | Admin, Sales manager, Operations | All plans | Works |
| Voucher in English, Hindi or Arabic | Choose the voucher language. | Admin, Sales manager, Operations | All plans | Partly works |
| Voucher PDF and send | Generate a PDF and send a voucher or several in one go. | Admin, Sales manager, Operations | All plans | Partly works |
| Vouchers from itinerary items | Create a voucher straight from an itinerary item. | Admin, Sales manager, Operations | All plans | Partly works |

## Travellers and visa

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Traveller records | Passport holders linked to contacts with passport expiry tags, search, bulk delete and export. | Everyone | All plans | Works |
| Add and edit a traveller | Form with nationality picker, phone picker and contact link. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Link a traveller to a contact | Connect or disconnect a traveller and a customer contact. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Ask for traveller details after booking | Assistant drafts a message asking the customer for passport details once a booking is confirmed. | Admin, Sales manager, Salesperson | All plans | Works |
| Visa applications | Track each application with status, destination, search, filters, bulk delete and export. | Everyone | All plans | Works |
| Create and edit a visa application | Traveller and destination pickers; new applications start as Not Started. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Visa dashboard | Counts of applications by status and a view of missing documents. | Everyone | All plans | Partly works |
| Visa checklist and documents | Tick off checklist items and upload, download and delete visa documents. | Admin, Sales manager, Salesperson, Operations | All plans | Partly works |
| Passport and visa expiry alerts | Daily alerts for passports and visas about to expire and for missing visa documents. | Runs automatically | All plans | Broken |

## Fleet and driver app

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Fleet dashboard | Tiles for vehicles and drivers, weekly vehicle availability calendar. | Admin, Sales manager, Operations | All plans | Works |
| Vehicles | Vehicle list and detail with search, filters, status change, odometer, bulk delete and export. | Admin, Sales manager, Operations | All plans | Works |
| Vehicle documents with expiry | Upload RC, insurance and permits with expiry dates; expiry tags show days left. | Admin, Operations | All plans | Works |
| Maintenance records | Log service work against a vehicle and see what is due. | Admin, Operations | All plans | Works |
| Drivers | Driver list and detail with licence-expiry badge, status, rating, schedule calendar and trip history. | Admin, Sales manager, Operations | All plans | Works |
| Driver documents with expiry | Upload licence and ID documents with expiry. | Admin, Operations | All plans | Works |
| Rate a driver | Rate a driver after a completed trip; blocked when there is no completed trip. | Admin, Operations | All plans | Works |
| Trip assignments | Create trips with vehicle and driver pickers, double-booking check, status lifecycle with timeline, bulk delete and export. | Admin, Operations | All plans | Works |
| Trip costs | Add fuel, toll and other costs to a trip and see a cost summary. | Admin, Operations | All plans | Partly works |
| Invoice or voucher from a trip | Generate an invoice or a transport voucher straight from a completed trip. | Admin, Operations | All plans | Partly works |
| Fleet rate cards | Per-vehicle-type rates (per km, per day, waiting) with validity dates; used to estimate trip cost. | Admin, Operations | All plans | Works |
| Distance and cost estimate | Estimate distance and cost for a trip from addresses. | Admin, Operations | All plans | Partly works |
| Fleet alerts screen | Expiring vehicle and driver documents and due maintenance, linking to the vehicle or driver. | Admin, Operations | All plans | Works |
| Scheduled fleet alerts | Background job that raises fleet alert notifications every five minutes. | Runs automatically | All plans | Broken |
| Suggest a vehicle and driver for arrivals | For confirmed bookings travelling soon with no transfer, the Assistant picks a free vehicle that fits the group and a free driver and opens the trip form pre-filled. | Admin, Operations | All plans | Works |
| Driver sign-in by phone code | Driver enters a phone number and a one-time code sent by SMS. | Drivers only | All plans | Partly works |
| My trips and trip history | Driver sees assigned trips, opens details with pickup and drop, call and map shortcuts, and past trips. | Drivers only | All plans | Works |
| Accept or reject a trip | Driver accepts or rejects an assigned trip; later steps are blocked until accepted. | Drivers only | All plans | Works |
| Update trip status | Driver moves the trip through en route, started and completed; the office sees the timeline. | Drivers only | All plans | Works |
| Check in and check out with photo and location | Driver checks in at pickup and out at drop with GPS and an optional photo. | Drivers only | All plans | Partly works |
| Driver profile and documents | Driver edits their profile, photo and uploads documents with expiry. | Drivers only | All plans | Works |
| Driver app in English, Hindi and Arabic | App text can be switched between three languages. | Drivers only | All plans | Partly works |
| Driver push notifications | Phone alert when a trip is assigned. | Drivers only | All plans | Placeholder |
| Driver app installation | Download the app from a store or link. | Drivers only | All plans | Placeholder |

## Calls

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Call log | List of calls with direction filter, search, outcome, delete and CSV export. | Admin, Sales manager, Salesperson, Operations | Basic and up | Works |
| Call detail and outcome | Open a call and record the outcome; certain outcomes create a follow-up or close the lead. | Admin, Sales manager, Salesperson, Operations | Basic and up | Works |
| Place a call from the CRM | Dial pad and click-to-call buttons that start an outbound call. | Admin, Sales manager, Salesperson, Operations | Basic and up | Broken |
| Inbound call routing and voicemail | Incoming calls follow business hours, a one-level keypad menu or the assigned agent, with voicemail when nobody answers. | Admin only | Basic and up | Partly works |
| Missed-call handling | A missed inbound call raises a notification, can create a lead for an unknown number, and creates a call-back task through the Assistant. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works |
| Call analytics | Totals, durations and top callers for a date range. | Admin, Sales manager | Basic and up | Works |
| Call recordings | Listen to a recording of a call from the call detail. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works |
| Call transcripts and search | Search the text of transcribed calls. | Admin, Sales manager, Salesperson, Operations | Basic and up | Placeholder |
| AI call summary and extracted leads (uses AI) | After a call, AI writes a summary and pulls out lead details and follow-ups for confirmation. | Admin, Sales manager, Salesperson, Operations | Pro and up | Placeholder |
| VoIP settings | Admin enters provider (Twilio or Plivo) credentials, caller id, recording policy, hours and voicemail, with a connection test. | Admin only | Basic and up | Partly works |
| Phone numbers | Search, buy, set primary and release business numbers. | Admin only | Basic and up | Partly works |
| Caller pop-up on incoming call | Show who is calling when a call arrives. | Admin, Sales manager, Salesperson, Operations | Basic and up | Placeholder |
| Click-to-call buttons | Phone buttons on contacts and leads open the dial page with the number filled in. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works |

## Assistant and automations

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Suggestions queue | A list of ready-made next steps the assistant has prepared. Each shows what it will do and the person clicks Apply or Dismiss; suggestions also appear on the lead, contact or invoice itself. | Admin, Sales manager, Salesperson | All plans | Works |
| Activity log with undo | Every automatic or applied step is recorded, and anything that supports it can be undone with one click. | Admin, Sales manager, Salesperson | All plans | Works |
| Per-automation mode: off, suggest or automatic | Choose for each automation whether it is off, waits for a click, or runs by itself. Only an admin can switch one to automatic, and only low-risk steps that do not message a customer are allowed to. | Admin, Sales manager | All plans | Works |
| Pause all automations | One switch stops every automation for the workspace. | Admin only | All plans | Works |
| Build your own rules | Admin builds up to 50 rules: when something happens, if conditions hold, do these steps. Built from fixed lists so a rule can only do what the assistant is allowed to do; can be edited, switched off and deleted. | Admin only | All plans | Works |
| Safety rails | Duplicate suppression, loop limit (depth 3), failed automatic steps fall back to a suggestion, customers who opted out are never drafted a message. | Runs automatically | All plans | Works |
| Needs-attention box on the dashboard | Dashboard tile that lists the suggestions waiting for a person. | Admin, Sales manager, Salesperson | All plans | Works |
| Suggestion count in the sidebar | The Assistant menu entry shows how many suggestions are waiting. | Admin, Sales manager, Salesperson | All plans | Works |
| Read an incoming message on demand | Run the message reader again on any message to get fresh suggestions. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Daily scheduled automations | Time-based automations (quiet quotes, overdue invoices, expiring rate cards...) run once per workspace per local day from the background timer. | Runs automatically | All plans | Partly works |
| AI reads every incoming message (uses AI) | Classifies each inbound message (new enquiry, payment news, question) and proposes the right step: create lead, update lead, mark won, record payment or draft a reply. Falls back to plain rules when AI is off or out of credits. | Admin, Sales manager, Salesperson | All plans | Works |
| Read every incoming message (uses AI) | The assistant reads each message from a customer and prepares the next step. Trigger: a message arrives. Does: create or update a lead, mark won, record a payment or draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |
| Draft the first reply to a new enquiry | Once an unknown sender becomes a contact and lead, offers the drafted acknowledgement. Trigger: a lead is created. Does: draft a reply for a person to send. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |
| Schedule the first follow-up on every new lead | Adds a follow-up a set number of hours after a lead is created. Trigger: a lead is created. Does: create a follow-up about 24 hours later. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |
| Suggest the best-matching itinerary template | Compares a new lead with your templates and offers to build the itinerary from the closest one. Trigger: a lead is created. Does: create an itinerary from a template. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |
| Move the lead to Proposal Sent when the quote goes out | When a message with the itinerary link is sent, the lead moves forward. Trigger: a message or quote is sent. Does: set status to Proposal Sent. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |
| Follow up after sending a quote | Schedules a follow-up a few days after the quote is sent. Trigger: a message or quote is sent. Does: create a follow-up about 2 days later. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |
| Offer the invoice when a booking is confirmed | When a lead is won and has an itinerary but no invoice, offers to create the invoice. Trigger: a lead changes status to won. Does: create an invoice from the itinerary. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |
| Create the booking checklist when a lead is won | Adds the standard tasks for a confirmed booking: vouchers, traveller documents, transfers and balance payment. Trigger: a lead changes status to won. Does: create four tasks. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Partly works |
| Match a payment the customer already told you about | When an invoice is created and the customer recently wrote that they paid, offers to record it. Trigger: an invoice is created. Does: record a payment. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |
| Draft hotel vouchers once the advance is in | Drafts one voucher per hotel stay in the itinerary after a payment. Trigger: a payment is recorded. Does: create vouchers. Default: asks first (suggest). | Admin, Sales manager, Operations | All plans | Partly works |
| Offer to mark the lead won when the advance arrives | A payment on an open lead is a strong sign the booking is confirmed. Trigger: a payment is recorded. Does: mark the lead won. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |
| Nudge customers who have gone quiet on a quote | For leads in Proposal Sent with no messages for some days, drafts a polite check-in. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |
| Draft a reminder for overdue invoices | Drafts a payment reminder for each invoice past its due date with a balance. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |
| Create a call-back task for every missed call | A missed call becomes a high-priority task for the person the call was routed to. Trigger: a call is missed. Does: create a high-priority task due today. Default: automatic. | Admin, Sales manager, Salesperson, Operations | All plans | Partly works |
| Offer a lead when an unknown number calls and nobody answers | A missed call from an unknown number becomes a one-click suggestion to create the contact and lead. Trigger: a call is missed. Does: create a lead from the enquiry. Default: asks first (suggest). | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| Ask for feedback when a trip is completed | Drafts a thank-you and feedback request for the passenger when the driver completes the trip. Trigger: a trip is completed. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |
| Mark a new lead Contacted when you first reply | The first message sent on a new lead moves it from New to Contacted. Trigger: a message is sent. Does: set status to Contacted. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |
| Flag customer messages left without a reply | A message nobody answered within the set time becomes a high-priority task for the lead owner. Trigger: daily timer. Does: create a high-priority task. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |
| Remind the customer before a quote expires | For quotes close to their validity date with the lead still open, drafts a reminder. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |
| Draft a thank-you when a payment is recorded | Drafts a message confirming the amount received and the balance due. Trigger: a payment is recorded. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Works |
| Chase the balance before departure | For bookings travelling soon with a balance outstanding, drafts a payment reminder. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |
| Ask for traveller details when a booking is confirmed | Drafts a message asking for full names as on ID and the documents needed. Trigger: a lead changes status to won. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |
| Ask for a review after the trip | In the days after a booked trip ends, drafts a welcome-back message asking for a review. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |
| Win back customers who have not travelled for a while | Drafts a check-in for past customers whose last trip was long ago and who have no enquiry open. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |
| Create a renewal task before a rate card expires | Rate cards that stop being valid soon become a task. Trigger: daily timer. Does: create a task. Default: automatic. | Admin, Sales manager, Operations | All plans | Works |
| Line up a vehicle and driver for arrivals | For confirmed bookings travelling soon with no transfer, picks a free vehicle and driver and opens the trip form filled in. Trigger: a lead is won, or daily timer. Does: open a pre-filled trip form. Default: asks first (suggest). | Admin, Sales manager, Operations | All plans | Works |
| Drafted replies open in the send dialog (uses AI) | A drafted reply is never sent by itself: it opens in the send dialog so a person reviews and sends it. AI drafting there falls back cleanly when AI is off. | Admin, Sales manager, Salesperson | All plans | Works |
| AI credits and usage | Plans include monthly AI credits (read 1, understand 5, scan 15, create 60); a Usage tab shows what was used. Out of credits, the assistant falls back to plain rules. | Admin, Sales manager | All plans | Partly works |
| Create a lead from pasted text (uses AI) | Paste a WhatsApp chat, email or note and get a lead filled in; also bulk-parse several enquiries and scan a business card. | Admin, Sales manager, Salesperson | Pro and up | Partly works |
| AI itinerary generator (uses AI) | Describe the trip and get a day-by-day plan that can be saved as a real itinerary; can also enrich an existing one. | Admin, Sales manager, Salesperson, Operations | Pro and up | Partly works |
| AI message composer (uses AI) | Draft an email, SMS or WhatsApp message, then send it only through the Communication Hub. | Admin, Sales manager, Salesperson | Pro and up | Partly works |
| Suggested replies (uses AI) | Offers short reply options to a customer message. | Admin, Sales manager, Salesperson | Pro and up | Partly works |
| AI invoice draft (uses AI) | Draft an invoice from a description. | Admin, Sales manager, Accountant | Pro and up | Partly works |
| Ask your data in plain English (uses AI) | Type a question about the CRM and get an answer drawn from your records. | Admin, Sales manager | Enterprise | Partly works |
| AI insights and recommendations (uses AI) | Trend detection, customer insights and recommended actions with dismiss or act. | Admin, Sales manager | Enterprise | Partly works |
| Lead scoring (uses AI) | A 0 to 100 score for each lead with the reasons, history and recalculate. | Admin, Sales manager, Salesperson | Enterprise | Partly works |
| Scan passports, visas and supplier invoices (uses AI) | Upload a document image and have AI read the fields, then review and apply them to the traveller or supplier. | Admin, Sales manager, Salesperson, Operations | Enterprise | Partly works |
| Smart follow-up suggestions (uses AI) | AI suggests the best time, channel and wording to chase a lead; send or dismiss. | Admin, Sales manager, Salesperson | Enterprise | Partly works |
| Business briefings (uses AI) | Daily, weekly and monthly written briefings about the business. | Admin, Sales manager | Pro and up | Partly works |
| Business health score (uses AI) | A score with category breakdown and trend. | Admin, Sales manager | Pro and up | Partly works |
| Destination profitability and demand (uses AI) | Profitability by destination, trending destinations and seasonal demand. | Admin, Sales manager | Pro and up | Partly works |
| Team performance and workload (uses AI) | Per-person results, workload balance and lead-source return. | Admin, Sales manager | Pro and up | Partly works |
| Customer segments and lifetime value (uses AI) | Recalculate customer segments and look up a customer lifetime value. | Admin, Sales manager | Pro and up | Partly works |
| Cash-flow forecast and revenue pulse (uses AI) | Projected cash flow and revenue for the coming period. | Admin, Sales manager | Pro and up | Partly works |
| AI feature switches and provider status | Admin turns individual AI features on or off within the plan and sees which provider is active. | Admin only | Pro and up | Partly works |
| AI usage page | See AI requests and spend per feature. | Admin only | Pro and up | Works |
| Chatbot conversations (uses AI) | See chatbot conversations, read the transcript, reply, hand off to a person, close and create a lead. | Admin, Sales manager, Salesperson | Enterprise | Partly works |
| Website chat widget and WhatsApp bot (uses AI) | A script tag for the website and a WhatsApp number that the bot answers. | Admin only | Enterprise | Broken |
| Chatbot settings and analytics | Configure the bot per channel and see conversation analytics. | Admin only | Enterprise | Partly works |

## Marketing

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Marketing dashboard | Hub with campaign counts, shortcuts to campaigns, segments, flyers and festivals. | Admin, Sales manager | All plans | Works |
| Campaigns | Create a campaign with channel, template and audience; list with filters, detail with recipients and stats, edit, schedule, cancel, delete and export. | Admin, Sales manager | All plans | Works |
| Send a campaign now | Queue a campaign to its audience by email, SMS or WhatsApp. | Admin, Sales manager | All plans | Partly works |
| Schedule a campaign for later | Pick a date and time; the campaign is sent when due. | Admin, Sales manager | All plans | Broken |
| Earlier campaigns screens (/campaigns) | An older campaign list and wizard that still exists next to the newer marketing campaigns. | Admin, Sales manager | All plans | Partly works |
| Audience segments | Save rules that pick contacts (for example by city or tag), preview matching contacts and refresh the count. | Admin, Sales manager | All plans | Works |
| Flyers | Make a promotional flyer from a template, edit it, upload the artwork and share it to a segment. | Admin, Sales manager | All plans | Works |
| Flyer templates | Template library with assets for flyers. | Admin, Sales manager | All plans | Partly works |
| Brand colours, font and logo | Save the agency brand used on flyers and documents. | Admin, Sales manager | All plans | Works |
| Festival offers | Create a seasonal offer, activate or deactivate it. | Admin, Sales manager | All plans | Partly works |
| Opted-out contacts | List of customers who asked not to be messaged; re-subscribe them; they are excluded from drafts and sends. | Admin, Sales manager | All plans | Works |
| Social post generator (uses AI) | AI writes social posts for a platform, batch-generates a set, and saves them for editing. | Admin, Sales manager | All plans | Partly works |
| AI marketing suggestions (uses AI) | AI proposes campaign ideas that can be accepted or dismissed. | Admin, Sales manager | All plans | Partly works |
| WhatsApp campaigns | Create, send, pause and cancel WhatsApp broadcast campaigns with recipients and analytics. | Admin, Sales manager | Enterprise | Partly works |
| Ask for a review after the trip | Assistant drafts a review request after a trip ends. | Admin, Sales manager | All plans | Works |

## Documents

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Document library | Upload files with a category and a link to a lead or itinerary; search, filter, rename, download, delete and export. | Everyone | All plans | Works |
| Upload from a lead | Opening Documents from a lead pre-fills the lead. | Admin, Sales manager, Salesperson, Operations | All plans | Works |
| File storage | Uploaded files are kept in cloud storage with size limits. | Runs automatically | All plans | Partly works |

## Reports and dashboard

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Dashboard | Landing page with live KPI tiles linking to their source pages, date range selector, Quick Add menu and the needs-attention box. | Everyone | All plans | Works |
| Quick Add menu | Create a lead, contact, invoice or other record from anywhere. | Admin, Sales manager, Salesperson | All plans | Works |
| Command palette and search | Press the shortcut to jump to any screen or create something new by typing. | Everyone | All plans | Partly works |
| Keyboard shortcuts | Press N to create a new item for the current section and other shortcuts listed in Help. | Everyone | All plans | Partly works |
| Reports hub | Nine report categories (sales, leads, financial, team, customer, visa, supplier, fleet, marketing) with search, favourites and recently viewed. | Admin, Sales manager, Accountant, View only | All plans | Works |
| About 50 built-in reports | Revenue summary, collections, ageing, P&L by lead, pipeline, lead velocity, win/loss, sales by destination or salesperson, forecast, supplier usage, visa success rate, fleet utilisation and more. | Admin, Sales manager, Accountant, View only | All plans | Works |
| Date range and compare | Change the period and compare with the previous one. | Admin, Sales manager, Accountant, View only | All plans | Works |
| Export a report to Excel or PDF | Download any report as a spreadsheet; financial reports also as PDF. | Admin, Sales manager, Accountant | All plans | Partly works |
| Outstanding and ageing receivables | What customers owe, bucketed by age. | Admin, Accountant | All plans | Works |
| Report caching | Reports are cached briefly and can be refreshed. | Runs automatically | All plans | Works |

## Import and export

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Import wizard | Choose what to import (contacts, leads, suppliers, rate cards, travellers), upload, map columns, preview, handle duplicates and run. | Admin only | All plans | Works |
| Download an import template | Get an Excel template for each import type. | Admin only | All plans | Works |
| Skip or update duplicates on import | Re-importing the same file can skip existing records or update them. | Admin only | All plans | Works |
| Import history and error report | List past imports with status, download the error file, cancel a pending one. | Admin only | All plans | Works |
| Export any list to CSV | Almost every list screen has an Export button that downloads a CSV of what is shown. | Everyone | All plans | Works |
| Export contacts and leads to Excel | Choose CSV or Excel for contacts and leads. | Admin, Sales manager | All plans | Works |
| Full data export | Download a zip of the main tables (contacts, leads, invoices and more) prepared by a background job. | Admin only | All plans | Partly works |

## Settings and team

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Sign in with email and password | Two-step sign in: email resolves the workspace, then password. Sessions refresh automatically. | Everyone | All plans | Partly works |
| Sign in with a phone code | Alternative login with an SMS code. | Everyone | All plans | Partly works |
| Forgot and reset password | Email link to reset a password. | Everyone | All plans | Partly works |
| Active sessions and login history | See devices signed in, sign one out, see recent logins. | Everyone | All plans | Works |
| Team members | Admin invites people, edits roles, deactivates, reactivates and unlocks accounts. | Admin only | All plans | Works |
| Invite email and first-time setup | The invited person receives a link to set a password. | Admin only | All plans | Partly works |
| Six roles with fixed permissions | Admin, sales manager, salesperson, operations, accountant and view-only, each with set rights per area. No custom roles. | Admin only | All plans | Works |
| Seat limit per plan | Block invites past the plan user limit. | Admin only | All plans | Placeholder |
| Settings hub | One page linking every configuration area. | Admin only | All plans | Works |
| Company profile and logo | Agency name, address, tax ids, regional settings and logo. | Admin only | All plans | Works |
| My profile | Edit your own details and photo. | Everyone | All plans | Works |
| Change password while signed in | Change your password from your profile. | Everyone | All plans | Placeholder |
| Custom fields | Admin defines extra contact fields. | Admin only | All plans | Works |
| Activity log (audit trail) | Admin sees who changed what. | Admin only | All plans | Partly works |
| Document numbering | Prefixes, financial-year start and format for invoices, vouchers and so on. | Admin only | All plans | Works |
| Integrations page | Lists the live webhook addresses, website-form keys and receiving addresses. | Admin only | All plans | Works |
| Interface language | Switch the desktop interface language. | Everyone | All plans | Placeholder |
| Onboarding wizard | First-run wizard for company, regional settings and branding. | Admin only | All plans | Partly works |
| Help centre | Searchable FAQ and shortcut list inside the app. | Everyone | All plans | Works |
| Desktop application | Install the product as an Electron app on Windows, Mac or Linux. | Everyone | All plans | Partly works |

## Super admin console

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Super admin sign-in | Platform owner signs in with email and password; five failures per address lock it out for 15 minutes. | Platform owner only | All plans | Partly works |
| Platform dashboard | Tenant counts, revenue, growth charts, top tenants and recent activity from live queries. | Platform owner only | All plans | Partly works |
| Agencies list and detail | Search, filter and open each agency; see plan, status, usage and users. | Platform owner only | All plans | Partly works |
| Create a new agency | Five-step wizard that creates the agency record, its admin entry, a subscription and (with Cloudflare keys) a database. | Platform owner only | All plans | Broken |
| Suspend, reactivate and delete an agency | Block or restore an agency; delete is a soft flag. | Platform owner only | All plans | Partly works |
| Change an agency plan | Move an agency to another plan. | Platform owner only | All plans | Partly works |
| Per-agency feature switches and usage caps | Turn individual features on or off for one agency and set usage caps. | Platform owner only | All plans | Partly works |
| Subscriptions and manual payments | List subscriptions, record a payment received and cancel. | Platform owner only | All plans | Partly works |
| Online billing for agencies | Agencies pay for their plan by card or UPI and renew automatically. | Platform owner only | All plans | Placeholder |
| Announcements to agencies | Create platform announcements. | Platform owner only | All plans | Placeholder |
| Support tickets | View and reply to support tickets. | Platform owner only | All plans | Placeholder |
| Platform audit log | See changes made by the platform owner. | Platform owner only | All plans | Partly works |
| System health | Pings of the platform services. | Platform owner only | All plans | Partly works |
| Platform reports | Feature usage, geographic distribution and platform summary. | Platform owner only | All plans | Partly works |
| SEO page | SEO tools page. | Platform owner only | All plans | Placeholder |
| Sign in as an agency to help them | Open an agency account as support. | Platform owner only | All plans | Placeholder |
| Read-only platform pages inside the desktop app | Platform owner sees tenants, users, plans, billing, audit, config and system pages from the desktop app; other users see an explanation. | Platform owner only | All plans | Partly works |

## Landing page

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Marketing page | Single static page with hero, pipeline and proposal showcases, call/message section, AI section, pricing, reviews, FAQ and footer. | Runs automatically | All plans | Works |
| Pricing section | Three plans shown per user per month (USD 12 / 29 / 49). | Runs automatically | All plans | Partly works |
| Start free trial buttons | Call-to-action buttons to start a trial. | Runs automatically | All plans | Placeholder |
| Privacy, Terms and legal pages | Footer links to legal pages. | Runs automatically | All plans | Placeholder |
| Customer reviews section | Reviews from agencies. | Runs automatically | All plans | Partly works |
| Contact email | Contact link to hello@travelcrm.pro. | Runs automatically | All plans | Works |
| Landing page hosting | Publishing the page at a public address. | Runs automatically | All plans | Partly works |

## Agency websites (WordPress)

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Site host service | A small server that creates, stops, starts, destroys and checks one WordPress plus database pair per agency behind a reverse proxy. | Runs automatically | All plans | Partly works |
| WordPress hosting server | One Oracle Cloud ARM virtual machine with Docker and Caddy. | Runs automatically | All plans | Partly works |
| Websites page in the console | Platform owner lists sites and asks for one to be provisioned. | Platform owner only | All plans | Partly works |
| One-click site creation | Creating the row builds the live site and emails the login. | Platform owner only | All plans | Placeholder |
| Travel site template | A ready travel theme and demo content for each new site. | Platform owner only | All plans | Partly works |

## Platform services

| Feature | What it does | Who can use it | Plan | Status |
|---|---|---|---|---|
| Separate database per agency | Each agency has its own database so data never mixes. | Runs automatically | All plans | Broken |
| Production deployment | Deploy the server to Cloudflare. | Runs automatically | All plans | Broken |
| Browser access (CORS) | Allow the web apps to call the server. | Runs automatically | All plans | Partly works |
| Server API (about 60 route groups) | Versioned REST API under /api/v1 and /api with consistent responses, validation on most routes and role checks per area. | Runs automatically | All plans | Partly works |
| Role permission checks | Every route checks the six-role matrix; the desktop reads it to hide what a role cannot do. | Runs automatically | All plans | Partly works |
| Background queues | Email, SMS, push, import, export, campaign and site-provision queues. | Runs automatically | All plans | Partly works |
| Scheduled jobs | A five-minute timer runs reminders, alerts, campaign scheduler, overdue tasks, assistant schedule and cap resets. | Runs automatically | All plans | Partly works |
| Monitoring and logging | Error tracking and metrics. | Runs automatically | All plans | Placeholder |
| Test-mode routes | Routes for seeding and simulating inbound messages in tests. | Runs automatically | All plans | Partly works |
| Privacy and data-protection tools | Consent records, erasure, two-factor sign-in and data residency choice. | Runs automatically | All plans | Placeholder |
| Selling outside India | Tax types, currencies, languages and phone formats for other countries. | Runs automatically | All plans | Partly works |

## Plan comparison

This table follows the server (the plan list in the backend feature gate). **The plan definitions currently disagree across the product**: the server knows trial, starter, basic, pro and enterprise; the super admin console offers free, starter, pro and enterprise with different prices and user limits; the landing page shows Starter, Professional and Enterprise at per-user monthly prices. Treat prices and names as undecided. See the launch findings (finding 02) for the full list.

Only these groups are actually blocked by plan in the server today; everything else in the lists is open to every plan even where the plan list names it (fleet, visa, supplier, bulk messaging, flyers, advanced reports, API access, custom domain, white label are listed per plan but no code enforces them).

| Feature group | Basic | Pro | Enterprise | Enforced? |
|---|:-:|:-:|:-:|---|
| Core CRM (contacts, leads, itineraries, invoices, payments, vouchers, tasks, reports, import/export, Assistant and automations) | Yes | Yes | Yes | Not gated |
| Fleet and driver app | Yes | Yes | Yes | Listed, not enforced |
| Visa, suppliers, bulk SMS and email | Yes | Yes | Yes | Listed, not enforced (starter has them too) |
| Flyers and marketing | Yes | Yes | Yes | Listed, not enforced |
| Calls and VoIP settings | Yes | Yes | Yes | Enforced (not on starter) |
| Bulk WhatsApp | No | Yes | Yes | Listed, not enforced |
| Advanced reports | No | Yes | Yes | Listed, not enforced |
| AI tools: message composer, lead extraction, itinerary generator, briefings and business intelligence, call extractions | No | Yes | Yes | Enforced |
| The 8 Pro AI feature switches (copilot, call summary, lead scoring, compose, itinerary, cost estimate, OCR, search) | No | Yes | Yes | Switches only, not checked by routes |
| AI intelligence: ask your data, insights, lead scoring, document OCR, smart follow-ups | No | No | Yes | Enforced |
| Chatbot | No | No | Yes | Enforced |
| WhatsApp campaigns | No | No | Yes | Enforced |
| The 14 Enterprise AI feature switches, API access, custom domain, white label, priority support | No | No | Yes | Switches/listed only |
| Monthly AI credits (read 1, understand 5, scan 15, create 60) | 1,000 | 15,000 | 25,000 | Enforced for routed AI calls; trial 2,000, starter 1,000 |

The landing page and super admin console also state prices and user limits (for example 5 / 15 / 100 users and INR 12,000 / 18,000 / 24,000 a year in the admin API); none of that is enforced: seat limits are not checked and trials never expire.

## Not finished yet

155 features are not fully working: 11 broken, 20 placeholders, 124 partly working. Broken first, then placeholders, then partial.

### Broken (11)

| Area | Feature | Why |
|---|---|---|
| Follow-ups and tasks | Follow-up reminders | checkFollowUpReminders reads a table called workspaces that exists in no migration, so it finds no workspaces and sends nothing (code re-read this session). |
| Follow-ups and tasks | Overdue task notifications | cron/overdue-tasks.ts looks for a database binding called DB or TENANT_DB, which is not bound in wrangler.toml, so it logs an error and does nothing. |
| Invoices and payments | Automatic invoice due reminders | checkInvoiceReminders (cron/auto-reminders.ts) reads the non-existent workspaces table, so it never runs for any tenant. |
| Travellers and visa | Passport and visa expiry alerts | checkVisaPassportExpiry and checkMissingVisaDocuments read the non-existent workspaces table, so they never alert anyone. |
| Fleet and driver app | Scheduled fleet alerts | cron/fleet-alerts.ts selects tenants.is_active, a column that does not exist, so it fails every run. |
| Calls | Place a call from the CRM | The call row is created and the log screen works, but no audio path exists: the outbound markup dials only the customer and never the agent, and no desktop or mobile client has a softphone. A real two-way call cannot happen (finding 03; TwiML re-read this session). The dial page also drops the lead id. |
| Assistant and automations | Website chat widget and WhatsApp bot | /chatbot/widget.js, /chatbot/webhook/:channel and /chatbot/whatsapp/incoming are mounted behind authentication and the plan gate, so an anonymous visitor or provider gets 401 (index.ts, re-checked). |
| Marketing | Schedule a campaign for later | Scheduling saves and shows in the UI (e2e), but the scheduler job needs a database binding named DB or TENANT_DB that is not bound, so due campaigns are never picked up. |
| Super admin console | Create a new agency | A created agency admin cannot sign in: the password hash is computed and discarded and no user row is made in any agency database; without Cloudflare keys the database id is simulated (finding 02; provision route re-read: it writes only to master tables). |
| Platform services | Separate database per agency | wrangler.toml binds only the master database and the server falls back to it, so every agency shares tables; only 22 of 103 tables carry a tenant id; users, contacts, leads, invoices, settings have none (finding 02; wrangler.toml and tenant-db.ts re-read). |
| Platform services | Production deployment | The production environment block declares only a name, so a production deploy would ship without database, storage or queue bindings; no CI step runs migrations (finding 02). |

### Placeholders (20)

| Area | Feature | Why |
|---|---|---|
| Enquiries and inbox | Public unsubscribe link | Opt-out exists only as an authenticated list screen; no public unsubscribe endpoint exists (finding 02). |
| Invoices and payments | Online payment collection from customers | No payment gateway code exists; only a payment_link column and a UPI id setting. Payments are recorded manually (finding 02). |
| Fleet and driver app | Driver push notifications | Backend stores push tokens (tested), but the app has no push SDK and no code registers a token or receives a message. |
| Fleet and driver app | Driver app installation | No store listing or download link exists anywhere (finding 02); landing buttons are href="#". |
| Calls | Call transcripts and search | Search over stored transcripts works (e2e), but nothing ever queues a transcription job, so transcripts only exist if inserted by hand. AI_EXTRACTION_QUEUE is not bound. |
| Calls | AI call summary and extracted leads | Review screens and API work, but no code produces extractions from a call. It also calls Anthropic directly without using AI credits. |
| Calls | Caller pop-up on incoming call | A caller-info endpoint exists but nothing in the desktop calls it and no call event is broadcast to the app (finding 03). |
| Settings and team | Seat limit per plan | max_users is stored but the invite code has no check (finding 02). |
| Settings and team | Change password while signed in | There is deliberately no change-password form; the spec asserts none exists because the backend has no endpoint. |
| Settings and team | Interface language | A language switcher and 343 English/Hindi strings exist but no page uses them; Arabic has 53 strings and there is no right-to-left layout (finding 02). |
| Super admin console | Online billing for agencies | Only a Razorpay webhook receiver exists; it is not public in the middleware (would redirect to login) and skips signature checks when the secret is missing. No Stripe. Nothing can bill a non-Indian agency (finding 02). |
| Super admin console | Announcements to agencies | Rows are saved but no agency app code reads them, so agencies never see them. |
| Super admin console | Support tickets | CRUD on master tables, but the agency apps have no way to file a ticket. |
| Super admin console | SEO page | Mock data only (seo/page.tsx) and not in the console menu. |
| Super admin console | Sign in as an agency to help them | Not present anywhere in the console. |
| Landing page | Start free trial buttons | Every Start Free Trial, Watch Demo and WhatsApp Us link is href="#"; there is no sign-up flow. |
| Landing page | Privacy, Terms and legal pages | Privacy, Terms, GDPR, About, Blog, Careers, Integrations and API Docs links are href="#" (finding 02). |
| Agency websites (WordPress) | One-click site creation | The console route has the queue send commented out, and the queue handler only logs "stub"; the provisioner is never called (finding 02/03; both files re-read). |
| Platform services | Monitoring and logging | Only console logging; no error tracking or metrics, and /health returns a fixed "connected". |
| Platform services | Privacy and data-protection tools | None exist (finding 02): no consent records, no erasure, no 2FA; provider secrets are stored in plain text. |

### Partly working (124)

| Area | Feature | Why |
|---|---|---|
| Enquiries and inbox | Customer WhatsApp and SMS arrive in the inbox | Route and ingest code exist with unit tests (inbound-gateway.test.ts) and the e2e suite checks the receivers reject bad payloads, but it has not been run against a live Twilio number here and the code is new and uncommitted. |
| Enquiries and inbox | Plivo WhatsApp and SMS inbound | Route shares the ingest code; no spec exercises the Plivo signature path. Not verified. |
| Enquiries and inbox | Customer emails arrive in the inbox | Uses SendGrid Inbound Parse with a secret in the URL. Unit-tested only; not verified against live SendGrid. |
| Enquiries and inbox | Website-form API keys | Works end to end, but keys are stored in plain text in the master database (finding 02). |
| Enquiries and inbox | Map agency numbers and mailboxes to the workspace | UI and API work, but buying a number in VoIP settings does not register it here automatically (finding 03). |
| Enquiries and inbox | Compose a message | Screen and API verified in e2e; real delivery needs the platform Twilio and SendGrid keys, which this session did not exercise. |
| Enquiries and inbox | Bulk send to many contacts | Sending is wired, but the progress endpoint is a stub: GET /communications/bulk-send/:batchId/status always returns total 0 (seen in code and flagged in the e2e spec). |
| Enquiries and inbox | Send a stored document by message | Endpoint exists (POST /communications/send-document); no spec covers it. Not verified. |
| Enquiries and inbox | Delivery and open tracking | Handlers now search every workspace for the message id (unit-tested in delivery-callbacks.test.ts), but both endpoints are public and unsigned. |
| Enquiries and inbox | Live updates | Works in tests, but the websocket token is passed in the query string and behaviour after Durable Object hibernation is not verified (finding 03). |
| Contacts | Tags and bulk tag | Tag list and bulk-tag endpoints exist; no spec covers bulk tagging itself. Not verified end to end. |
| Contacts | Birthdays and anniversaries | Dates and the upcoming-occasions list work (e2e). The reminder job that should message customers on the day is part of the broken reminder cron (queries a table that does not exist). |
| Leads and pipeline | Pipeline board | Board component and toggle exist in the page; the e2e spec covers the table view and status change from the detail page, not dragging on the board. Not verified. |
| Leads and pipeline | Record why a lead was lost | Dialog and reason field are wired; no spec specifically exercises it. Not verified. |
| Leads and pipeline | Bulk status change and bulk delete | Endpoints are tested through the API in e2e ("client-only actions"); the list screen exposes bulk selection for delete/assign but a visible bulk status control was not verified. |
| Follow-ups and tasks | Notification preferences and quiet hours | Page and API exist; no spec covers preferences. Not verified. |
| Follow-ups and tasks | Push notifications | Token registration is tested for drivers; the send queue uses the legacy FCM endpoint and the driver app has no push SDK, so nothing receives them. NOTIFICATION_QUEUE is unbound. |
| Itineraries and templates | Send the quote to the customer | Flow verified in e2e (placeholders resolved, company name filled); delivery needs platform provider keys. |
| Itineraries and templates | Customer share link | Create and revoke work in the app (e2e). The link points to quotes.travelcrm.pro/q/<token>, but no page in this repo serves that address, and the public JSON route looks up TENANT_DB_<tenant>, which is not bound, so the customer view cannot load today. |
| Itineraries and templates | Cost and margin on a quote | Tab is gated by a role check in the page; margin maths not covered by a spec. Not verified. |
| Rate cards and suppliers | Supplier profile, rates and ledger | Detail and edit are covered by e2e; the payments and ledger endpoints have no spec. |
| Rate cards and suppliers | Rate comparison | Filmed in the walkthrough but no dedicated e2e spec; not verified in this audit. |
| Rate cards and suppliers | Record payments to suppliers | Supplier page records payments and shows the ledger and the API is wired, but no spec covers it. Not verified end to end. |
| Invoices and payments | GST calculation | Works for India only. The tax_system setting (GST, VAT, sales tax, none) is stored but ignored, so every invoice is computed as GST (finding 02). |
| Invoices and payments | Create an invoice from an itinerary | Endpoint is wired and the Assistant uses it; no e2e spec drives the button. Not verified in the UI. |
| Invoices and payments | Send an invoice | Dialog verified in e2e; real delivery needs platform keys. |
| Invoices and payments | Link an advance payment to an invoice | Backend tested; no UI control found for it in the payments screens. Not verified. |
| Invoices and payments | Exchange rates | Live lookup with INR-only fallbacks; rates are not stored and no screen uses them (no desktop reference found). |
| Invoices and payments | Multi-currency display | A currency setting exists, but desktop formatting defaults to INR and en-IN in 73 places and backend text hardcodes the rupee sign (finding 02). |
| Vouchers | Voucher in English, Hindi or Arabic | Language selector is verified; whether Hindi/Arabic output renders correctly in the PDF was not verified. |
| Vouchers | Voucher PDF and send | Endpoints (pdf, send, bulk-send) are tested in the backend suite; real delivery not exercised. |
| Vouchers | Vouchers from itinerary items | Backend-tested; no UI spec. Not verified in the UI. |
| Travellers and visa | Visa dashboard | Page and API exist; no spec covers the dashboard. Not verified. |
| Travellers and visa | Visa checklist and documents | Backend-tested; the e2e spec focuses on application CRUD. Document files are served without a per-tenant check (finding 02). |
| Fleet and driver app | Trip costs | Add-cost dialog exists on the trip page and the e2e suite fixed a focus bug in it, but no spec asserts saved costs. Not verified. |
| Fleet and driver app | Invoice or voucher from a trip | Button and endpoint exist; no spec covers them. Not verified. |
| Fleet and driver app | Distance and cost estimate | Calculator uses straight-line distance and an optional Google Maps call; accuracy against real roads not verified. |
| Fleet and driver app | Driver sign-in by phone code | API rejection paths and token flow are tested (driver-app-api.spec, driver_app tests); a real code needs Twilio Verify. The app is compiled for one tenant at a time (TENANT_ID dart-define) and the phone picker offers only +91, +971, +966, +1. |
| Fleet and driver app | Check in and check out with photo and location | API flow tested end to end; on-device GPS and camera were not run (the smoke integration test was not run, no emulator). |
| Fleet and driver app | Driver app in English, Hindi and Arabic | Translation files exist; right-to-left layout was not verified. |
| Calls | Inbound call routing and voicemail | Voicemail, hours and menu markup exist and callbacks are unit-tested now (voip-callbacks.test.ts). Agent-ringing targets a browser client that nothing registers, and the default routing strategy sends unknown callers to voicemail. |
| Calls | Missed-call handling | The only call event that feeds the automation engine. Rewritten recently with tests; the notification insert used columns that the notifications table lacks when last read and has not been re-run live. |
| Calls | Call recordings | Provider recording URL is stored and shown; recordings stay at the provider (no copy to storage, retention not enforced). |
| Calls | VoIP settings | Form, masking and test-connection are verified; credentials are stored in plain text, and the form lacks the API key and TwiML app fields that browser calling needs. |
| Calls | Phone numbers | Search and purchase are wired (Twilio local numbers only). Deleting a number removes only the database row and does not release it at the provider, so billing continues; a bought number is not registered for inbound. |
| Calls | Click-to-call buttons | Opens the dial page (verified); see Place a call for why no audio happens. |
| Assistant and automations | Read an incoming message on demand | Endpoint exists and shares the tested analyser; no spec drives it directly. |
| Assistant and automations | Daily scheduled automations | Logic is unit-tested and dedupes per day. It runs inside the 5-minute cron, which loops over all workspaces in one run, and the same timer resets usage caps on every tick (bug). |
| Assistant and automations | Draft the first reply to a new enquiry | Shown in the assistant video; no dedicated test names this recipe. Not verified in isolation. |
| Assistant and automations | Suggest the best-matching itinerary template | Shown in the assistant video; matching quality is not covered by a named test. |
| Assistant and automations | Offer the invoice when a booking is confirmed | Shown in the assistant video; no named test for the recipe itself. |
| Assistant and automations | Create the booking checklist when a lead is won | Shown in the assistant video; no named test for the recipe itself. |
| Assistant and automations | Match a payment the customer already told you about | Shown in the assistant video; no named test for the recipe itself. |
| Assistant and automations | Draft hotel vouchers once the advance is in | Shown in the assistant video; no named test for the recipe itself. |
| Assistant and automations | Offer to mark the lead won when the advance arrives | No named test and not on camera; logic read, not verified. |
| Assistant and automations | Draft a reminder for overdue invoices | No named test; logic read, not verified. |
| Assistant and automations | Create a call-back task for every missed call | Only works if calls reach the system; inbound calling cannot carry audio (see Calls). No named test for this recipe. |
| Assistant and automations | Ask for feedback when a trip is completed | No named test; logic read, not verified. |
| Assistant and automations | Remind the customer before a quote expires | No named test; logic read, not verified. |
| Assistant and automations | Chase the balance before departure | No named test; logic read, not verified. |
| Assistant and automations | AI credits and usage | Metering works for router calls; call extraction bypasses it (calls Anthropic directly) and scheduler resets usage caps on every five-minute tick. |
| Assistant and automations | Create a lead from pasted text | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | AI itinerary generator | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | AI message composer | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | Suggested replies | Endpoint exists (POST /ai/suggest-replies); no spec drives it. Not verified. |
| Assistant and automations | AI invoice draft | Endpoint exists (POST /ai/generate-invoice); no UI page found and no spec. Not verified. |
| Assistant and automations | Ask your data in plain English | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. Backend route sits under /ai/intelligence, so it needs the Enterprise-only ai_intelligence gate even though the desktop gate checks differently. |
| Assistant and automations | AI insights and recommendations | Page and API exist; e2e skipped 14 tests because the demo plan lacks ai_intelligence, so only the gate state was verified. |
| Assistant and automations | Lead scoring | Page and API exist; e2e skipped because the demo plan lacks ai_intelligence. |
| Assistant and automations | Scan passports, visas and supplier invoices | Page and API exist; e2e skipped because the demo plan lacks ai_intelligence. |
| Assistant and automations | Smart follow-up suggestions | Page and API exist; e2e skipped because the demo plan lacks ai_intelligence. |
| Assistant and automations | Business briefings | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | Business health score | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | Destination profitability and demand | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | Team performance and workload | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | Customer segments and lifetime value | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |
| Assistant and automations | Cash-flow forecast and revenue pulse | Endpoints exist (cash-flow-forecast, revenue-pulse); no screen link or spec found. Not verified. |
| Assistant and automations | AI feature switches and provider status | Switches save and are limited to the plan, but the 22 per-feature keys are only stored toggles: no route checks them. Only four coarse gates (ai_assistant, ai_extraction, ai_intelligence, ai_chatbot) are enforced. |
| Assistant and automations | Chatbot conversations | Admin screens and API work, but the e2e suite skipped 8 tests because the demo plan lacks ai_chatbot. The public webhook and widget routes sit behind login so the public widget cannot work (finding 02). |
| Assistant and automations | Chatbot settings and analytics | Pages exist; e2e skipped for plan. |
| Marketing | Send a campaign now | Sending moves the campaign out of draft (e2e), but the queue worker looks for a TENANT_DB_<tenantId> binding that wrangler.toml does not declare and returns without sending. Not verified to deliver. |
| Marketing | Earlier campaigns screens (/campaigns) | Duplicate of the marketing campaigns feature. Search and type filters are sent to the API but the backend ignores them (flagged in the e2e spec). |
| Marketing | Flyer templates | Pages and API exist and the flyer spec uses templates; template create/edit has no dedicated spec. |
| Marketing | Festival offers | Filmed and wired, but no e2e spec and nothing was found that sends an activated offer to customers. Not verified. |
| Marketing | Social post generator | Posts can only be created by AI; e2e skipped 8 tests because the test stack has no AI provider (503), so only the honest failure state was verified. |
| Marketing | AI marketing suggestions | Endpoints exist; no desktop page links to them and no spec covers them. Not verified. |
| Marketing | WhatsApp campaigns | Screens, API and a full lifecycle spec exist, but sending uses the platform Twilio WhatsApp sender and the queue worker was not shown to deliver. No Meta WhatsApp Cloud API. |
| Documents | File storage | Upload works, but GET and DELETE /files/* accept any key with no tenant or role check, so one agency could read or delete another agency files (finding 02). |
| Reports and dashboard | Command palette and search | Present and mounted; lists screens and quick-create actions (it does not search records). No spec drives it. |
| Reports and dashboard | Keyboard shortcuts | Provider mounted; no spec verifies the shortcuts. |
| Reports and dashboard | Export a report to Excel or PDF | Downloads verified; the Excel export hardcodes the rupee sign (finding 02). |
| Import and export | Full data export | Works (e2e) but covers only 7 tables, not everything; the exports route has no role check (finding 02). |
| Settings and team | Sign in with email and password | Works. Login brute-force limits are effectively off (1000 tries per 15 minutes, lockout at 50), tokens cannot be revoked for 15 minutes and there is no two-factor sign-in (finding 02). |
| Settings and team | Sign in with a phone code | Screen reaches the verify step (e2e); a real code needs Twilio Verify. |
| Settings and team | Forgot and reset password | Form and pages work; the link host is hardcoded to app.travelcrm.pro (finding 02). |
| Settings and team | Invite email and first-time setup | The invite returns a link and a set-up page exists, but no email is sent and the link host is hardcoded (finding 02). |
| Settings and team | Activity log (audit trail) | Page and API exist; not covered by a spec. Not verified. |
| Settings and team | Onboarding wizard | Wizard exists but nothing links to it and its logo button shows a "coming soon" message. |
| Settings and team | Desktop application | Runs in development. The packaged build loads a built HTML file and falls back to localhost:3000, no server is started, API address is fixed at build time, publish target is a placeholder, no auto-updater (finding 02). |
| Super admin console | Super admin sign-in | Works, but a hardcoded fallback JWT secret exists, any path containing a dot skips the check, and the first-account seed endpoint is unauthenticated with fallback credentials in code (finding 02). |
| Super admin console | Platform dashboard | Real queries (finding 02) but the console has no automated test in this repo; not run here. |
| Super admin console | Agencies list and detail | Real queries; owner email column is always blank because the provision step never saves it. |
| Super admin console | Suspend, reactivate and delete an agency | Works on the registry, but suspension can lag 5 minutes (cache), soft delete sets cancelled which the server does not block, and nothing cleans up databases or files. |
| Super admin console | Change an agency plan | Writes the plan, but the console plan names (free, starter, pro, enterprise) disagree with the server (trial, starter, basic, pro, enterprise); "free" falls back to trial features. |
| Super admin console | Per-agency feature switches and usage caps | Overrides are honoured by the server gate; usage caps reset on every five-minute tick (bug) and voip minutes are never checked. |
| Super admin console | Subscriptions and manual payments | Manual only. No checkout; trials never expire and nothing sets status expired. No invoices are sent to agencies. |
| Super admin console | Platform audit log | Only plan and feature changes write entries; provision, suspend, reactivate and delete do not. |
| Super admin console | System health | Real pings in the console, but the backend /health reports database connected without checking. |
| Super admin console | Platform reports | Real queries; not run here. |
| Super admin console | Read-only platform pages inside the desktop app | Read-only (the backend admin routes are GET only). Needs a platform owner login to verify; 8 e2e tests were skipped for lack of one. |
| Landing page | Pricing section | Names and prices disagree with the server and the console plans; not a billing source of truth. |
| Landing page | Customer reviews section | Content is written copy, not verified customer quotes; confirm before publishing. |
| Landing page | Landing page hosting | The file exists; whether it is deployed anywhere was not determined from code. |
| Agency websites (WordPress) | Site host service | Real code (deploy/stop/start/destroy/status endpoints, WP-CLI setup, default 50 sites) but nothing in the platform calls it and it was not run here. |
| Agency websites (WordPress) | WordPress hosting server | Terraform and cloud-init exist; not applied or verified here. It hosts websites, not phone calls. |
| Agency websites (WordPress) | Websites page in the console | Lists rows and inserts a queued row. |
| Agency websites (WordPress) | Travel site template | Template name travel-starter is passed; WP-CLI setup exists in the provisioner but what theme and plugins it installs was not verified. |
| Platform services | Browser access (CORS) | Allows localhost and any pages.dev origin; no production domain (finding 02). |
| Platform services | Server API (about 60 route groups) | Zod validation is missing on 22 route files (tasks, planner, documents, files, reports, exports...). |
| Platform services | Role permission checks | Exports route has no role check; files route has none. |
| Platform services | Background queues | Import, export and campaign have retries and dead-letter queues; AI extraction and notification queues are not bound; the SMS queue looks up the database by contact id. |
| Platform services | Scheduled jobs | Only the assistant schedule works; reminders, birthday, invoice, visa, trip, fleet alert, overdue-task and campaign-scheduler jobs are broken (see their features). |
| Platform services | Test-mode routes | Guarded only by TEST_MODE=true, which also bypasses provider signature and OTP checks; must never be on in production. |
| Platform services | Selling outside India | Money, dates, phone and tax are India-first throughout; VAT and sales tax are not computed; desktop is English only. |

## Appendix: where each feature lives in the code

| Feature id | Evidence | Route |
|---|---|---|
| inbox.whatsapp-sms-inbound | backend/src/routes/inbound.ts; backend/src/services/inbound/ingest.ts; backend/test/inbound-gateway.test.ts; desktop/e2e/webhooks-integrations.spec.ts | /api/webhooks/inbound/twilio/message |
| inbox.plivo-inbound | backend/src/routes/inbound.ts | /api/webhooks/inbound/plivo/message |
| inbox.email-inbound | backend/src/routes/inbound.ts; backend/src/services/inbound/ingest.ts | /api/webhooks/inbound/email/:secret |
| inbox.web-form | backend/src/routes/inbound.ts; backend/src/routes/webhook.ts; desktop/e2e/webhooks-integrations.spec.ts; backend/test/inbound-gateway.test.ts | /api/webhooks/inbound/web-form |
| inbox.lead-webhook | backend/src/routes/webhook.ts; desktop/e2e/webhooks-integrations.spec.ts | /api/leads/webhook |
| inbox.api-keys | desktop/src/app/(app)/settings/integrations/page.tsx; backend/src/routes/integrations.ts; desktop/e2e/webhooks-integrations.spec.ts | /settings/integrations |
| inbox.receiving-addresses | desktop/src/app/(app)/settings/integrations/page.tsx; backend/src/routes/integrations.ts; backend/test/integrations-settings.test.ts | /settings/integrations |
| inbox.list | desktop/src/app/(app)/communication/page.tsx; backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /communication |
| inbox.thread | desktop/src/app/(app)/communication/[contactId]/page.tsx; desktop/e2e/communication-inbox.spec.ts | /communication/:contactId |
| inbox.compose | desktop/src/app/(app)/communication/compose/page.tsx; backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /communication/compose |
| inbox.send-dialog | desktop/src/components/communication/send-message-dialog.tsx; backend/src/routes/communications.ts; desktop/e2e/contacts.spec.ts; desktop/e2e/leads.spec.ts; desktop/e2e/invoices.spec.ts |  |
| inbox.bulk-send | desktop/src/app/(app)/communication/bulk-send/page.tsx; backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /communication/bulk-send |
| inbox.history-log | backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /api/communications/history |
| inbox.send-document | backend/src/routes/communications.ts | /api/communications/send-document |
| inbox.templates | desktop/src/app/(app)/communication/templates/page.tsx; backend/src/routes/templates.ts; desktop/e2e/message-templates.spec.ts | /communication/templates |
| inbox.email-signature | desktop/src/app/(app)/settings/email-signature/page.tsx; backend/src/routes/users.ts; desktop/e2e/settings-team.spec.ts | /settings/email-signature |
| inbox.delivery-tracking | backend/src/routes/webhooks.ts; backend/test/delivery-callbacks.test.ts | /api/webhooks/sendgrid/events |
| inbox.unsubscribe | backend/src/routes/marketing/opt-out.ts |  |
| inbox.realtime | backend/src/durable-objects/realtime.ts; backend/test/realtime-socket.test.ts; desktop/src/stores/realtime-store.ts |  |
| contacts.list | desktop/src/app/(app)/contacts/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /contacts |
| contacts.create-edit | desktop/src/app/(app)/contacts/new/page.tsx; desktop/src/app/(app)/contacts/[id]/edit/page.tsx; desktop/e2e/contacts.spec.ts | /contacts/new |
| contacts.detail | desktop/src/app/(app)/contacts/[id]/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /contacts/:id |
| contacts.timeline | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/:id/timeline |
| contacts.duplicates | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/check-duplicate |
| contacts.merge | desktop/src/app/(app)/contacts/merge/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /contacts/merge |
| contacts.tags-bulk | backend/src/routes/contacts.ts; desktop/src/app/(app)/contacts/page.tsx | /api/contacts/bulk-tag |
| contacts.custom-fields | desktop/src/app/(app)/settings/custom-fields/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /settings/custom-fields |
| contacts.share | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/:id/share |
| contacts.occasions | backend/src/routes/contacts.ts; backend/src/cron/auto-reminders.ts; desktop/e2e/contacts.spec.ts | /api/contacts/upcoming-occasions |
| contacts.import | desktop/src/app/(app)/contacts/import/page.tsx; backend/src/routes/imports.ts; desktop/e2e/import-export.spec.ts | /contacts/import |
| contacts.export | backend/src/routes/contacts.ts; backend/src/routes/exports.ts; desktop/e2e/contacts.spec.ts; desktop/e2e/import-export.spec.ts | /api/contacts/export |
| contacts.soft-delete | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/:id |
| leads.list | desktop/src/app/(app)/leads/page.tsx; backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /leads |
| leads.kanban | desktop/src/app/(app)/leads/page.tsx; desktop/src/components/domain/kanban-board.tsx | /leads |
| leads.create-edit | desktop/src/app/(app)/leads/new/page.tsx; desktop/src/app/(app)/leads/[id]/edit/page.tsx; desktop/e2e/leads.spec.ts | /leads/new |
| leads.detail | desktop/src/app/(app)/leads/[id]/page.tsx; backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /leads/:id |
| leads.status | desktop/src/app/(app)/leads/[id]/page.tsx; backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /api/leads/:id/status |
| leads.lost-reason | desktop/src/components/domain/lead-lost-dialog.tsx; backend/src/routes/leads.ts | /leads/:id |
| leads.notes | backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /api/leads/:id/notes |
| leads.unassigned | desktop/src/app/(app)/leads/unassigned/page.tsx; desktop/e2e/leads.spec.ts | /leads/unassigned |
| leads.bulk-actions | backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /api/leads/bulk-status |
| leads.assignment-rules | desktop/src/app/(app)/settings/assignment-rules/page.tsx; backend/src/services/lead-assignment.ts; desktop/e2e/settings-company.spec.ts | /settings/assignment-rules |
| leads.routing-rules | desktop/src/app/(app)/settings/routing-rules/page.tsx; backend/src/routes/settings.ts; desktop/e2e/settings-company.spec.ts | /settings/routing-rules |
| leads.followup-sequences | desktop/src/app/(app)/settings/followup-sequences/page.tsx; backend/src/routes/settings.ts; backend/src/routes/leads.ts; desktop/e2e/settings-company.spec.ts | /settings/followup-sequences |
| leads.export | backend/src/routes/exports.ts; desktop/e2e/leads.spec.ts; desktop/e2e/import-export.spec.ts | /api/exports/leads |
| leads.import | backend/src/services/imports/row-inserter.ts; desktop/e2e/import-export.spec.ts | /import |
| followups.list | desktop/src/app/(app)/follow-ups/page.tsx; backend/src/routes/follow-ups.ts; desktop/e2e/follow-ups.spec.ts | /follow-ups |
| followups.schedule | desktop/src/app/(app)/follow-ups/page.tsx; desktop/e2e/follow-ups.spec.ts | /follow-ups |
| followups.reminders | backend/src/services/follow-up-reminders.ts |  |
| tasks.list | desktop/src/app/(app)/tasks/page.tsx; backend/src/routes/tasks.ts; desktop/e2e/tasks.spec.ts | /tasks |
| tasks.detail | desktop/src/app/(app)/tasks/[id]/page.tsx; backend/src/routes/tasks.ts; desktop/e2e/tasks.spec.ts | /tasks/:id |
| tasks.link-lead | backend/src/routes/tasks.ts; desktop/e2e/tasks.spec.ts | /tasks?leadId= |
| tasks.overdue-alerts | backend/src/cron/overdue-tasks.ts; backend/wrangler.toml |  |
| calendar.view | desktop/src/app/(app)/calendar/page.tsx; backend/src/routes/planner.ts; desktop/e2e/calendar.spec.ts | /calendar |
| calendar.events | backend/src/routes/planner.ts; desktop/e2e/calendar.spec.ts | /api/events |
| notifications.center | desktop/src/app/(app)/notifications/page.tsx; backend/src/routes/notifications.ts; desktop/e2e/notifications.spec.ts | /notifications |
| notifications.announce | desktop/src/app/(app)/settings/announcements/page.tsx; backend/src/routes/notifications.ts; desktop/e2e/notifications.spec.ts | /settings/announcements |
| notifications.preferences | desktop/src/app/(app)/settings/notifications/page.tsx; backend/src/routes/notification-preferences.ts | /settings/notifications |
| notifications.push | backend/src/routes/push-tokens.ts; backend/src/services/fcm.ts; backend/src/queues/push-notification-queue.ts |  |
| sticky-notes | desktop/src/components/domain/dashboard/sticky-notes-widget.tsx; backend/src/routes/sticky-notes.ts; desktop/e2e/dashboard.spec.ts | /dashboard |
| bookmarks | desktop/src/app/(app)/bookmarks/page.tsx; backend/src/routes/bookmarks.ts; desktop/e2e/dashboard.spec.ts | /bookmarks |
| itineraries.list | desktop/src/app/(app)/itineraries/page.tsx; backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /itineraries |
| itineraries.builder | desktop/src/app/(app)/itineraries/new/page.tsx; desktop/src/app/(app)/itineraries/[id]/edit/page.tsx; backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /itineraries/new |
| itineraries.detail | desktop/src/app/(app)/itineraries/[id]/page.tsx; desktop/e2e/itineraries.spec.ts | /itineraries/:id |
| itineraries.clone | backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /api/itineraries/:id/clone |
| itineraries.versions | backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /api/itineraries/:id/versions |
| itineraries.pdf | desktop/src/app/(app)/itineraries/[id]/pdf/page.tsx; backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /itineraries/:id/pdf |
| itineraries.send | backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /api/itineraries/:id/send |
| itineraries.share-link | backend/src/routes/itineraries.ts; backend/src/routes/public.ts; desktop/e2e/itineraries.spec.ts | /api/public/quotation/:token |
| itineraries.templates | desktop/src/app/(app)/itineraries/templates/page.tsx; backend/src/routes/itinerary-templates.ts; desktop/e2e/itinerary-templates.spec.ts | /itineraries/templates |
| itineraries.use-template | backend/src/routes/itinerary-templates.ts; desktop/e2e/itinerary-templates.spec.ts | /api/itinerary-templates/create-from |
| itineraries.defaults | desktop/src/app/(app)/settings/itinerary-defaults/page.tsx; backend/src/routes/settings.ts; desktop/e2e/settings-company.spec.ts | /settings/itinerary-defaults |
| itineraries.cost-estimate | desktop/src/app/(app)/itineraries/[id]/page.tsx |  |
| itineraries.pricing-lookup | backend/src/routes/rate-cards.ts; desktop/e2e/itineraries.spec.ts | /api/rate-cards/lookup |
| ratecards.list | desktop/src/app/(app)/rate-cards/page.tsx; backend/src/routes/rate-cards.ts; desktop/e2e/rate-cards.spec.ts | /rate-cards |
| ratecards.edit | desktop/src/app/(app)/rate-cards/new/page.tsx; desktop/src/app/(app)/rate-cards/[id]/edit/page.tsx; desktop/e2e/rate-cards.spec.ts | /rate-cards/new |
| ratecards.expiry-task | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| suppliers.list | desktop/src/app/(app)/suppliers/page.tsx; backend/src/routes/suppliers.ts; desktop/e2e/suppliers.spec.ts | /suppliers |
| suppliers.edit | desktop/src/app/(app)/suppliers/new/page.tsx; desktop/src/app/(app)/suppliers/[id]/edit/page.tsx; desktop/e2e/suppliers.spec.ts | /suppliers/new |
| suppliers.detail | desktop/src/app/(app)/suppliers/[id]/page.tsx; backend/src/routes/suppliers.ts | /suppliers/:id |
| suppliers.compare | desktop/src/app/(app)/suppliers/compare/page.tsx; backend/src/routes/suppliers.ts | /suppliers/compare |
| suppliers.payments | desktop/src/app/(app)/suppliers/[id]/page.tsx; backend/src/routes/suppliers.ts; backend/src/services/reports/supplier-reports.ts | /api/suppliers/:id/payments |
| suppliers.rate-preferred | backend/src/routes/suppliers.ts; desktop/e2e/suppliers.spec.ts | /api/suppliers/:id/rate |
| accounts.view | desktop/src/app/(app)/accounts/page.tsx; desktop/e2e/accounts.spec.ts | /accounts |
| hsn.codes | backend/src/routes/hsn-codes.ts; desktop/src/components/domain/hsn-code-picker.tsx; desktop/e2e/reports.spec.ts | /api/hsn-codes |
| invoices.list | desktop/src/app/(app)/invoices/page.tsx; backend/src/routes/invoices.ts; desktop/e2e/invoices.spec.ts | /invoices |
| invoices.create-edit | desktop/src/app/(app)/invoices/new/page.tsx; desktop/src/app/(app)/invoices/[id]/edit/page.tsx; desktop/e2e/invoices.spec.ts | /invoices/new |
| invoices.gst | backend/src/services/tax-calculator.ts; backend/src/routes/invoices.ts |  |
| invoices.from-itinerary | backend/src/routes/invoices.ts; backend/test/crud-lifecycle.test.ts | /api/invoices/from-itinerary |
| invoices.detail | desktop/src/app/(app)/invoices/[id]/page.tsx; desktop/e2e/invoices.spec.ts | /invoices/:id |
| invoices.pdf-csv | desktop/src/app/(app)/invoices/[id]/_documents.ts; desktop/e2e/invoices.spec.ts | /invoices/:id |
| invoices.bulk-pdf | backend/src/routes/exports.ts; backend/src/queues/export-queue.ts; desktop/e2e/invoices.spec.ts; desktop/e2e/import-export.spec.ts | /api/exports/invoices/bulk-pdf |
| invoices.void-duplicate | backend/src/routes/invoices.ts; desktop/e2e/invoices.spec.ts | /api/invoices/:id/void |
| invoices.send | backend/src/routes/invoices.ts; desktop/e2e/invoices.spec.ts | /api/invoices/:id/send |
| invoices.defaults-numbering | desktop/src/app/(app)/settings/invoice-defaults/page.tsx; desktop/src/app/(app)/settings/numbering/page.tsx; backend/src/services/numbering.ts; desktop/e2e/reports.spec.ts; desktop/e2e/settings-company.spec.ts | /settings/invoice-defaults |
| invoices.credit-notes | desktop/src/app/(app)/credit-notes/page.tsx; backend/src/routes/credit-notes.ts; desktop/e2e/credit-debit-notes.spec.ts | /credit-notes |
| invoices.debit-notes | desktop/src/app/(app)/debit-notes/page.tsx; backend/src/routes/credit-notes.ts; desktop/e2e/credit-debit-notes.spec.ts | /debit-notes |
| invoices.overdue-reminder-draft | backend/src/services/automation/recipes.ts | /assistant |
| invoices.reminders-cron | backend/src/cron/auto-reminders.ts |  |
| payments.record | desktop/src/app/(app)/payments/new/page.tsx; backend/src/routes/payments.ts; desktop/e2e/payments.spec.ts | /payments/new |
| payments.list | desktop/src/app/(app)/payments/page.tsx; desktop/src/app/(app)/payments/[id]/page.tsx; desktop/e2e/payments.spec.ts | /payments |
| payments.link-invoice | backend/src/routes/payments.ts; backend/test/payment-routes.test.ts | /api/payments/:id/link-invoice |
| payments.gateway | backend/src/routes/payments.ts |  |
| finance.exchange-rates | backend/src/routes/exchange-rates.ts; backend/src/services/exchange-rate.ts | /api/exchange-rates |
| finance.currency | desktop/src/lib/utils.ts; backend/src/routes/invoices.ts |  |
| vouchers.list | desktop/src/app/(app)/vouchers/page.tsx; backend/src/routes/vouchers.ts; desktop/e2e/vouchers.spec.ts | /vouchers |
| vouchers.create-edit | desktop/src/app/(app)/vouchers/new/page.tsx; desktop/src/app/(app)/vouchers/[id]/edit/page.tsx; desktop/e2e/vouchers.spec.ts | /vouchers/new |
| vouchers.status | backend/src/routes/vouchers.ts; desktop/e2e/vouchers.spec.ts | /vouchers/:id |
| vouchers.languages | desktop/e2e/vouchers.spec.ts |  |
| vouchers.pdf-send | backend/src/routes/vouchers.ts; backend/test/voucher-routes.test.ts | /api/vouchers/:id/send |
| vouchers.from-itinerary | backend/src/routes/vouchers.ts; backend/test/voucher-routes.test.ts | /api/vouchers/from-itinerary-item |
| travellers.list | desktop/src/app/(app)/travellers/page.tsx; backend/src/routes/travellers.ts; desktop/e2e/travellers.spec.ts | /travellers |
| travellers.edit | desktop/src/app/(app)/travellers/new/page.tsx; desktop/src/app/(app)/travellers/[id]/edit/page.tsx; desktop/e2e/travellers.spec.ts | /travellers/new |
| travellers.link-contact | backend/src/routes/travellers.ts; desktop/e2e/travellers.spec.ts | /api/travellers/:id/link-contact |
| travellers.collect-details | backend/src/services/automation/recipes.ts | /assistant |
| visa.list | desktop/src/app/(app)/visa/page.tsx; backend/src/routes/visa.ts; desktop/e2e/visa.spec.ts | /visa |
| visa.edit | desktop/src/app/(app)/visa/new/page.tsx; desktop/src/app/(app)/visa/[id]/edit/page.tsx; desktop/e2e/visa.spec.ts | /visa/new |
| visa.dashboard | desktop/src/app/(app)/visa/dashboard/page.tsx; backend/src/routes/visa.ts | /visa/dashboard |
| visa.checklist-docs | backend/src/routes/visa.ts; backend/test/visa-traveller.test.ts | /api/visa/:id/documents |
| visa.expiry-alerts | backend/src/cron/auto-reminders.ts |  |
| fleet.dashboard | desktop/src/app/(app)/fleet/page.tsx; backend/src/routes/fleet.ts; desktop/e2e/fleet-dashboard.spec.ts | /fleet |
| fleet.vehicles | desktop/src/app/(app)/fleet/vehicles/page.tsx; desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx; desktop/e2e/fleet-vehicles.spec.ts | /fleet/vehicles |
| fleet.vehicle-docs | backend/src/routes/fleet.ts; desktop/e2e/fleet-vehicles.spec.ts | /fleet/vehicles/:id |
| fleet.maintenance | backend/src/routes/fleet.ts; desktop/e2e/fleet-vehicles.spec.ts | /api/fleet/vehicles/:id/maintenance |
| fleet.drivers | desktop/src/app/(app)/fleet/drivers/page.tsx; desktop/src/app/(app)/fleet/drivers/[id]/page.tsx; desktop/e2e/fleet-drivers.spec.ts | /fleet/drivers |
| fleet.driver-docs | backend/src/routes/fleet.ts; desktop/e2e/fleet-drivers.spec.ts | /fleet/drivers/:id |
| fleet.driver-rating | backend/src/routes/fleet.ts; desktop/e2e/fleet-drivers.spec.ts | /fleet/drivers/:id |
| fleet.trips | desktop/src/app/(app)/fleet/trips/page.tsx; desktop/src/app/(app)/fleet/trips/new/page.tsx; desktop/src/app/(app)/fleet/trips/[id]/page.tsx; desktop/e2e/fleet-trips.spec.ts | /fleet/trips |
| fleet.trip-costs | desktop/src/app/(app)/fleet/trips/[id]/page.tsx; backend/src/routes/fleet.ts | /api/fleet/trips/:id/costs |
| fleet.trip-invoice | backend/src/routes/fleet.ts; backend/src/services/trip-invoice-generator.ts; desktop/src/app/(app)/fleet/trips/[id]/page.tsx | /api/fleet/trips/:id/generate-invoice |
| fleet.rate-cards | desktop/src/app/(app)/fleet/rate-cards/page.tsx; backend/src/routes/fleet.ts; backend/src/services/trip-cost-calculator.ts; desktop/e2e/fleet-rate-cards.spec.ts | /fleet/rate-cards |
| fleet.distance-cost | backend/src/services/trip-cost-calculator.ts |  |
| fleet.alerts | desktop/src/app/(app)/fleet/alerts/page.tsx; backend/src/routes/fleet.ts; desktop/e2e/fleet-dashboard.spec.ts | /fleet/alerts |
| fleet.alerts-cron | backend/src/cron/fleet-alerts.ts |  |
| fleet.arrival-transfer | backend/src/services/automation/recipes.ts; desktop/e2e/assistant-transfer-draft.spec.ts | /assistant |
| driver.login | packages/driver_app/lib/features/auth/presentation/screens/phone_input_screen.dart; backend/src/routes/driver.ts; desktop/e2e/driver-app-api.spec.ts |  |
| driver.my-trips | packages/driver_app/lib/features/trips/presentation/screens/my_trips_screen.dart; packages/driver_app/lib/features/trips/presentation/screens/trip_history_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.accept-reject | packages/driver_app/lib/features/trips/presentation/screens/trip_detail_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.status-updates | backend/src/routes/driver.ts; desktop/e2e/driver-app-api.spec.ts |  |
| driver.check-in-out | packages/driver_app/lib/features/trips/presentation/screens/check_in_screen.dart; packages/driver_app/lib/features/trips/presentation/screens/check_out_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.profile-docs | packages/driver_app/lib/features/profile/presentation/screens/profile_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.languages | packages/driver_app/lib/l10n/intl_en.arb; packages/driver_app/lib/l10n/intl_hi.arb; packages/driver_app/lib/l10n/intl_ar.arb |  |
| driver.push | backend/src/routes/driver.ts; packages/driver_app/pubspec.yaml |  |
| driver.distribution | packages/driver_app/pubspec.yaml |  |
| calls.log | desktop/src/app/(app)/communication/calls/page.tsx; backend/src/routes/calls.ts; desktop/e2e/calls.spec.ts | /communication/calls |
| calls.detail-outcome | desktop/src/app/(app)/communication/calls/[id]/page.tsx; backend/src/routes/calls.ts; desktop/e2e/calls.spec.ts | /communication/calls/:id |
| calls.dial | desktop/src/app/(app)/communication/calls/dial/page.tsx; backend/src/routes/calls.ts; backend/src/routes/voip-callbacks.ts; desktop/e2e/calls.spec.ts | /communication/calls/dial |
| calls.inbound-routing | backend/src/routes/voip-callbacks.ts; backend/src/services/call-routing.ts; backend/test/voip-callbacks.test.ts |  |
| calls.missed | backend/src/services/missed-call-handler.ts; backend/src/services/automation/recipes.ts; backend/test/voip-callbacks.test.ts | /api/calls/missed |
| calls.analytics | desktop/src/app/(app)/communication/calls/analytics/page.tsx; backend/src/routes/calls.ts; desktop/e2e/calls.spec.ts | /communication/calls/analytics |
| calls.recording | backend/src/routes/voip-callbacks.ts |  |
| calls.transcripts | desktop/src/app/(app)/communication/calls/transcripts/page.tsx; backend/src/routes/transcripts.ts; desktop/e2e/calls.spec.ts; backend/src/queues/ai-extraction-queue.ts | /communication/calls/transcripts |
| calls.ai-summary | desktop/src/app/(app)/ai/extractions/page.tsx; backend/src/routes/ai-extractions.ts; backend/src/services/ai-extraction.ts; desktop/e2e/ai-extractions.spec.ts | /ai/extractions |
| calls.voip-settings | desktop/src/app/(app)/settings/voip/page.tsx; backend/src/routes/voip.ts; desktop/e2e/voip-settings.spec.ts | /settings/voip |
| calls.numbers | desktop/src/app/(app)/settings/phone-numbers/page.tsx; backend/src/routes/voip.ts; desktop/e2e/voip-settings.spec.ts | /settings/phone-numbers |
| calls.screen-pop | backend/src/routes/voip.ts |  |
| calls.click-to-call | desktop/src/components/domain/click-to-call-button.tsx; desktop/e2e/calls.spec.ts |  |
| assistant.suggestions | desktop/src/app/(app)/assistant/page.tsx; desktop/src/components/domain/assistant/suggestion-card.tsx; backend/src/routes/assistant.ts; backend/test/automation-engine.test.ts | /assistant |
| assistant.activity-undo | desktop/src/app/(app)/assistant/page.tsx; backend/src/routes/assistant.ts; backend/test/automation-engine.test.ts | /assistant?tab=activity |
| assistant.modes | desktop/src/app/(app)/assistant/page.tsx; backend/src/routes/automations.ts; backend/test/automation-engine.test.ts; desktop/e2e/assistant-rules.spec.ts | /assistant?tab=automations |
| assistant.pause | backend/src/routes/automations.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| assistant.custom-rules | desktop/src/components/domain/assistant/rule-builder-dialog.tsx; backend/src/services/automation/custom-rules.ts; backend/test/custom-rules.test.ts; desktop/e2e/assistant-rules.spec.ts | /assistant?tab=automations |
| assistant.guards | backend/src/services/automation/engine.ts; backend/test/automation-engine.test.ts; backend/test/automation-recipes.test.ts |  |
| assistant.attention-widget | desktop/src/components/domain/assistant/attention-widget.tsx; desktop/src/app/(app)/dashboard/page.tsx; desktop/e2e/dashboard.spec.ts | /dashboard |
| assistant.sidebar-badge | desktop/src/components/layout/nav-config.ts; backend/src/routes/assistant.ts | /assistant |
| assistant.analyze-message | backend/src/routes/assistant.ts | /api/assistant/analyze |
| assistant.scheduler | backend/src/services/automation/schedule.ts; backend/src/index.ts; backend/test/automation-engine.test.ts |  |
| assistant.read-messages-ai | backend/src/services/automation/message-analysis.ts; backend/test/message-analysis-ai.test.ts; backend/src/services/automation/recipes.ts; desktop/e2e/assistant-transfer-draft.spec.ts | /assistant |
| automation.inbox.read_messages | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.inbox.reply_after_capture | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.first_follow_up | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.itineraries.suggest_template | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.quote_sent_status | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.leads.follow_up_after_quote | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.invoices.from_confirmed_booking | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.tasks.booking_checklist | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.payments.from_message | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.vouchers.after_payment | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.won_on_payment | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.stale_quote_nudge | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.invoices.overdue_reminder | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.calls.missed_callback | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.calls.lead_from_missed_call | backend/src/services/automation/recipes.ts; backend/test/voip-callbacks.test.ts | /assistant?tab=automations |
| automation.fleet.trip_feedback | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.contacted_on_reply | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.inbox.unanswered_message | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.itineraries.quote_expiring | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.payments.thank_you | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.payments.balance_before_travel | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.travellers.collect_details | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.marketing.post_trip_review | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.marketing.dormant_win_back | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.rate_cards.expiry_task | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.fleet.arrival_transfer | backend/src/services/automation/recipes.ts; desktop/e2e/assistant-transfer-draft.spec.ts | /assistant?tab=automations |
| assistant.draft-reply-send | desktop/e2e/assistant-transfer-draft.spec.ts; desktop/src/components/communication/send-message-dialog.tsx | /assistant |
| assistant.usage-credits | backend/src/services/ai-credits.ts; backend/src/services/ai-pricing.ts; backend/test/ai-credits.test.ts; desktop/src/app/(app)/assistant/page.tsx; desktop/src/app/(app)/settings/ai-usage/page.tsx | /assistant?tab=usage |
| ai.lead-extraction | desktop/src/app/(app)/ai/lead-creation/page.tsx; backend/src/routes/ai-assistant.ts; desktop/e2e/ai-assistant.spec.ts | /ai/lead-creation |
| ai.itinerary | desktop/src/app/(app)/ai/itinerary/page.tsx; backend/src/routes/ai-assistant.ts; desktop/e2e/ai-assistant.spec.ts | /ai/itinerary |
| ai.compose | desktop/src/app/(app)/ai/compose/page.tsx; backend/src/routes/ai-assistant.ts; desktop/e2e/ai-assistant.spec.ts | /ai/compose |
| ai.suggest-replies | backend/src/routes/ai-assistant.ts | /api/ai/suggest-replies |
| ai.invoice-generate | backend/src/routes/ai-assistant.ts | /api/ai/generate-invoice |
| ai.nl-search | desktop/src/app/(app)/ai/search/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-assistant.spec.ts | /ai/search |
| ai.insights | desktop/src/app/(app)/ai/insights/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/insights |
| ai.lead-score | desktop/src/app/(app)/ai/lead-score/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/lead-score |
| ai.ocr | desktop/src/app/(app)/ai/ocr/page.tsx; desktop/src/app/(app)/ai/document-scans/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/ocr |
| ai.smart-followups | desktop/src/app/(app)/ai/smart-followups/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/smart-followups |
| ai.bi-briefings | desktop/src/app/(app)/ai/bi/briefings/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/briefings |
| ai.bi-health-score | desktop/src/app/(app)/ai/bi/health-score/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/health-score |
| ai.bi-destinations | desktop/src/app/(app)/ai/bi/destinations/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/destinations |
| ai.bi-team | desktop/src/app/(app)/ai/bi/team/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/team |
| ai.bi-segments | desktop/src/app/(app)/ai/bi/segments/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/segments |
| ai.bi-forecast | backend/src/routes/business-intelligence.ts | /api/ai/bi/cash-flow-forecast |
| ai.settings | desktop/src/app/(app)/settings/ai/page.tsx; backend/src/routes/ai-settings.ts; desktop/e2e/ai-settings.spec.ts | /settings/ai |
| ai.usage-page | desktop/src/app/(app)/settings/ai-usage/page.tsx; desktop/src/app/(app)/ai/bi/usage/page.tsx; desktop/e2e/ai-business-intelligence.spec.ts | /settings/ai-usage |
| chatbot.conversations | desktop/src/app/(app)/chatbot/page.tsx; desktop/src/app/(app)/chatbot/conversations/[id]/page.tsx; backend/src/routes/chatbot.ts; desktop/e2e/chatbot.spec.ts | /chatbot |
| chatbot.widget-channels | backend/src/routes/chatbot.ts; backend/src/index.ts | /api/chatbot/widget.js |
| chatbot.settings | desktop/src/app/(app)/settings/chatbot/page.tsx; desktop/src/app/(app)/chatbot/analytics/page.tsx; backend/src/routes/chatbot.ts | /settings/chatbot |
| marketing.dashboard | desktop/src/app/(app)/marketing/page.tsx; desktop/e2e/marketing-campaigns.spec.ts | /marketing |
| marketing.campaigns | desktop/src/app/(app)/marketing/campaigns/page.tsx; backend/src/routes/marketing/campaigns.ts; desktop/e2e/marketing-campaigns.spec.ts; desktop/e2e/campaigns.spec.ts | /marketing/campaigns |
| marketing.campaign-send | backend/src/routes/marketing/campaigns.ts; backend/src/queues/campaign-queue.ts | /marketing/campaigns/:id |
| marketing.campaign-schedule | backend/src/cron/campaign-scheduler.ts; desktop/e2e/campaigns.spec.ts | /marketing/campaigns/:id |
| marketing.legacy-campaigns | desktop/src/app/(app)/campaigns/page.tsx; backend/src/routes/campaigns.ts; desktop/e2e/campaigns.spec.ts | /campaigns |
| marketing.segments | desktop/src/app/(app)/marketing/segments/page.tsx; backend/src/routes/marketing/segments.ts; backend/src/services/segmentation-engine.ts; desktop/e2e/marketing-segments.spec.ts | /marketing/segments |
| marketing.flyers | desktop/src/app/(app)/marketing/flyers/page.tsx; backend/src/routes/marketing/flyers.ts; desktop/e2e/marketing-flyers.spec.ts | /marketing/flyers |
| marketing.flyer-templates | desktop/src/app/(app)/marketing/flyers/templates/page.tsx; backend/src/routes/marketing/flyer-templates.ts; desktop/e2e/marketing-flyers.spec.ts | /marketing/flyers/templates |
| marketing.branding | desktop/src/app/(app)/marketing/branding/page.tsx; backend/src/routes/marketing/branding.ts; desktop/e2e/marketing-flyers.spec.ts | /marketing/branding |
| marketing.festivals | desktop/src/app/(app)/marketing/festivals/page.tsx; backend/src/routes/festival-campaigns.ts; desktop/src/lib/api/marketing.ts | /marketing/festivals |
| marketing.opt-out | desktop/src/app/(app)/marketing/opted-out/page.tsx; backend/src/routes/marketing/opt-out.ts; desktop/e2e/marketing-opt-out.spec.ts | /marketing/opted-out |
| marketing.social | desktop/src/app/(app)/marketing/social/page.tsx; backend/src/routes/social-content.ts; desktop/e2e/marketing-social.spec.ts | /marketing/social |
| marketing.suggestions | backend/src/routes/marketing-suggestions.ts | /api/marketing/suggestions |
| marketing.whatsapp-campaigns | desktop/src/app/(app)/marketing/whatsapp/page.tsx; backend/src/routes/whatsapp-campaigns.ts; desktop/e2e/whatsapp-campaigns.spec.ts; backend/src/queues/whatsapp-campaign-queue.ts | /marketing/whatsapp |
| marketing.post-trip-review | backend/src/services/automation/recipes.ts | /assistant?tab=automations |
| documents.library | desktop/src/app/(app)/documents/page.tsx; backend/src/routes/documents.ts; desktop/e2e/documents.spec.ts | /documents |
| documents.link-prefill | desktop/e2e/documents.spec.ts | /documents?leadId= |
| documents.file-store | backend/src/routes/files.ts | /api/files |
| dashboard.kpis | desktop/src/app/(app)/dashboard/page.tsx; backend/src/routes/reports.ts; desktop/e2e/dashboard.spec.ts | /dashboard |
| dashboard.quick-add | desktop/e2e/dashboard.spec.ts | /dashboard |
| dashboard.command-palette | desktop/src/components/ui/command-palette.tsx; desktop/src/app/(app)/layout.tsx |  |
| dashboard.shortcuts | desktop/src/components/domain/keyboard-shortcuts-provider.tsx; desktop/src/app/(app)/help/page.tsx |  |
| reports.hub | desktop/src/app/(app)/reports/page.tsx; backend/src/routes/reports.ts; desktop/e2e/reports.spec.ts | /reports |
| reports.library | backend/src/services/reports/sales-reports.ts; backend/src/services/reports/financial-reports.ts; backend/src/services/reports/lead-reports.ts; desktop/e2e/reports.spec.ts | /api/reports/:id |
| reports.date-compare | desktop/e2e/reports.spec.ts | /reports/sales |
| reports.export | backend/src/routes/reports.ts; backend/src/services/exports/excel-export.ts; desktop/e2e/reports.spec.ts | /api/reports/:id/export |
| reports.outstanding-ageing | backend/src/routes/reports.ts; desktop/e2e/reports.spec.ts | /api/reports/outstanding |
| reports.cache | backend/src/services/report-cache.ts; backend/src/routes/reports.ts | /api/reports/cache |
| import.wizard | desktop/src/app/(app)/import/page.tsx; desktop/src/app/(app)/settings/import/page.tsx; backend/src/routes/imports.ts; desktop/e2e/import-export.spec.ts | /import |
| import.templates | backend/src/services/imports/template-generator.ts; desktop/e2e/import-export.spec.ts | /api/imports/templates/:type |
| import.duplicates | backend/src/services/imports/duplicate-detector.ts; desktop/e2e/import-export.spec.ts | /import |
| import.history | desktop/src/app/(app)/settings/import/page.tsx; backend/src/routes/imports.ts; desktop/e2e/import-export.spec.ts | /settings/import |
| export.lists | desktop/e2e/contacts.spec.ts; desktop/e2e/leads.spec.ts; desktop/e2e/invoices.spec.ts; desktop/e2e/payments.spec.ts; desktop/e2e/tasks.spec.ts; desktop/e2e/suppliers.spec.ts |  |
| export.xlsx | desktop/src/app/(app)/settings/export/page.tsx; backend/src/routes/exports.ts; desktop/e2e/import-export.spec.ts | /settings/export |
| export.full | backend/src/routes/exports.ts; backend/src/queues/export-queue.ts; desktop/e2e/import-export.spec.ts | /settings/export |
| auth.login | desktop/src/app/(auth)/login/page.tsx; backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts; desktop/e2e/token-refresh.spec.ts | /login |
| auth.otp | backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts | /login |
| auth.password-reset | backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts | /forgot-password |
| auth.sessions | desktop/src/app/(app)/settings/sessions/page.tsx; desktop/src/app/(app)/settings/login-history/page.tsx; backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts; desktop/e2e/settings-team.spec.ts | /settings/sessions |
| team.members | desktop/src/app/(app)/settings/team/page.tsx; backend/src/routes/users.ts; desktop/e2e/settings-team.spec.ts | /settings/team |
| team.invite-email | backend/src/routes/users.ts; desktop/src/app/(auth)/setup-account/page.tsx |  |
| team.roles | backend/src/constants/permissions.ts; desktop/src/hooks/use-permission.ts; backend/test/permissions-endpoint.test.ts |  |
| team.seat-limit | backend/src/routes/users.ts |  |
| settings.hub | desktop/src/app/(app)/settings/page.tsx; desktop/e2e/settings-company.spec.ts | /settings |
| settings.company | desktop/src/app/(app)/settings/company/page.tsx; backend/src/routes/settings.ts; desktop/e2e/settings-company.spec.ts | /settings/company |
| settings.profile | desktop/src/app/(app)/settings/profile/page.tsx; backend/src/routes/users.ts; desktop/e2e/settings-team.spec.ts | /settings/profile |
| settings.change-password | desktop/e2e/settings-team.spec.ts |  |
| settings.custom-fields | desktop/src/app/(app)/settings/custom-fields/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /settings/custom-fields |
| settings.activity-log | desktop/src/app/(app)/settings/activity-log/page.tsx; backend/src/routes/activity-logs.ts | /settings/activity-log |
| settings.numbering | desktop/src/app/(app)/settings/numbering/page.tsx; backend/src/services/numbering.ts; desktop/e2e/settings-company.spec.ts | /settings/numbering |
| settings.integrations | desktop/src/app/(app)/settings/integrations/page.tsx; desktop/e2e/webhooks-integrations.spec.ts | /settings/integrations |
| settings.language | desktop/src/lib/i18n.ts; desktop/src/components/domain/language-switcher.tsx |  |
| settings.onboarding | desktop/src/app/(app)/onboarding/page.tsx | /onboarding |
| help.center | desktop/src/app/(app)/help/page.tsx; desktop/e2e/auth-shell.spec.ts | /help |
| desktop.app | desktop/electron/main.ts; desktop/electron-builder.yml |  |
| sa.login | super-admin/src/app/login/page.tsx; super-admin/src/app/api/auth/route.ts; super-admin/src/middleware.ts | /login |
| sa.dashboard | super-admin/src/app/(authenticated)/dashboard/page.tsx; super-admin/src/app/api/dashboard/stats/route.ts | /dashboard |
| sa.tenants-list | super-admin/src/app/(authenticated)/tenants/page.tsx; super-admin/src/app/(authenticated)/tenants/[id]/page.tsx; super-admin/src/app/api/tenants/route.ts; super-admin/src/app/api/tenants/[id]/route.ts | /tenants |
| sa.tenant-provision | super-admin/src/app/(authenticated)/tenants/new/page.tsx; super-admin/src/app/api/tenants/provision/route.ts | /tenants/new |
| sa.tenant-lifecycle | super-admin/src/app/api/tenants/[id]/suspend/route.ts; super-admin/src/app/api/tenants/[id]/reactivate/route.ts; super-admin/src/app/api/tenants/[id]/route.ts |  |
| sa.plan-change | super-admin/src/app/api/tenants/[id]/plan/route.ts; super-admin/src/lib/constants.ts |  |
| sa.feature-flags | super-admin/src/app/api/tenants/[id]/features/route.ts; super-admin/src/app/api/tenants/[id]/caps/route.ts; backend/src/middleware/feature-gate.ts |  |
| sa.subscriptions | super-admin/src/app/(authenticated)/subscriptions/page.tsx; super-admin/src/app/api/subscriptions/route.ts; super-admin/src/app/api/subscriptions/[id]/record-payment/route.ts | /subscriptions |
| sa.billing-online | super-admin/src/app/api/webhooks/razorpay/route.ts |  |
| sa.announcements | super-admin/src/app/(authenticated)/announcements/page.tsx; super-admin/src/app/api/announcements/route.ts | /announcements |
| sa.support | super-admin/src/app/(authenticated)/support/page.tsx; super-admin/src/app/api/support/tickets/route.ts | /support |
| sa.audit-log | super-admin/src/app/(authenticated)/audit-log/page.tsx; super-admin/src/app/api/audit-log/route.ts | /audit-log |
| sa.system-health | super-admin/src/app/(authenticated)/system-health/page.tsx; super-admin/src/app/api/system-health/route.ts | /system-health |
| sa.reports | super-admin/src/app/(authenticated)/reports/page.tsx; super-admin/src/app/api/reports/platform-summary/route.ts | /reports |
| sa.seo | super-admin/src/app/(authenticated)/seo/page.tsx |  |
| sa.impersonation |  |  |
| sa.desktop-pages | desktop/src/app/(app)/super-admin/page.tsx; desktop/src/app/(app)/super-admin/tenants/page.tsx; backend/src/routes/admin.ts; desktop/e2e/super-admin.spec.ts | /super-admin |
| landing.page | landing/index.html | landing/index.html |
| landing.pricing | landing/index.html |  |
| landing.signup | landing/index.html |  |
| landing.legal | landing/index.html |  |
| landing.reviews | landing/index.html |  |
| landing.contact | landing/index.html |  |
| landing.hosting | landing/index.html |  |
| wp.provisioner | oci-provisioner/src/server.ts; oci-provisioner/src/wp-setup.ts; oci-provisioner/Dockerfile |  |
| wp.server-infra | terraform/modules/oracle-cloud/main.tf |  |
| wp.console-page | super-admin/src/app/(authenticated)/wordpress/page.tsx; super-admin/src/app/api/wordpress/provision/route.ts; super-admin/src/app/api/wordpress/route.ts | /wordpress |
| wp.provision-queue | super-admin/src/app/api/wordpress/provision/route.ts; backend/src/queues/wp-provision-queue.ts |  |
| wp.template | oci-provisioner/src/wp-setup.ts |  |
| platform.tenant-isolation | backend/wrangler.toml; backend/src/services/tenant-db.ts; backend/src/db/tenant-schema.ts |  |
| platform.deploy | backend/wrangler.toml; .github/workflows/deploy-backend.yml |  |
| platform.cors | backend/src/index.ts |  |
| platform.api | backend/src/index.ts; backend/test/api.test.ts; backend/test/crud-lifecycle.test.ts | /api/v1 |
| platform.permissions | backend/src/constants/permissions.ts; backend/src/middleware/rbac.ts; backend/test/permissions-endpoint.test.ts |  |
| platform.queues | backend/src/queues/index.ts; backend/wrangler.toml |  |
| platform.cron | backend/src/index.ts; backend/src/cron/auto-reminders.ts; backend/src/cron/overdue-tasks.ts; backend/src/cron/campaign-scheduler.ts; backend/src/cron/fleet-alerts.ts |  |
| platform.observability | backend/src/index.ts |  |
| platform.test-mode | backend/src/routes/test.ts |  |
| platform.compliance | backend/src/db/tenant-schema.ts |  |
| platform.international | backend/src/services/tax-calculator.ts; backend/src/utils/phone.ts; desktop/src/lib/utils.ts |  |

