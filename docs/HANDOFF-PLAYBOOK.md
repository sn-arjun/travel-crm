# Handoff playbook: from "new customer" to "they run their own agency"

For the platform owner (the operator). Plain language. It follows the same steps as the automated rehearsal `desktop/e2e/handoff.spec.ts`, which creates three agencies (Basic in India, Pro in the UK, Enterprise in the UAE) on a local stack and checks every step below. If that test is green, the product does these things; this playbook is for doing them for a real customer, where email, payments and phone calls are real.

Related files: [GO-LIVE.md](GO-LIVE.md) (setting the platform up, and the staging rehearsal in phase 6), [KEYS-AND-ACCOUNTS.md](KEYS-AND-ACCOUNTS.md) (every account and key), [INFRA.md](INFRA.md) (how agencies are stored).

## 0. Before you start

Do these once. They are not repeated here.

| You need | Where it is explained |
| --- | --- |
| The platform is live: API, agency web app, super admin console, installer, driver app | GO-LIVE.md phases 1 to 8 |
| Email works and the welcome mail reaches inboxes (SendGrid, sender domain authenticated) | KEYS-AND-ACCOUNTS.md section 3.3, GO-LIVE.md 6.7 |
| Messaging and calling providers funded (Twilio for SMS, WhatsApp and calling) | KEYS-AND-ACCOUNTS.md section 3.3 |
| Payment accounts for collecting subscriptions (Razorpay for India, Stripe elsewhere) | KEYS-AND-ACCOUNTS.md section 3.5 |
| Your operator login for the console | GO-LIVE.md phase 4 |

Decisions to have made before the call with the customer:

1. **Plan** (Basic, Pro, Enterprise, or Trial) and the **country**. The country decides the price list (market), the payment gateway, whether calling is offered, and the tax wording.
2. **A price for the customer's market.** Prices are per market (India, Gulf, West, and so on). If the plan has no price in the customer's market, the agency still works, but the billing screen cannot take an online payment for them. Add the price first: console, Catalogue (or `POST /admin/catalogue/prices`). The rehearsal does this as its first step.
3. **The agency code** (the "slug", for example `skyline-holidays`): 3 to 40 lower-case letters, digits and hyphens. Drivers type it into the driver app, so pick something a driver can read out over the phone. It cannot be changed casually later.
4. **The owner's email address**: a real inbox the owner controls. The temporary password goes there.
5. **Support contact** for the customer: see the placeholders in the welcome pack (section 3).

## 1. Operator checklist

Tick each line. Under each: what you should see, and what to do if you do not.

### Step 1. Create the agency

In the console: Tenants, New. Enter company name, agency code, owner name and email, plan, country, currency, time zone and tax system (GST, VAT, sales tax or none), region.

- [ ] Provisioning goes through its steps and ends **active**. The owner appears in the tenant list.
- [ ] A second agency with the same code is refused ("already in use").
- [ ] The console shows the subscription in the customer's currency.

If provisioning ends **failed**: open the tenant, read the step and message, press **Retry**. Retry resumes cleanly; it does not create a second database. If it ends **pending_deploy**, the agency's database exists but the live service has not picked it up yet: follow GO-LIVE.md 6.6 (regenerate the config and redeploy), then check again. If it says the pool is exhausted (local stacks only), the stack was started with too few databases.

### Step 2. The welcome email

The owner receives "Welcome to TravelCRM Pro, <agency>" with: their email, a **temporary password** (16 characters, shown only here), the sign-in link, the download link and the quick-start link.

- [ ] The mail arrives in the inbox, not in spam, within a minute.
- [ ] It names the right agency and the right email, and both links open.

If it does not arrive: check SendGrid activity and the sender-domain authentication (KEYS-AND-ACCOUNTS.md 3.3). The temporary password is not stored anywhere you can read it later. If the mail is lost, use **Forgot password** for the owner (the owner gets a reset link) or ask engineering to reissue.

### Step 3. First sign-in (do this with the owner, on a call)

The owner signs in with the temporary password. The app forces a new password (at least 12 characters, with a letter and a digit) and then shows the onboarding wizard: company details, currency, time zone and tax system (already filled from step 1), invoice number prefix, logo.

- [ ] The temporary password stops working once a new one is chosen.
- [ ] The wizard shows the right currency and time zone for the country.
- [ ] The dashboard opens and shows the company name.

If the owner is stuck on the "choose a password" screen: the password is too short or has no digit; the message says which. If they are locked out after several wrong tries, an admin can unlock them in Settings, Team; for the owner, ask engineering.

### Step 4. Invite the team, one user per role

Settings, Team. Roles: admin (the owner), sales manager, salesperson, operations, accountant, view only. Each invitee gets an email with a set-up link, chooses a name and a password, and signs in.

- [ ] Every invitee receives the mail and can finish set-up. A link works once.
- [ ] The plan's user limit is enforced: Basic includes 5 users (the owner counts), so the sixth is refused with a message offering an upgrade or extra users. Pro and Enterprise include more.
- [ ] A view-only user can read but not create; a salesperson can create contacts; only admins and sales managers can see the team list.

If an invitee says the link is dead: it expires after 7 days and works once. Invite again.

### Step 5. Connect the channels

Settings, Integrations. Receiving email address for enquiries, WhatsApp number (Meta), website-form key.

- [ ] The email address and the WhatsApp number save. A number or address that another agency already uses is refused, without saying whose it is.
- [ ] The WhatsApp access token is stored encrypted; the screen shows only its last four characters.
- [ ] The website-form key is shown once. Give it to whoever runs the customer's website.

Calling and the Twilio side of messaging need real provider accounts and are checked on staging, not locally (section 5).

### Step 6. Driver app

The customer's drivers install the driver app (steps in section 3), choose the agency code from step 1 and sign in with their phone number and a one-time code.

- [ ] The agency must first add each driver (Fleet, Drivers) with the driver's mobile number.
- [ ] The agency code shows the agency name and currency in the app. A wrong code is refused.
- [ ] A number that is not a driver of this agency gets the same "code sent" answer as a real driver and then fails at the code step, so the app never reveals who is registered.

If a driver does not receive the code: login codes are sent by Twilio Verify and are limited per number (3 per 10 minutes) and per agency per month (the plan's allowance). Check the number is a mobile number in international format, and the agency's remaining allowance.

### Step 7. The first enquiry becomes a lead

Test it with the customer: submit their website form (or post to the form endpoint with the website-form key).

- [ ] A lead and a contact appear in the agency's Leads, source "website", marked hot.
- [ ] Nothing appears in any other agency.

### Step 8. Plan limits and locked features

- [ ] A feature the plan does not include is refused with an upgrade prompt, never a raw error. For example on Basic: the AI assistant, the chatbot and WhatsApp campaigns. The screen says "upgrade".
- [ ] To give one agency a feature outside its plan (a pilot, a favour): console, tenant, Features. Removing the override locks it again.
- [ ] **Calling** needs three things: the plan includes it, the agency's country is on the calling list, and the calling account is set up. Today the list is the UK, US, Australia and Singapore.

### Step 9. Billing

Settings, Billing (the owner sees it).

- [ ] Shows the plan, the renewal date, "x of y users in use", the price in the customer's currency.
- [ ] A checkout opens the payment page (a test page locally; Razorpay for India or Stripe for everywhere else live). After payment the subscription is active, a platform invoice (number `PINV-...`) appears in the customer's currency, and a receipt is emailed.

If the billing screen says "online payment is not set up": the gateway keys are missing on the platform (KEYS-AND-ACCOUNTS.md 3.5). If a plan is greyed out: it has no price in the customer's market (section 0, decision 2).

### Step 10. Suspend and reactivate (know how, before you need to)

Console, tenant, **Suspend** (with a reason).

- [ ] Everyone in the agency is signed out of data access at once: owner, staff, and the driver app. The agency code is no longer recognised.
- [ ] **Nothing is deleted.** Leads, contacts, users and settings are all still there.
- [ ] **Reactivate** brings everything back; people sign in with the same passwords.

Suspend for non-payment or abuse. **Cancel** is different: it ends the subscription and starts the number-release clock for calling; use it only when the customer leaves.

## 2. "Done" means

The handoff is complete when all of these are true:

1. The owner has signed in with their own password, finished onboarding and seen their dashboard.
2. At least one user per role they need has accepted an invitation and signed in.
3. The owner's email, WhatsApp and website-form are connected, and a test enquiry created a lead.
4. The drivers can sign in with the agency code (if they use the app).
5. Billing shows the right currency and either a paid subscription or a dated trial; the owner knows when it renews.
6. The owner has the welcome pack (below), including who to contact for support, and has been shown where to find the quick-start guide.
7. You have written down: agency code, plan, country, owner email, date of handoff, and who at the customer is the contact. Never write the password.

## 3. Client welcome pack

Send these to the customer. Replace the placeholders in `<angle brackets>`.

### 3.1 Welcome email (sent automatically; this is the wording)

> Subject: Welcome to TravelCRM Pro, `<Agency name>`
>
> Hello `<Owner name>`,
>
> The workspace for `<Agency name>` is ready.
>
> Email: `<owner email>`
> Temporary password: `<sent once in the email>`
>
> You will be asked to choose a new password the first time you sign in. It must be at least 12 characters with a letter and a digit.
>
> Sign in: `https://app.<domain>`
> Download the desktop app: `https://app.<domain>/download`
> Quick start: `https://app.<domain>/quick-start`

Follow it with a short personal note from you: when you will call, and the support contact below.

### 3.2 Quick start by role

Give each person only their own block.

**Owner (admin)**
1. Sign in with the temporary password and choose your own.
2. Finish the setup wizard: company details, currency, tax, invoice prefix, logo.
3. Settings, Team: invite your staff. Choose the role carefully: it decides what they can see and change.
4. Settings, Integrations: connect your enquiry email and WhatsApp number; give your web developer the website-form key.
5. Settings, Billing: check your plan, users and renewal date.
6. Fleet, Drivers: add each driver with their mobile number, then give them the agency code `<agency code>`.

**Sales manager**
1. Accept your invitation, choose a password, sign in.
2. Leads: new enquiries arrive here; assign them to salespeople.
3. Reports: see the pipeline and who is converting.
4. Team: you can see your colleagues.

**Salesperson**
1. Accept your invitation and sign in.
2. Leads: open a new enquiry, call or message the customer from the lead (messages go through the CRM, so the whole team sees them).
3. Build a quote from Itineraries and send it from the lead.
4. Follow-ups and Tasks: set a reminder after each contact.

**Operations**
1. Accept your invitation and sign in.
2. Itineraries and Vouchers: confirm bookings with suppliers.
3. Fleet: vehicles, drivers and trips; assign a trip and the driver sees it in the app.
4. Visa: track documents and dates.

**Accountant**
1. Accept your invitation and sign in.
2. Invoices and Payments: raise invoices (tax is added for your country), record payments, issue credit notes.
3. Reports: income and outstanding balances.

**View only**
1. Accept your invitation and sign in.
2. You can open and search everything you have access to; you cannot create or change anything.

### 3.3 Credential sheet (template; fill in by hand, never email passwords)

| Item | Value |
| --- | --- |
| Agency name | `<Agency name>` |
| Agency code (for the driver app) | `<agency code>` |
| Sign-in address | `https://app.<domain>` |
| Owner email | `<owner email>` |
| Owner password | Chosen by the owner at first sign-in. Not recorded anywhere. |
| Plan and renewal date | `<plan>`, `<date>` |
| Number of users included | `<n>` |
| Support contact | `<support email>`, `<support phone / WhatsApp>`, hours `<hours>` |
| Your account manager | `<name>` |

### 3.4 Links

- Desktop app and driver app downloads: `https://app.<domain>/download`
- Quick-start guide: `https://app.<domain>/quick-start`

### 3.5 Driver app install steps (send to each driver)

1. On the Android phone open the Play Store link from `https://app.<domain>/download` (or the link your agency sends) and install **TravelCRM Driver**.
2. Open the app. When it asks for the **agency code**, type `<agency code>`. The agency name appears; if it does not, check the code with your office.
3. Enter your mobile number with the country code (for example `+91...`, `+44...`, `+971...`).
4. Enter the 6-digit code you receive by text message.
5. You will see the trips assigned to you. Accept a trip, update its status as you go, check in and out at stops.

If no code arrives after a few minutes, ask the office to confirm your number in Fleet, Drivers (it must be exactly the number you typed).

## 4. What is different by country

| | India | United Kingdom | UAE (Gulf) |
| --- | --- | --- | --- |
| Currency set at creation | INR | GBP | AED |
| Tax system to choose | GST | VAT | VAT |
| Subscription gateway | Razorpay | Stripe | Stripe |
| Price list (market) | India | West | Gulf |
| Calling resold by the platform | No (owner decision, October 2026) | Yes | No |
| Phone numbers typed without a country code are read as | +91 | +44 | +971 |
| WhatsApp | Meta Cloud API number per agency, or the platform's Twilio sender | same | same |
| Time zone default offered | Asia/Kolkata | Europe/London | Asia/Dubai |

Notes:

- The rows are what the product does today. The rehearsal checks currency, locale, time zone, tax system, phone code, gateway, market and the calling rule for these three countries.
- Calling is offered only where the platform can resell it (UK, US, Australia, Singapore). An agency elsewhere sees no calling screens and the calling endpoints answer "not available in your country". Adding a country is a configuration change, not a code change.
- A new agency in a market with no price yet cannot pay online (see section 0).
- Agencies in other countries follow the same pattern: the country name chosen at creation decides locale and phone code; pick the tax system by hand.

## 5. Not covered by the automated rehearsal (do these on staging, GO-LIVE.md phase 6)

The local rehearsal uses a mailbox file instead of email, a mock payment page instead of Razorpay or Stripe, fixed login code `123456` instead of Twilio, and a mock telephone provider. So these need a human on staging with real accounts:

- The welcome email really arrives in an inbox and passes SPF and DKIM.
- A real card or UPI payment, and the receipt email.
- A real driver login code by text message, on a real Android phone with the signed driver app.
- A real WhatsApp message through Meta ("Test connection" calls Meta and cannot run offline).
- Placing a real call (UK agency only).
- The desktop installer on a clean Windows machine, and the update prompt.
- The super admin console screens (the rehearsal drives the same API the console calls; the console is a separate web app).
- Two-factor sign-in for the owner (covered by its own test, `two-factor.spec.ts`).

## 6. Running the rehearsal yourself

```bash
cd desktop
# calling follows the country rule only when the list is passed to both the stack and the test
export FIX_STACK_CALLING_COUNTRIES=GB,US,AU,SG
node scripts/fix-stack.mjs up --slot 2 --reset-db --multi
export E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1
npx playwright test e2e/handoff.spec.ts --project=chromium
node scripts/fix-stack.mjs down --slot 2
```

The test needs a fresh database each time (it uses three of the four agency databases of a `--multi` stack): add `--reset-db` whenever you run it again. It never contacts a real service.
