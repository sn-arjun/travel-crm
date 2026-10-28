# STORYBOARD — TravelCRM Pro client demo videos

**Owner:** Agent 3b (Sonnet executor)
**Source of truth for:**
- the demo dataset,
- the shot lists for both cuts,
- captions and title cards,
- production and recording rules,
- quality gates.

**Save to:** `desktop/showcase/STORYBOARD.md`

This storyboard was written against the code as it stood on 2026-10-03. A fix pass (B0–B9) is running at the same time. Wherever this document depends on a fix, it names a **FIX-REQ** with:
- a way to detect whether the fix has landed;
- a primary path, used once it has;
- a fallback path, used if it has not.

The executor must run each detection before recording. It must never improvise on camera.

---

## 0. Read me first

### 0.1 Deliverables

| File | What it is |
|---|---|
| `desktop/showcase/TravelCRM-Demo.mp4` | Story cut, 8–12 min (target 10:00). 1920×1080, 30 fps, H.264 + silent AAC. |
| `desktop/showcase/TravelCRM-Full-Walkthrough.mp4` | Every feature area, about 24–27 min. Same encoding. |
| `desktop/showcase/chapters.txt` | YouTube chapter list for the walkthrough. |
| `desktop/showcase/story-chapters.txt` | Same format, for the story cut. |
| `desktop/showcase/SHOWCASE.md` | Regenerated. Links both MP4s, embeds both chapter lists, gives the regenerate command. |

### 0.2 New and changed files (executor)

**Seeding**
- `desktop/e2e/showcase/demo-data.ts`
  - Single source of truth: every name, number and caption-referenced value in section A.
  - Includes the relative-date helpers.
  - Imported by the seeder and by every spec.
- `desktop/e2e/showcase/demo-seed.ts`
  - Seeding logic, runnable with `npx tsx`.
  - Writes `desktop/showcase/.work/seed.json`, a map from logical key to created id.
- `backend/scripts/seed-demo.mjs`
  - Wrapper that does three things: calls `/test/reset`, runs `demo-seed.ts`, then applies the SQL fixups (A.9) with `npx wrangler d1 execute travelcrm-master --local --file=...`.
  - This is the same pattern `backend/scripts/seed-local.mjs` already uses.

**Recording helpers and config**
- `desktop/e2e/showcase/showcase-helpers.ts` — rewritten per D.2.
- `desktop/e2e/showcase/cursor-overlay.ts` — the init script, injected with `context.addInitScript`.
- `desktop/playwright.showcase.config.ts`:
  - `testMatch: /(story|full-walkthrough)\.spec\.ts/`
  - no `slowMo`
  - `timezoneId: 'Asia/Kolkata'`
  - `locale: 'en-IN'`
  - `colorScheme: 'light'`
  - `permissions: ['clipboard-read','clipboard-write']`
  - `retries: 0` (the orchestrator owns retakes)
  - `trace: 'retain-on-failure'`
  - webServer uses `npx next start -p 3100` with `stdout: 'ignore'`.

**Specs**
- `desktop/e2e/showcase/story.spec.ts` — two tests, `story-A` and `story-B`, selected with `--grep`.
- `desktop/e2e/showcase/full-walkthrough.spec.ts` — rewritten per C.

**Driver segment**
- `packages/driver_app/integration_test/demo_flow_test.dart`
- `packages/driver_app/pubspec.yaml` — add `integration_test: { sdk: flutter }` under `dev_dependencies` (FIX-REQ-4).
- `scripts/record-driver.ps1`

**Orchestration, compositing and gate**
- `scripts/record-demo.mjs` — orchestrator.
- `scripts/compose-demo.mjs` — ffmpeg compositing, using `ffmpeg-static` added as a desktop devDependency.
- `desktop/e2e/showcase/cards/*.html` — HTML templates for title, intro, outro, caption PNGs, the phone background and the device frame. These are rendered to PNG by Playwright.
- `desktop/e2e/showcase/finalize.ts` — quality gate (D.9).

### 0.3 Environment for recording

**Backend**
- Start command:
  ```
  cd backend && npx wrangler dev --port 8787 -c .wrangler-e2e.toml --var TEST_MODE:true --var SENDGRID_API_KEY: --var TWILIO_ACCOUNT_SID: --var TWILIO_AUTH_TOKEN: --var TWILIO_VERIFY_SERVICE_SID:
  ```
- `.wrangler-e2e.toml` is the same AI-stripped config that `desktop/playwright.config.ts` generates.
- Blanking SendGrid and Twilio guarantees no real email or SMS is sent to any address or phone shown in the demo.

**Desktop**
- Run `npx next build` once, then `npx next start -p 3100`.
- Never use `next dev`.

**Emulator**
- AVD `Pixel_8_API_36`, created if missing:
  ```
  avdmanager create avd -n Pixel_8_API_36 -k "system-images;android-36;google_apis;x86_64" -d pixel_8
  ```
- Fallback AVD: `Resizable_Experimental`.
- Set `hw.keyboard=yes` in `config.ini`, so no soft keyboard covers the UI.
- Flutter commands run through `C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe -Command "…"`.

**Time window**
- Record between 08:00 and 20:30 IST.
- The airport pickup must fall on today's date in IST. `record-demo.mjs` aborts if `nowIST > 20:30`.

**Dates**
- `D0` is the recording day in Asia/Kolkata.
- Every date in this document is written relative to `D0`.
- Example values are shown for `D0 = 2026-10-03`.

### 0.4 FIX-REQ register (check before recording)

| ID | Needed for | How to detect it has landed | Primary path | Fallback |
|---|---|---|---|---|
| FR-1 (blocking) | Scene 7 | `POST /api/v1/driver/login` then `/login/verify` with `{phone:'+919876543210', tenantId, otp:'123456'}` returns `accessToken`. | OTP 123456 via TEST_MODE. | None. Stop and report to the fix pass (batch B4). |
| FR-2 (blocking) | Scene 7 | `flutter test integration_test/demo_flow_test.dart` passes a dry run. The Today tab lists a trip created today. | B8 driver fixes: pagination, tenantId, nested vehicle, IST "today", location permission, cleartext HTTP. | None. Report to B8. |
| FR-2b | Scene 7 | `grep -r "Key('send-otp')" packages/driver_app/lib` | Widget keys from D.6. | Text and type finders listed in D.6. |
| FR-3 (blocking) | Every desktop shot | The sidebar footer shows "Ananya Menon", not a hard-coded user. | B1. | Do not record. |
| FR-4 | Scene 7 | `integration_test` is present in pubspec. | Add it. Executor may add it; it is a test-only dependency. | — |
| FR-5 | Scene 4 | Choosing the "Quotation Email" template yields a body with no `[Destination]` or `[Amount]` placeholders. | Use the template body as is. | Select-all in Subject and Body, then type/paste the custom text from 4.3. |
| FR-6 | Shot 3.7, walkthrough Itineraries | The rate-card picker rows show real service names and a non-zero cost, not `N/A` or `INR 0`. | Use the picker. | Scene 3 skips 3.7. The walkthrough types cost and selling by hand. |
| FR-7 | Scene 6 | The trip form has a "Trip type" select, and the lead detail page has a "Book transfer" action. | Set Trip type to "Airport Pickup". | Leave the type empty. Captions never say "airport pickup type". |
| FR-8 | Shot 8.2 | The trip timeline row for `check_in` shows a human label ("Checked in"). | Use it. | Caption still reads "GPS check-in". The phone segment already shows the coordinates. |
| FR-9 | Shot 1.2 | Clicking a notification in the bell navigates somewhere. | Click the notification. | Open the bell dropdown only, then use sidebar Inbox. |
| FR-10 | Walkthrough Itinerary Templates | `/itineraries/templates` has a "New template" control. | Create a template live. | Use an existing template only. |
| FR-11 | Story token life | B0 single-flight token refresh. A 30-minute idle session followed by navigation keeps the user logged in. | — | Re-login between Part A, Part B and the walkthrough. Each has its own context and storageState. |

---

## A. Cast and demo dataset

### A.1 The agency (tenant)

**Tenant identity**

| Field | Value |
|---|---|
| Tenant ID (unchanged) | `01960000-0000-7000-8000-000000000001` |
| Plan | `enterprise` (already set by `/test/reset`) |
| Company name | Sahyadri Holidays Pvt. Ltd. |
| Short name in copy | Sahyadri Holidays |
| Wordmark text | SAHYADRI HOLIDAYS |
| Monogram | "SH" in a 40px rounded square, `#4F46E5` background, white text |
| Tagline | "Journeys crafted across the Western Ghats" |
| HQ address | 2nd Floor, 14 HAL 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038, India |
| Kerala operations desk | MG Road, Kochi. Used in copy only. |

**Brand colours**
- Primary: indigo `--ds-primary #4F46E5` (`#818CF8` in dark mode).
- Deep: `#1E1B4B` / `#312E81`.
- Accent text: `#C7D2FE` / `#A5B4FC`.
- Fonts: DM Sans for display, Geist for UI. These are the app fonts.

**Company settings** — `PUT /api/v1/settings/company`, keys as stored by the backend:

| Key | Value |
|---|---|
| `company_name` | Sahyadri Holidays Pvt. Ltd. |
| `company_email` | hello@sahyadriholidays.in |
| `company_phone` | +91 80 4718 2290 |
| `company_website` | www.sahyadriholidays.in |
| `gstin` | 29AAPCS7341M1Z8 |
| `company_address` | 2nd Floor, 14 HAL 100 Feet Road, Indiranagar |
| `company_city` | Bengaluru |
| `company_state` | Karnataka |
| `company_postal_code` | 560038 |
| `company_country` | India |
| `timezone` | Asia/Kolkata |
| `currency` | INR |
| `language` | en |

**Numbering** — `PUT /api/v1/settings/numbering`:
- `invoice_prefix: 'SH-INV'`
- `proforma_prefix: 'SH-PI'`
- `receipt_prefix: 'SH-RCP'`
- `credit_note_prefix: 'SH-CN'`
- `debit_note_prefix: 'SH-DN'`
- `voucher_prefix: 'SH-VCH'`
- Merge these into the existing config object.

**Invoice defaults** — `PUT /api/v1/settings/invoice-defaults`:
- Bank: HDFC Bank, Indiranagar Branch
- A/c name: Sahyadri Holidays Pvt. Ltd.
- A/c no. 50200081234567
- IFSC HDFC0001234
- Default GST 5%
- Default terms: "50% advance to confirm; balance due 21 days before travel."

**Itinerary defaults** — `PUT /api/v1/settings/itinerary-defaults`
- Terms: "50% advance confirms the booking; balance 21 days before departure. Cancellation: 30+ days 10%, 15–29 days 25%, under 15 days 50%, no-show 100%. Hotel check-in 14:00, check-out 11:00."
- Inclusions: Accommodation as specified; Daily breakfast; Private air-conditioned vehicle with chauffeur; All transfers and sightseeing as per itinerary; GST.
- Exclusions: Airfare unless stated; Monument and camera fees not listed; Personal expenses; Travel insurance.

**Marketing branding** — `/marketing/branding` API:
- Primary `#4F46E5`, secondary `#1E1B4B`.
- Logo: a 512×512 PNG of the "SH" monogram, rendered from `cards/logo.html` and uploaded with `POST /api/v1/settings/logo` and the branding endpoint.

### A.2 Staff users (6)

| Name | Role (enum) | Title in copy | Email | Phone |
|---|---|---|---|---|
| **Ananya Menon** (the on-camera user) | admin | Founder & Director | ananya.menon@example.com (FR-SQL rename, see A.9 #2) | +91 98450 11820 |
| Rahul Nair | sales_manager | Sales Manager | rahul.nair@example.com | +91 98450 22931 |
| Sneha Iyer | salesperson | Senior Travel Consultant (Domestic) | sneha.iyer@example.com | +91 98450 33042 |
| Farhan Qureshi | salesperson | Travel Consultant (International) | farhan.qureshi@example.com | +91 98450 44153 |
| Deepa Thomas | operations | Operations Lead, Kochi desk | deepa.thomas@example.com | +91 94470 55264 |
| Vikram Rao | accountant | Accounts | vikram.rao@example.com | +91 98450 66375 |

How they are created:
- **Ananya** is the existing demo admin `01960000-0000-7000-8000-0000000000a1`. Rename her with `PUT /users/me {name:'Ananya Menon', phone:'+919845011820', department:'Management'}`.
- **The other five** are created with `POST /api/v1/users`. Afterwards, SQL A.9 #3 marks them as accepted, active and recently logged in, so the Team page shows no "pending invite" badges.

### A.3 Hero records (these appear on camera; values are exact)

**H1. Priya Nair** — contact, seeded. Her lead is created live in Scene 2.

| Field | Value |
|---|---|
| name | Priya Nair |
| type | customer |
| email | priya.nair@example.com |
| phone | +919845023117 |
| city / state / country | Bengaluru / Karnataka / India |
| address | Prestige Shantiniketan, Whitefield |
| source | website |
| tags | `family`, `kerala`, `whatsapp-enquiry` |
| notes | "Travels with husband Vivek and children Aditi (11) and Kabir (8). Vegetarian." |

**Priya's inbound WhatsApp.** Inserted by SQL in the pre-roll (A.9 #10), with `created_at = sent_at = now − 2 min`.

- `direction`: incoming
- `channel`: whatsapp
- `status`: delivered
- content (`{start}` is TRAVEL_START formatted "18 Dec"):

  > "Hi! We're a family of four from Bengaluru (kids aged 8 and 11) planning a 5-night Kerala trip from {start}. We'd love Munnar, one houseboat night and some backwater time. Budget around ₹1.25 lakh. Could you share a plan?"

**Priya's lead.** Created live in Scene 2.

| Field | Value |
|---|---|
| Title | Kerala Backwaters Family Holiday |
| Destinations | Munnar, Thekkady, Alleppey, Kumarakom |
| Trip Type | Family |
| Travel Date | TRAVEL_START = D0 + 76 days (18 Dec 2026) |
| Return Date | TRAVEL_START + 5 (23 Dec 2026) |
| Adults / Children / Infants | 2 / 2 / 0 |
| Budget | 125000 (INR) |
| Priority | Hot |
| Source | Website |
| Assigned To | Ananya Menon |
| Special Requirements | "Kids aged 8 and 11. One houseboat night, a tea-estate stay in Munnar, vegetarian meals." |

**Lead lifecycle on camera:**
1. New
2. Qualified (Scene 2)
3. Proposal Sent (Scene 4)
4. Won (Scene 5)

**Nair itinerary.** Created live from template T-KER (A.6):
- Title "Nair Family — Kerala Backwaters & Hills"
- Total cost ₹95,100; total selling ₹1,17,400; GST ₹5,870; grand total ₹1,23,270

**Nair invoice.** Created live in Scene 5.
- Line 1: "Kerala Backwaters & Hills — 5N/6D land package ({start}–{end})", qty 1, unit 94600
- Line 2: "Private Innova Crysta with chauffeur — 6 days incl. airport transfers", qty 1, unit 22800
- GST 5%
- Subtotal ₹1,17,400; GST ₹5,870; Total ₹1,23,270

**Nair payment.** Created live: ₹60,000, Bank Transfer, reference "UTR 362100487715".

**Nair hotel voucher.** Created live:

| Field | Value |
|---|---|
| Lead | Kerala Backwaters Family Holiday |
| Type | Hotel |
| Supplier | Vembanad Lake Resort |
| Hotel name | Vembanad Lake Resort, Kumarakom |
| Address | Kumarakom North, Kottayam, Kerala 686563 |
| Check-in | TRAVEL_START + 4 (22 Dec) |
| Check-out | TRAVEL_START + 5 (23 Dec) |
| Room type | Villa |
| Meal plan | MAP — Half Board |
| Confirmation number | VLR-26-88417 |
| Guest names | Priya Nair, Vivek Nair, Aditi Nair, Kabir Nair |

**H2. The Mehtas** — honeymooners arriving today. Seeded, already booked.

Contacts:
- **Arjun Mehta**: +919820144562, arjun.mehta@example.com, Bandra West, Mumbai, Maharashtra, India, customer, source referral, tags `honeymoon`.
- **Kavya Mehta**: +919820377815, kavya.mehta@example.com, Mumbai.

Lead **L01** "Kerala Honeymoon — Kochi & Kumarakom":
- Status won, priority hot, source referral, assigned Sneha Iyer
- Travel date D0, return D0 + 4, 2 adults
- Budget 95000, trip type honeymoon
- Destinations Kochi, Kumarakom

Invoice I-01 is paid. Vouchers V-01 (hotel, confirmed) and V-02 (transport, sent) — see A.7.

Flight detail used in the live trip: IndiGo **6E 6171** BOM→COK, landing at `T_PICK` (computed live).

**H3. Ravi Kumar** — driver. Seeded with `POST /api/v1/fleet/drivers`.

| Field | Value |
|---|---|
| name | Ravi Kumar |
| phone | **+919876543210** (E.164) |
| email | ravi.kumar@example.com |
| licenseNumber | KA05 20190012345 |
| licenseExpiry | 2029-03-14 |
| address | Aluva, Kochi, Kerala |
| emergencyContactName | Lakshmi Kumar (Wife) |
| emergencyContactPhone | +919447158302 |
| dateOfJoining | 2021-06-01 |
| notes | "Malayalam, English, Hindi. All-India tourist permit vehicles." |
| status | active |

- Ratings: 5, 5, 5 and 4 on his completed seeded trips (`POST /fleet/drivers/:id/rate`). Average ≈ 4.8.
- App login: country "+91", number field `9876543210`, OTP `123456`.

**H4. Ravi's vehicle** — `POST /api/v1/fleet/vehicles`:
- registrationNumber **KA 05 MN 4521**
- type muv, make Toyota, model Innova Crysta
- year 2023, seatingCapacity 7, color Silver
- notes "AIT permit · stationed at Kochi desk"
- status available (it must be available for the Scene 6 combobox)

**H5. Live airport trip.** Created in Scene 6. The trip id is written to the handoff file.

| Field | Value |
|---|---|
| Vehicle | KA 05 MN 4521 — Toyota Innova Crysta |
| Driver | Ravi Kumar |
| Start location | Cochin International Airport (COK), Arrival Gate 2 |
| End location | Vembanad Lake Resort, Kumarakom |
| Start date / time | today, `T_PICK` = ceil-to-15-min(nowIST + 50 min) |
| End date / time | today, `T_PICK` + 2 h 15 min |
| Passenger name | Arjun Mehta |
| Passenger phone | 9820144562 |
| Special instructions | "IndiGo 6E 6171 lands {T_PICK}. Meet at Gate 2 with a Mehta name board. Honeymooners, 3 bags." |
| Estimated distance (km) | 82 |
| Estimated fare | 3200 |

**GPS coordinates for the emulator.** `adb emu geo fix` takes **longitude first**:

| Place | Command |
|---|---|
| Cochin International Airport, arrival kerb | `adb emu geo fix 76.4019 10.1520` |
| Vembanad Lake Resort, Kumarakom | `adb emu geo fix 76.4285 9.6177` |
| Aluva (start of the segment, optional) | `adb emu geo fix 76.3516 10.1004` |

### A.4 Contacts (39 seeded; Rohit Bhatia is created live in the walkthrough — do not seed)

| Key | Name | City | Phone | Email | Type / source | Tags / company |
|---|---|---|---|---|---|---|
| C01 | Priya Nair | Bengaluru | +919845023117 | priya.nair@example.com | customer / website | family, kerala |
| C02 | Arjun Mehta | Mumbai | +919820144562 | arjun.mehta@example.com | customer / referral | honeymoon |
| C03 | Kavya Mehta | Mumbai | +919820377815 | kavya.mehta@example.com | customer / referral | honeymoon |
| C04 | Rohan Desai | Pune | +919822051934 | rohan.desai@example.com | customer / referral | repeat, family |
| C05 | Neha Kapoor | New Delhi | +919811064270 | neha.kapoor@example.com | customer / google | honeymoon, maldives |
| C06 | Vikram Singh Rathore | Jaipur | +919414028816 | vikram.rathore@example.com | customer / referral | heritage |
| C07 | Ananya Krishnan | Chennai | +919840017325 | ananya.krishnan@example.com | customer / google | japan |
| C08 | Siddharth Rao | Hyderabad | +919849033618 | siddharth.rao@example.com | customer / referral | corporate · company "Northstar Analytics Pvt Ltd" |
| C09 | Meenakshi Sundaram | Coimbatore | +919443056271 | meenakshi.s@example.com | customer / walkin | pilgrimage, senior-citizens |
| C10 | Aditya Joshi | Ahmedabad | +919825041896 | aditya.joshi@example.com | customer / website | family |
| C11 | Fatima Sheikh | Lucknow | +919415072638 | fatima.sheikh@example.com | customer / website | family, kashmir |
| C12 | Harpreet Kaur | Chandigarh | +919814029573 | harpreet.kaur@example.com | customer / facebook | adventure, ladakh |
| C13 | Karan Malhotra | Gurugram | +919810085412 | karan.malhotra@example.com | customer / google | family, dubai |
| C14 | Divya Menon | Kochi | +919447061825 | divya.menon@example.com | customer / walkin | weekend |
| C15 | Suresh Pillai | Thiruvananthapuram | +919446038214 | suresh.pillai@example.com | customer / referral | repeat |
| C16 | Ishaan Chatterjee | Kolkata | +919830047192 | ishaan.c@example.com | customer / google | europe |
| C17 | Pooja Agarwal | Indore | +919826053017 | pooja.agarwal@example.com | customer / facebook | family |
| C18 | Manish Tiwari | Bhopal | +919425061740 | manish.tiwari@example.com | customer / referral | pilgrimage |
| C19 | Dr. Lakshmi Raghavan | Kochi | +919447122958 | lakshmi.raghavan@example.com | customer / referral | repeat |
| C20 | Sanjay Kulkarni | Nashik | +919823014675 | sanjay.kulkarni@example.com | customer / website | — |
| C21 | Ritu Sharma | Noida | +919811830264 | ritu.sharma@example.com | customer / facebook | adventure, andaman |
| C22 | Nikhil Bansal | Bengaluru | +919845177230 | nikhil.bansal@example.com | customer / facebook | corporate · "Brightpath Software" |
| C23 | Tanvi Deshpande | Mumbai | +919819260417 | tanvi.deshpande@example.com | customer / facebook | anniversary, bali |
| C24 | Arvind Iyer | Bengaluru | +919845290136 | arvind.iyer@example.com | customer / referral | family |
| C25 | Shalini Verma | Jaipur | +919414155790 | shalini.verma@example.com | customer / website | anniversary |
| C26 | Gaurav Saxena | Gurugram | +919810147783 | gaurav.saxena@example.com | customer / google | — |
| C27 | Zoya Khan | Hyderabad | +919849126354 | zoya.khan@example.com | customer / website | — |
| C28 | Anil Hegde | Mangaluru | +919448031672 | anil.hegde@example.com | customer / referral | repeat |
| C29 | Kavitha Reddy | Bengaluru | +919845563021 | kavitha.reddy@example.com | customer / referral | corporate · "Meridian Pharma Ltd" |
| C30 | James Carter | London, UK | +447700900412 | james.carter@example.co.uk | customer / website | international |
| C31 | Emily Carter | London, UK | +447700900518 | emily.carter@example.co.uk | customer / website | international |
| C32 | Ahmed Al Mansoori | Dubai, UAE | +971501234567 | ahmed.almansoori@example.com | customer / referral | international |
| C33 | Sophie Martin | Paris, France | +33612345678 | sophie.martin@example.com | customer / website | international |
| C34 | Kenji Watanabe | Osaka, Japan | +819012345678 | kenji.watanabe@example.com | customer / google | international |
| C35 | Daniel Fernandes | Toronto, Canada | +14165550143 | daniel.fernandes@example.com | customer / referral | nri, goa |
| C36 | Olivia Brown | Sydney, Australia | +61491570156 | olivia.brown@example.com | customer / website | international |
| C37 | Hannah Müller | Munich, Germany | +4915123456789 | hannah.mueller@example.com | customer / website | ayurveda |
| C38 | Rajesh Nair | Singapore | +6591234567 | rajesh.nair@example.com | customer / referral | nri |
| C39 | Joseph D'Souza | Mangaluru | +919448170356 | joseph.dsouza@example.com | **agent** / referral | company "Coastal Trails Travels" (B2B sub-agent) |

**Backdating.** Contacts are spread over the last 9 months by SQL (A.9 #6). This makes "new this month" counts realistic.

### A.5 Leads (25 seeded across stages; Priya's lead, created live, is the 26th)

**How they are seeded**
1. Create each lead with `POST /api/v1/leads`.
2. Move it to its target status with `PUT /api/v1/leads/:id/status`, walking through the intermediate statuses. For example, a `won` lead goes new → contacted → qualified → proposal_sent → won. This gives every lead a realistic activity trail.
3. Unassigned leads omit `assignedTo`.

| Key | Title | Contact | Destinations | Trip type | Travel (D0+) | Pax (A/C) | Budget ₹ | Status | Priority | Source | Assignee |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L01 | Kerala Honeymoon — Kochi & Kumarakom | C02 | Kochi, Kumarakom | honeymoon | 0 (ret +4) | 2/0 | 95,000 | won | hot | referral | Sneha |
| L02 | Maldives Overwater Villa Honeymoon | C05 | Maldives | honeymoon | 45 | 2/0 | 3,20,000 | proposal_sent | hot | google | Farhan |
| L03 | Rajasthan Royal Heritage — 8 days | C30 | Jaipur, Jodhpur, Udaipur | international | 62 | 2/0 | 2,80,000 | negotiation | hot | website | Farhan |
| L04 | Goa Beach Escape — Desai family | C04 | Goa | family | 34 | 2/2 | 85,000 | qualified | warm | referral | Sneha |
| L05 | Ladakh Bike Expedition | C12 | Leh, Nubra Valley, Pangong | adventure | 250 | 4/0 | 2,40,000 | contacted | warm | facebook | Rahul |
| L06 | Dubai Shopping Festival Break | C13 | Dubai | international | 95 | 2/1 | 1,60,000 | proposal_sent | warm | google | Farhan |
| L07 | Bali Island Bliss — Anniversary | C23 | Bali | international | 70 | 2/0 | 1,90,000 | qualified | hot | facebook | Farhan |
| L08 | Singapore Family Fun — Universal & Sentosa | C10 | Singapore | family | 58 | 2/2 | 2,60,000 | negotiation | warm | website | Farhan |
| L09 | Europe Highlights — Paris, Swiss Alps, Rome | C16 | Paris, Interlaken, Rome | international | 200 | 2/0 | 6,50,000 | contacted | warm | google | Farhan |
| L10 | Kashmir Paradise — Gulmarg & Pahalgam | C11 | Srinagar, Gulmarg, Pahalgam | family | 150 | 3/1 | 1,40,000 | new | warm | website | — |
| L11 | Madurai & Rameswaram Temple Trail | C09 | Madurai, Rameswaram, Kanyakumari | pilgrimage | 40 | 4/0 | 75,000 | qualified | warm | walkin | Sneha |
| L12 | Northstar Analytics Offsite — Coorg | C08 | Coorg | corporate | 28 | 24/0 | 7,20,000 | proposal_sent | hot | referral | Rahul |
| L13 | Meridian Pharma Sales Meet — Goa | C29 | Goa | corporate | 55 | 60/0 | 18,00,000 | negotiation | hot | referral | Rahul |
| L14 | Andaman Scuba & Beaches | C21 | Port Blair, Havelock | adventure | 80 | 2/0 | 1,30,000 | new | hot | facebook | — |
| L15 | Munnar Tea Trails Weekend | C14 | Munnar | domestic | 12 | 2/0 | 32,000 | won | warm | walkin | Sneha |
| L16 | Golden Triangle — Delhi, Agra, Jaipur | C33 | Delhi, Agra, Jaipur | international | 110 | 2/0 | 2,20,000 | contacted | warm | website | Farhan |
| L17 | Japan Cherry Blossom — Tokyo & Kyoto | C07 | Tokyo, Kyoto, Osaka | international | 180 | 2/0 | 4,80,000 | new | warm | google | — |
| L18 | Hampi & Badami Heritage Drive | C24 | Hampi, Badami | domestic | 20 | 2/1 | 45,000 | won | warm | referral | Sneha |
| L19 | Kerala Ayurveda Retreat — Kovalam | C37 | Kovalam | international | 65 | 1/0 | 1,10,000 | qualified | warm | website | Sneha |
| L20 | Thailand — Phuket & Krabi | C26 | Phuket, Krabi | international | 48 | 2/0 | 1,45,000 | lost (reason "Chose a cheaper online package") | cold | google | Farhan |
| L21 | Darjeeling & Gangtok Family Holiday | C17 | Darjeeling, Gangtok | family | 90 | 2/2 | 1,20,000 | on_hold | cold | facebook | Sneha |
| L22 | Char Dham Yatra by Helicopter | C18 | Kedarnath, Badrinath | pilgrimage | 210 | 2/0 | 3,50,000 | contacted | warm | referral | Rahul |
| L23 | Goa Christmas Homecoming | C35 | Goa | international | 83 | 4/0 | 1,80,000 | won | warm | referral | Sneha |
| L24 | Udaipur Lake Palace Anniversary | C25 | Udaipur | domestic | 38 | 2/0 | 1,25,000 | new | hot | website | — |
| L25 | Spiti Valley Road Trip | C22 | Spiti, Manali | adventure | 240 | 4/0 | 1,60,000 | new | cold | facebook | — |

**Per-lead extras**

- **Notes** (`POST /leads/:id/notes`):
  - L02: "Neha opened the quote 3 times — prefers a sunset water villa."
  - L03: "Carters want a heritage-hotel night in Jodhpur; asked for a 5% discount."
  - L12: "PO expected after the leadership review on Friday."
  - L13: "Need 30 rooms at one property; shortlisting Candolim."
- **Activities**: L08 gets "Call — discussed Universal Studios add-on". L06 gets "Email — sent Dubai options".

### A.6 Suppliers, rate cards, itinerary templates

**Suppliers** (`POST /api/v1/suppliers`). GST numbers match the backend regex.

| Key | companyName | category | Contact person | Phone | Email | City / State | GST | Preferred |
|---|---|---|---|---|---|---|---|---|
| S01 | Misty Hills Tea Resort | hotel | Joseph Mathew | +914865230118 | reservations@mistyhills.example.com | Munnar / Kerala | 32AAKFM4821K1Z5 | yes |
| S02 | Cardamom County Retreat | hotel | Reshma Varghese | +914869224410 | stay@cardamomcounty.example.com | Kumily / Kerala | 32AACFC5530L1Z2 | yes |
| S03 | Lakes & Lagoons Houseboats | hotel | Biju Antony | +919447301122 | bookings@lakeslagoons.example.com | Alappuzha / Kerala | 32AAEFL6612M1Z9 | yes |
| S04 | Vembanad Lake Resort | hotel | Anitha George | +914812524400 | frontdesk@vembanadresort.example.com | Kumarakom / Kerala | 32AABCV7721N1Z3 | yes |
| S05 | Fort Kochi Heritage Inn | hotel | Thomas Kurian | +914842215870 | hello@fortkochiinn.example.com | Kochi / Kerala | 32AADFF8812P1Z6 | no |
| S06 | Aravalli Palace Hotels | hotel | Mahendra Singh | +912942430011 | sales@aravallipalace.example.com | Udaipur / Rajasthan | 08AAGCA1123Q1Z4 | yes |
| S07 | Candolim Sands Resort | hotel | Lorraine Pereira | +918322489900 | groups@candolimsands.example.com | Candolim / Goa | 30AAHCC2234R1Z7 | yes |
| S08 | IndiGo | airline | Corporate Desk | +911246173838 | corporate@indigo.example.com | Gurugram / Haryana | — | yes |
| S09 | Emirates | airline | Trade Desk | +912266318888 | trade.india@emirates.example.com | Mumbai / Maharashtra | — | no |
| S10 | Malabar Cabs & Coaches | transport | Shibu Paul | +919446620031 | ops@malabarcabs.example.com | Kochi / Kerala | 32AAIFM3345S1Z1 | yes |
| S11 | Rajputana Travels Coaches | transport | Dinesh Choudhary | +919414433210 | fleet@rajputanacoaches.example.com | Jaipur / Rajasthan | 08AAJFR4456T1Z8 | no |
| S12 | Kerala Kathakali Centre | activity_provider | Unni Krishnan | +914842217552 | shows@kathakalicentre.example.com | Kochi / Kerala | — | no |
| S13 | Arabian Dunes Safaris | activity_provider | Imran Patel | +971502233445 | b2b@arabiandunes.example.com | Dubai / Dubai | — | yes |
| S14 | VisaEase Services | visa_agent | Neeta Shah | +912240040400 | desk@visaease.example.com | Mumbai / Maharashtra | 27AAKCV5567U1Z2 | no |

**Rate cards** (`POST /api/v1/rate-cards`)
- Valid from D0 − 2 to `{year+1}-03-31`, unless stated otherwise.
- `currency: 'INR'`.
- The **Kerala rows must match the template prices exactly.**

| Key | name (Service Name) | serviceType | destination | season | cost | selling | unit | supplier |
|---|---|---|---|---|---|---|---|---|
| R01 | Misty Hills Tea Resort — Family Suite (CP) | hotel | Munnar, Kerala | peak | 9,500 | 12,000 | per_room | S01 |
| R02 | Cardamom County Retreat — Plantation Villa (MAP) | hotel | Thekkady, Kerala | peak | 12,500 | 15,500 | per_room | S02 |
| R03 | Lakes & Lagoons — Premium 2-Bedroom Houseboat, all meals | hotel | Alleppey, Kerala | peak | 24,000 | 29,000 | per_day | S03 |
| R04 | Vembanad Lake Resort — Lake View Villa (MAP) | hotel | Kumarakom, Kerala | peak | 14,000 | 17,500 | per_room | S04 |
| R05 | Innova Crysta with chauffeur — Kerala circuit | transport | Kerala | peak | 3,200 | 3,800 | per_day | S10 |
| R06 | Eravikulam National Park + Tea Museum (family of 4) | activity | Munnar, Kerala | peak | 2,400 | 3,200 | per_vehicle | — |
| R07 | Periyar boat cruise + spice plantation walk | activity | Thekkady, Kerala | peak | 2,800 | 3,600 | per_vehicle | — |
| R08 | Kumarakom bird sanctuary sunrise walk | activity | Kumarakom, Kerala | peak | 1,200 | 1,800 | per_vehicle | — |
| R09 | Kathakali performance — Fort Kochi | activity | Kochi, Kerala | peak | 450 | 650 | per_person | S12 |
| R10 | Vembanad Lake Resort — Lake View Villa (MAP) | hotel | Kumarakom, Kerala | off_peak | 10,500 | 13,500 | per_room | S04 |
| R11 | Candolim Sands Resort — Deluxe Sea View (CP) | hotel | Goa | peak | 6,500 | 8,200 | per_room | S07 |
| R12 | Aravalli Palace — Heritage Room (MAP) | hotel | Udaipur, Rajasthan | peak | 9,000 | 11,500 | per_room | S06 |
| R13 | Tempo Traveller 12-seater — Rajasthan circuit | transport | Rajasthan | peak | 4,200 | 5,000 | per_day | S11 |
| R14 | Desert safari with BBQ dinner | activity | Dubai | peak | 2,600 | 3,400 | per_person | S13 |
| R15 | Ubud pool villa (breakfast) | hotel | Bali | shoulder | 7,800 | 9,600 | per_room | — |
| R16 | Universal Studios Singapore ticket | activity | Singapore | peak | 5,600 | 6,400 | per_person | — |
| R17 | Sunset Water Villa (half board) | hotel | Maldives | peak | 38,000 | 46,000 | per_room | — |
| R18 | IndiGo BLR–COK return (economy) | flight | Kochi | peak | 6,800 | 7,600 | per_person | S08 |
| R19 | Emirates BOM–DXB return (economy) | flight | Dubai | peak | 28,000 | 31,500 | per_person | S09 |
| R20 | Mandovi sunset cruise | activity | Goa | off_peak | 1,600 | 2,200 | per_person | — |

**Itinerary templates** (`POST /api/v1/itinerary-templates`)
- `templateData` is a JSON string containing `{days:[{dayNumber,title,description,city,items:[{type,title,description,costPrice,sellingPrice,quantity,taxRate:5,sortOrder}]}], inclusions, exclusions, termsConditions}`.

**T-KER — "Kerala Backwaters & Hills — 5N/6D"** (fully specified)
- Header: destination "Kerala", durationDays 6, category `family`
- Description: "Tea hills of Munnar, spice country in Thekkady, a private houseboat night and a lake-view finale in Kumarakom."
- Days:

| Day | Title | City | Items: type, title, cost/sell × qty |
|---|---|---|---|
| 1 | Arrive Kochi — drive to Munnar | Munnar | transport "Innova Crysta with chauffeur — 6 days (Kochi–Munnar–Thekkady–Alleppey–Kumarakom–Kochi)" 3,200/3,800 × 6 · hotel "Misty Hills Tea Resort — Family Suite (CP), 2 nights" 9,500/12,000 × 2 |
| 2 | Munnar tea country | Munnar | activity "Eravikulam National Park + Tea Museum (family of 4)" 2,400/3,200 × 1 |
| 3 | Thekkady spice trails | Thekkady | hotel "Cardamom County Retreat — Plantation Villa (MAP)" 12,500/15,500 × 1 · activity "Periyar boat cruise + spice plantation walk" 2,800/3,600 × 1 |
| 4 | Alleppey houseboat | Alleppey | hotel "Lakes & Lagoons — Premium 2-Bedroom Houseboat, all meals" 24,000/29,000 × 1 |
| 5 | Kumarakom backwaters | Kumarakom | hotel "Vembanad Lake Resort — Lake View Villa (MAP)" 14,000/17,500 × 1 · activity "Kumarakom bird sanctuary sunrise walk" 1,200/1,800 × 1 |
| 6 | Depart Kochi | Kochi | (no items; description "Drop at Cochin International Airport.") |

- Totals: cost **95,100**, selling **1,17,400**, tax 5% **5,870**, grand total **1,23,270**.
- Inclusions and exclusions: as in A.1 itinerary defaults.

**Other templates.** Two to four items each, priced from the rate cards above where a rate card exists, otherwise a realistic number:

| Key | Title | Destination | Days | Category | Day titles |
|---|---|---|---|---|---|
| T-RAJ | Rajasthan Royal Heritage — 7N/8D | Rajasthan | 8 | heritage | Jaipur arrival · Amber Fort & City Palace · Drive to Jodhpur · Mehrangarh · Ranakpur to Udaipur · Lake Pichola · Udaipur leisure · Depart |
| T-GOA | Goa Beach Escape — 4N/5D | Goa | 5 | beach | Arrive North Goa · Old Goa & Panjim · South Goa beaches · Spice farm & cruise · Depart |
| T-LAD | Ladakh High Passes — 6N/7D | Ladakh | 7 | adventure | Leh acclimatisation · Monasteries · Khardung La to Nubra · Nubra to Pangong · Pangong to Leh · Leh leisure · Depart |
| T-DXB | Dubai City & Desert — 4N/5D | Dubai | 5 | family | Arrival & Marina cruise · Burj Khalifa & Dubai Mall · Desert safari · Abu Dhabi day trip · Depart |
| T-BAL | Bali Island Bliss — 6N/7D | Bali | 7 | honeymoon | Arrive Seminyak · Ubud rice terraces · Kintamani · Nusa Penida · Spa day · Uluwatu sunset · Depart |
| T-SIN | Singapore Family Fun — 4N/5D | Singapore | 5 | family | Arrival & Night Safari · Universal Studios · Sentosa · Gardens by the Bay · Depart |
| T-MLD | Maldives Overwater Honeymoon — 4N/5D | Maldives | 5 | honeymoon | Seaplane arrival · Snorkel safari · Sandbank picnic · Spa & sunset cruise · Depart |
| T-EUR | Europe Highlights — Paris, Swiss Alps, Rome — 9N/10D | Europe | 10 | custom | Paris ×3 · Interlaken ×3 · Rome ×3 · Depart |
| T-KAS | Kashmir Paradise — 5N/6D | Kashmir | 6 | mountain | Srinagar houseboat · Gulmarg gondola · Pahalgam · Betaab Valley · Shikara ride · Depart |

### A.7 Money: invoices, payments, credit notes, vouchers

**Invoices** (`POST /api/v1/invoices`)
- Status is reached by payments: partial payment gives `partially_paid`, full payment gives `paid`.
- `sent` and `overdue` are set by SQL (A.9 #7), so no email is queued.
- `void` uses `POST /invoices/:id/void`.
- All invoices carry GST 5% (`taxRate: 5`) unless stated.

| Key | Contact / Lead | Type | Lines (description — rate) | Total ₹ | Target status | Created (D0−) | Due |
|---|---|---|---|---|---|---|---|
| I-01 | C02 / L01 | tax_invoice | "Kerala Honeymoon — 4N/5D, Kochi & Kumarakom" 88,000 · "Airport transfers & sightseeing — Innova Crysta" 7,000 | 99,750 | paid | 32 | D0−2 |
| I-02 | C14 / L15 | tax_invoice | "Munnar Tea Trails — 2N weekend package" 32,000 | 33,600 | paid | 9 | D0+3 |
| I-03 | C24 / L18 | tax_invoice | "Hampi & Badami heritage drive — 3N" 45,000 | 47,250 | paid | 6 | D0+5 |
| I-04 | C35 / L23 | proforma | "Goa Christmas Homecoming — villa 5N + transfers" 1,71,430 | 1,80,000 | partially_paid | 21 | D0+40 |
| I-05 | C04 / — | tax_invoice | "Coorg coffee estate weekend — 2N (May)" 38,000 | 39,900 | paid | 140 | D0−110 |
| I-06 | C08 / L12 | proforma | "Northstar Analytics offsite — 25% advance" 1,90,476 | 2,00,000 | sent | 4 | D0+10 |
| I-07 | C13 / L06 | proforma | "Dubai Shopping Festival — 30% deposit" 45,714 | 48,000 | sent → overdue | 20 | **D0−6** |
| I-08 | C05 / L02 | proforma | "Maldives water villa — booking deposit" 47,619 | 50,000 | partially_paid | 12 | D0+15 |
| I-09 | C21 / L14 | tax_invoice | "Andaman scuba week — 5N" 1,20,000 | 1,26,000 | draft | 1 | D0+30 |
| I-10 | C06 / — | tax_invoice | "Jaisalmer desert camp — 2N (July)" 52,000 | 54,600 | paid | 80 | D0−55 |
| I-11 | C26 / L20 | tax_invoice | "Phuket & Krabi package — 5N" 1,38,095 | 1,45,000 | cancelled (void) | 25 | — |
| I-12 | C09 / L11 | proforma | "Temple trail — advance" 30,000 | 31,500 | partially_paid | 10 | D0+20 |

**Payments.** `POST /api/v1/payments` with `{invoiceId, amount, date, method, reference}`. Dates are set through the `date` field.

| Invoice | Amount ₹ | Date | Method | Reference |
|---|---|---|---|---|
| I-01 | 50,000 | D0−30 | transfer | UTR 361800211547 |
| I-01 | 49,750 | D0−7 | transfer | UTR 362000874412 |
| I-02 | 33,600 | D0−1 | other | UPI 6291 4408 1732 |
| I-03 | 47,250 | D0−0 (today) | card | POS 448812 |
| I-04 | 90,000 | D0−18 | transfer | UTR 361900553201 |
| I-05 | 39,900 | D0−138 | transfer | UTR 358700112908 |
| I-08 | 25,000 | D0−10 | other | UPI 6288 1023 5521 |
| I-10 | 54,600 | D0−78 | check | CHQ 004417 |
| I-12 | 15,000 | D0−8 | cash | Receipt 0912 |
| I-04 | 20,000 | D0−2 | transfer | UTR 362100104455 |

**Credit note.** One, via `POST /api/v1/credit-notes`: invoice I-05, reason "Coffee plantation tour cancelled due to rain", item "Plantation tour refund" ×1 @ 2,500.

**Vouchers** (`POST /api/v1/vouchers`; status changed with `PATCH /vouchers/:id/status`):

| Key | Lead | Type | Title | Details | Status |
|---|---|---|---|---|---|
| V-01 | L01 | hotel | Vembanad Lake Resort — Mehta honeymoon | hotelName "Vembanad Lake Resort, Kumarakom"; checkIn D0; checkOut D0+2; roomType "Villa"; roomCount 1; mealPlan "MAP"; confirmationNumber "VLR-26-88102"; guestNames ["Arjun Mehta","Kavya Mehta"]; specialRequests "Honeymoon cake and flower bed decoration" | confirmed |
| V-02 | L01 | transport | Airport pickup & local sightseeing — Mehta | vehicleType "Innova"; pickupLocation "Cochin International Airport (COK)"; dropLocation "Vembanad Lake Resort, Kumarakom"; pickupTime D0 | sent |
| V-03 | L15 | hotel | Misty Hills Tea Resort — Menon weekend | Munnar; D0+12 → D0+14; Deluxe; CP; "MHT-26-4410" | confirmed |
| V-04 | L23 | flight | IndiGo 6E 2715 — Fernandes family | airline IndiGo; flightNumber 6E 2715; BOM→GOI; departure D0+83 07:10; arrival 08:25; PNR "Q7XK2M"; economy; passengers 4 names | sent |
| V-05 | L18 | hotel | Hampi heritage stay — Iyer family | "Kishkinda Heritage Resort, Hampi"; D0+20 → D0+22 | draft |
| V-06 | L04 | activity | Mandovi sunset cruise — Desai family | activityName "Mandovi sunset cruise"; dateTime D0+35 17:30; meetingPoint "Santa Monica Jetty, Panaji" | draft |

### A.8 Fleet

**Vehicles** (`POST /api/v1/fleet/vehicles`; status set with `PUT /vehicles/:id/status`):

| Reg. no. | Type | Make / Model | Year | Seats | Colour | Status | Notes |
|---|---|---|---|---|---|---|---|
| KA 05 MN 4521 | muv | Toyota / Innova Crysta | 2023 | 7 | Silver | available | Ravi |
| KA 03 AB 7788 | muv | Toyota / Innova Crysta | 2022 | 7 | White | on_trip (via T04) | Suresh |
| KA 51 C 2210 | tempo_traveller | Force / Tempo Traveller 12-seater | 2022 | 12 | White | available | Insurance expires D0+12 (document upload) |
| KA 01 AH 9034 | sedan | Maruti Suzuki / Dzire | 2024 | 4 | Pearl White | available | Bengaluru |
| KA 05 ND 6612 | sedan | Hyundai / Aura | 2023 | 4 | Grey | available | Bengaluru |
| MH 02 EZ 6127 | suv | Toyota / Fortuner | 2023 | 7 | Black | available | Mumbai branch |
| MH 12 RT 3390 | muv | Maruti Suzuki / Ertiga | 2021 | 6 | Grey | under_maintenance | Brake service |
| MH 04 KP 1845 | mini_bus | Tata / Winger 20-seater | 2020 | 20 | White | available | Group movements |

**Maintenance.** MH 12 RT 3390 gets a "Brake service" record via `POST /vehicles/:id/maintenance`:
- serviceType brake_service, serviceDate D0−1, odometer 61,240
- cost 8,400, vendor "Sri Lakshmi Motors, Pune"
- nextServiceDueDate D0+180

**Vehicle document.** KA 51 C 2210 gets a document via `POST /vehicles/:id/documents` (multipart):
- type insurance, expiry D0+12
- file `insurance-policy.pdf`, a 1-page PDF generated by the seeder

**Drivers** (`POST /api/v1/fleet/drivers`; status via `PUT /drivers/:id/status`):

| Name | Phone | Licence no. / expiry | Status | Notes |
|---|---|---|---|---|
| Ravi Kumar | +919876543210 | KA05 20190012345 / 2029-03-14 | active | Hero (A.3) |
| Suresh Babu | +919845012345 | KL07 20170034567 / 2028-08-30 | on_trip (via T04) | |
| Manjunath Gowda | +919900112233 | KA01 20180056789 / 2030-01-11 | active | |
| Abdul Rasheed | +919447123456 | KL43 20160078901 / 2027-05-19 | active | |
| Prakash Shinde | +919820456789 | MH12 20150090123 / 2027-12-02 | off_duty | |
| Joseph Varghese | +919496234567 | KL39 20140012345 / **D0+20** (shows in expiry alerts) | on_leave | |

**Fleet rate cards** (`POST /api/v1/fleet/vehicle-rate-cards`):

| Name | vehicleType | tripType | Pricing |
|---|---|---|---|
| Innova Crysta — Airport pickup (Kochi) | muv | airport_pickup | baseFare 1500, perKmRate 18, minKm 40 |
| Dzire — Airport transfer (Bengaluru) | sedan | airport_drop | flatRate 1400 |
| Innova Crysta — Outstation | muv | outstation | perKmRate 18, minKm 250, driverAllowance 400, nightCharge 250 |
| Tempo Traveller 12 — Outstation | tempo_traveller | outstation | perKmRate 24, minKm 300, driverAllowance 500 |
| Dzire — Local 8hr/80km | sedan | local_8h80km | flatRate 2200, extraKmRate 14, extraHourRate 180 |
| Fortuner — Local 12hr/120km | suv | local_12h120km | flatRate 5500, extraKmRate 24, extraHourRate 300 |

**Trips** (`POST /api/v1/fleet/trips`, backend field names)
- Status is advanced with admin `PUT /fleet/trips/:id/status` in sequence: accepted → en_route → started → completed.
- Afterwards, SQL A.9 #8 back-dates the timeline rows so they read like real history.

| Key | Driver / vehicle | Pickup → drop | When | Passenger (contactId) | tripType | km | ₹ | Final status |
|---|---|---|---|---|---|---|---|---|
| T01 | Ravi / KA 05 MN 4521 | Cochin International Airport (COK) → Fort Kochi Heritage Inn | D0−1 10:30–11:45 | James Carter (C30) | airport_pickup | 42 | 1,900 | completed, rated 5 |
| T02 | Ravi / KA 05 MN 4521 | Fort Kochi Heritage Inn → Misty Hills Tea Resort, Munnar | D0−2 08:00–12:30 | Divya Menon (C14) | one_way | 130 | 5,200 | completed, rated 5 |
| T03 | Manjunath / KA 01 AH 9034 | Kempegowda International Airport (BLR), T2 → Indiranagar, Bengaluru | D0−1 21:10–22:20 | Arvind Iyer (C24) | airport_pickup | 38 | 1,400 | completed, rated 4 |
| T04 | Suresh / KA 03 AB 7788 | Fort Kochi Heritage Inn → Cochin International Airport (COK) | today, start = now−40 min, end = now+20 min | Dr. Lakshmi Raghavan (C19) | airport_drop | 45 | 1,950 | **started** (live, in progress) |
| T05 | Abdul / KA 51 C 2210 | Ernakulam South Railway Station → Guruvayur Temple | D0+1 06:00–09:00 | Meenakshi Sundaram (C09) | one_way | 85 | 4,600 | accepted |
| T06 | Prakash / MH 02 EZ 6127 | Bandra West, Mumbai → Chhatrapati Shivaji Maharaj International Airport (BOM), T2 | D0+3 04:45–05:45 | Tanvi Deshpande (C23) | airport_drop | 18 | 1,600 | assigned |
| T07 | Ravi / KA 05 MN 4521 | Cochin International Airport (COK) → Cardamom County Retreat, Thekkady | D0+5 13:00–17:30 | Hannah Müller (C37) | outstation | 145 | 5,600 | assigned (Ravi's Upcoming tab) |
| T08 | Abdul / KA 51 C 2210 | Kochi → Munnar | D0−3 | Gaurav Saxena (C26) | outstation | 130 | 6,800 | cancelled ("Client postponed travel") |
| T09 | Joseph / MH 12 RT 3390 | Pune Station → Lonavala | D0−6 | Sanjay Kulkarni (C20) | round_trip | 140 | 4,900 | completed, rated 4 |
| T10 | Ravi / KA 05 MN 4521 | Vembanad Lake Resort, Kumarakom → Cochin International Airport (COK) | D0−9 | Rajesh Nair (C38) | airport_drop | 80 | 3,100 | completed, rated 5 |

**Trip extras**
- **Trip costs** (`POST /trips/:id/costs`):
  - T02: fuel ₹1,850 "Diesel — Aluva"; toll ₹215 "Kochi bypass toll".
  - T09: parking ₹200.
- **Before T04 is seeded**: all trips use `autoCreateVoucher: false`. T01 includes `contactId` so the walkthrough can demonstrate "Generate invoice".

### A.9 SQL fixups (run by `seed-demo.mjs` via `wrangler d1 execute travelcrm-master --local`)

**General rules**
- Generate UUIDv7 ids in Node for every inserted row.
- Read exact column names from `backend/drizzle/tenant/*.sql` and `backend/drizzle/master/*.sql` before writing the inserts.
- Local dev uses **one** D1 database for master and tenant tables.

**The fixups**

1. **Erase test-looking identities created by `/test/reset`.**
   - `DELETE FROM tenant_users WHERE email IN ('admin@e2e.test','sales@e2e.test','viewer@e2e.test')`.
   - `DELETE FROM users WHERE email LIKE '%@e2e.test'`. If FK constraints block it, `UPDATE` the rows to `is_active=0`, `email='former.staff.N@example.com'`, `name='Former staff N'`. Prefer DELETE.
   - `UPDATE tenants SET company_name='Malabar Coast Travels', subdomain='malabarcoast' WHERE id='00000000-0000-0000-0000-000000000000'`.
   - `UPDATE tenants SET company_name='Sahyadri Holidays' WHERE id='01960000-0000-7000-8000-000000000001'`.
2. **Optional rename of the login email** (gives a nicer sign-in chapter):
   - Run `UPDATE users SET email='ananya.menon@example.com' WHERE id='01960000-0000-7000-8000-0000000000a1'` and the same for `tenant_users` where `user_id` matches.
   - Then verify the login with `POST /auth/login`.
   - **Fallback:** if that login fails, revert to `admin@demo.com` and make the walkthrough's sign-in chapter type that email.
   - The showcase specs read `DEMO_EMAIL` from `seed.json`.
3. **Staff appear real.** For the 5 invited staff:
   - set `invite_status='accepted'`, `is_active=1`, `last_login_at` = within the last 2 days;
   - set `password_hash` = bcrypt of a random string (no one logs in as them).
4. **Super admin.** `INSERT OR REPLACE INTO super_admins (id,email,name,password_hash,role,is_active) VALUES (uuid, <DEMO_EMAIL>, 'Ananya Menon', <bcrypt random>, 'super_admin', 1)`.
5. **Platform tenants** for the Super Admin chapter. Insert 4 more rows into `tenants`, with `status='active'`, staggered `created_at`, and `max_users` filled in:
   - Coastal Escapes Goa (pro)
   - Himalayan Trails Manali (basic)
   - Royal Rajputana Tours (pro)
   - Gulf Gateway Travels Dubai (enterprise)
6. **Backdate history** so charts and "this month" KPIs look lived-in:
   - `contacts.created_at`: spread over D0−270 … D0−1. Priya: D0−2. Mehtas: D0−40.
   - `leads.created_at`: L01 D0−45; won/lost leads 20–60 days ago; new leads 0–5 days ago.
   - `invoices.created_at` and `updated_at`: per the "Created" column in A.7.
   - `lead_activities.created_at`: aligned with each lead.
7. **Invoice states.**
   - I-06 and I-07: `UPDATE invoices SET status='sent' …`.
   - I-07: `status='overdue'` if the UI uses that status; otherwise keep `sent` with a past due date.
   - Make sure `balance_due` is consistent.
8. **Trip timeline realism.** Shift `trip_timeline.created_at` for T01–T10 so the rows sit at the trip's actual times. Fill `trip_assignments.en_route_at`, `started_at` and `completed_at` the same way.
9. **Content tables that have no non-AI creation path.** Insert realistic rows; skip any table that does not exist:
   - **`message_log`** — 12 rows, direction mixed, statuses delivered/read. Examples:
     - out WhatsApp to Neha Kapoor: "Hi Neha, sharing two sunset water-villa options for your dates. Shall I hold one?" (read)
     - in WhatsApp from Neha: "The second one looks perfect! Can you check the seaplane timing?"
     - out email to James Carter: "Your Rajasthan heritage itinerary (revised)"
     - in SMS from Tanvi: "Can we add one more night in Ubud?"
     - out WhatsApp to Arjun Mehta: "Your driver Ravi Kumar (+91 98765 43210) will meet you at Arrival Gate 2 — KA 05 MN 4521."
   - **`notifications`** for Ananya, 5 unread and 1 read (`title` / `message` / `type` / `reference_type` / `reference_id`):
     - "Payment received" / "₹47,250 received against SH-INV for Arvind Iyer" / payment_received / invoice / I-03
     - "Follow-up due at 11:30" / "Call Neha Kapoor about the Maldives quote" / follow_up_reminder / lead / L02
     - "Insurance renewal due in 12 days" / "KA 51 C 2210 · Force Tempo Traveller" / system
     - "Task assigned to you" / "Send revised Maldives quote to Neha Kapoor" / task_assigned / task
     - "Overdue invoice" / "Dubai deposit for Karan Malhotra is 6 days overdue" / system / invoice / I-07
     - (read) "Lead assigned to you" / "Udaipur Lake Palace Anniversary" / lead_assigned / lead / L24
   - **`ai_lead_scores`**:

     | Lead | Score | Category |
     |---|---|---|
     | L02 | 86 | hot |
     | L03 | 81 | hot |
     | L13 | 78 | hot |
     | L07 | 74 | warm |
     | L12 | 72 | warm |
     | L08 | 69 | warm |
     | L04 | 63 | warm |
     | L05 | 48 | warm |
     | L25 | 31 | cold |
     | L21 | 22 | cold |

     - `signals` JSON, for example `[{"name":"Budget fits destination","value":0.9,"weight":0.25,"contribution":22},{"name":"Replied within 1 hour","value":1,"weight":0.2,"contribution":20},{"name":"Travel date within 60 days","value":0.8,"weight":0.2,"contribution":16}]`.
     - `breakdown` JSON.
     - `model_used` 'claude-sonnet'.
   - **`ai_recommendations`**, 4 rows, status new:
     - "Neha Kapoor viewed the Maldives quote 3 times — call today"
     - "Offer a 2-night Munnar add-on to the Desai family"
     - "Hold Coorg group rate for Northstar before 15 Oct"
     - "Send reminders on 1 overdue deposit (₹48,000)"
   - **`ai_extractions`**, 3 pending, parsed from emails:
     - Kavitha Reddy: "Team of 60, Goa, last week of Jan, need conference hall"
     - Olivia Brown: "Kerala + Sri Lanka in Feb for 2"
     - Zoya Khan: "Umrah package enquiry, 4 adults, March"
   - **`smart_followups` / `ai_smart_followups`**: 2 rows (L07 and L16) with drafted WhatsApp text.
   - **`document_scans`**: 1 passport scan for Karan Malhotra, with extracted fields and status pending.
   - **`chatbot_config`**: channel 'web', enabled, greeting "Hi! I'm Sahyadri's travel assistant. Where would you like to go?"
   - **`chatbot_conversations`**, 3 rows:
     - "Meera" — Andaman honeymoon (active)
     - "Rahul S" — Goa New Year prices (handed_off)
     - "Visitor 2041" — visa for Dubai (closed)
     - Messages in realistic JSON.
   - **Call log table** (`call_logs` / `calls`), 6 rows:
     - outbound to Neha Kapoor, 6m12s, answered
     - inbound from Karan Malhotra, missed
     - outbound to James Carter, 11m40s, answered
     - and similar.
   - **`marketing_opt_outs`**: Zoya Khan (email) and Sanjay Kulkarni (WhatsApp).
10. **Pre-roll** (run by the orchestrator immediately before Story Part A, not at seed time):
    - insert Priya's inbound WhatsApp, `now − 2 min`;
    - insert notification "New WhatsApp enquiry" / "Priya Nair: family of 4, Kerala, 5 nights" / system / contact / C01, `now − 2 min`, unread;
    - `DELETE FROM driver_otp_log`.
11. **Between takes** (after story Part B, before the walkthrough):
    - `UPDATE message_log SET status='delivered', sent_at=COALESCE(sent_at,created_at) WHERE status IN ('queued','failed')`;
    - `DELETE FROM driver_otp_log`.

### A.10 Tasks, follow-ups, calendar (all relative to D0)

**Tasks** (`POST /api/v1/tasks`; body uses snake_case `due_date`, `assigned_to`, `related_lead_id`):

| Task | Priority | Due | Assignee | Related | Status |
|---|---|---|---|---|---|
| Send revised Maldives quote to Neha Kapoor | high | D0 12:00 | Ananya | L02 | todo |
| Call Vembanad Lake Resort to confirm the Mehtas' honeymoon cake | medium | D0 16:00 | Deepa | L01 | in_progress |
| Collect passport copies — Malhotra family (Dubai) | high | D0 | Farhan | L06 | todo |
| Follow up on Northstar offsite PO | medium | D0+1 | Rahul | L12 | todo |
| Renew insurance — KA 51 C 2210 Tempo Traveller | medium | D0+7 | Deepa | — | todo |
| Reconcile September supplier payments | low | D0−1 | Vikram | — | todo (overdue) |
| Publish Diwali Getaways flyer on Instagram | low | D0−1 | Ananya | — | done |

Add one comment on the Maldives task: "Neha prefers a sunset villa — use the second option."

**Follow-ups** (`POST /api/v1/follow-ups`; created by Ananya, so they count on her dashboard):

| Lead | Scheduled | Type | Notes |
|---|---|---|---|
| L02 | D0 11:30 | call | "Discuss seaplane timing and villa choice" |
| L07 | D0 15:00 | whatsapp | "Share Ubud villa photos" |
| L03 | D0 18:00 | email | "Send revised Rajasthan quote with 5% discount" |
| L08 | D0−1 10:00 | call | "Universal Studios add-on" (overdue) |
| L12 | D0+2 11:00 | visit | "Meet Siddharth at Northstar office, HITEC City" |

**Calendar events** (`/api/v1/events`; read the planner route for field names):

| Event | Time | Type | Location |
|---|---|---|---|
| Team stand-up | D0 09:30–09:45 | meeting | Indiranagar office |
| Supplier call — Lakes & Lagoons Houseboats | D0 11:00–11:30 | call | — |
| Mehta arrival — Kochi airport | D0, ~T_PICK estimate, 1 h | reminder | — |
| Diwali campaign review | D0 17:00–17:30 | meeting | — |
| Northstar site visit — Coorg | D0+4 all day | — | — |

**Sticky notes** (`POST /sticky-notes`):
- "Diwali flyers go live Monday" (yellow)
- "Ask Deepa about houseboat availability for Christmas week" (blue)

### A.11 Communication and marketing

**Message templates** (`POST /api/v1/templates`):

| Name | Channel | Category | Subject / content |
|---|---|---|---|
| Quotation — Kerala family package | email | quotation | Subject "Your Kerala holiday plan — {{destination}}". Content: a 5-line quote body with `{{customer_name}}`, `{{amount}}`, `{{agent_name}}`. |
| Booking confirmed | whatsapp | booking | "Hi {{first_name}}, your {{destination}} trip is confirmed for {{travel_date}}. We'll share vouchers shortly. — Sahyadri Holidays" |
| Payment reminder — gentle | email | reminder | Subject "A gentle reminder — {{destination}} trip". Content mentions `{{amount}}`. |
| Driver details — airport pickup | whatsapp | booking | "Hi {{first_name}}, your driver {{driver_name}} ({{driver_phone}}) will meet you at the arrival gate with a name board." — **the walkthrough creates a variant of this live, so seed this one as "Driver details — hotel pickup".** |
| Happy anniversary | whatsapp | wish | "Happy anniversary, {{first_name}}! Wishing you many more journeys together. — Team Sahyadri" |
| Visa documents checklist | email | visa | Subject "Documents needed for your {{destination}} visa" |

**Segments** (`POST /api/v1/marketing/segments` with `filtersJson`; read the rule-builder field names from `marketing/segments/new/page.tsx`):
- "Families with kids"
- "Honeymooners"
- "High-value clients (₹2L+)"
- "Kerala enquiries — last 90 days"

**Campaigns** (`POST /api/v1/marketing/campaigns`):
- **"Diwali Getaways 2026 — Goa & Udaipur"**: type email, segment "Families with kids"; then via SQL status 'sent', `sent_at` D0−6, plus stats (sent 412, opened 188, clicked 47) if the columns exist.
- **"Winter in Europe — early bird"**: email, scheduledAt D0+5 10:00 (scheduled).
- **"Monsoon Munnar weekends"**: whatsapp, status draft.

**WhatsApp campaign** (`POST /api/v1/whatsapp-campaigns`): "Diwali greetings to past travellers", draft.

**Flyers.**
- If `GET /marketing/flyer-templates` is empty, create 3 templates: "Festival offer", "Destination spotlight", "Last-minute deal".
- Create 1 flyer "Diwali Getaways — Goa from ₹24,999".

---

### A.12 Feature gates and plan

- The demo tenant's plan is `enterprise`. That enables `voip_calling`, `ai_assistant`, `ai_extraction`, `ai_intelligence`, `ai_chatbot` and `whatsapp_campaigns` with no overrides.
- **No `tenant_feature_flags` rows may exist.** The seeder asserts `GET /ai/settings` returns `enabled:true` for all six gated keys.
- **No AI provider is available** (no Anthropic key, AI binding stripped). Therefore:
  - nothing on camera may click a button that calls an LLM ("Generate", "Score lead", "Ask", "Scan" with upload, chatbot replies);
  - AI chapters show the **seeded** data only.
- The usage cap table should have generous caps (`ai_actions_per_day` 500, current 37) so no "cap exceeded" banners appear. Insert these into `tenant_usage_caps` if the table is empty.

### A.13 Banned and required strings (enforced by the gate)

- **Banned in rendered DOM text and in seeded data** (regex, case-sensitive unless noted):
  - `\bE2E\b`
  - `Showcase`
  - `\bTest\s` (except the app-chrome allowlist in D.9)
  - `(?i)lorem`
  - `e2e\.test`
  - `Demo Admin`
  - `Demo Travels`
  - `Test Agency`
  - `Seed (Origin|Destination)`
  - `\[object Object\]`
  - `Invalid Date`
  - `\bNaN\b`
  - `\bundefined\b`
  - `\[(Destination|Amount|Travel Date|Pax Count|\.\.\.)\]`
  - `TravelCRM` used as a **company** name in message bodies. The product name in the sidebar logo is allowed.
- **Must render on camera at the stated shots:**
  - "Sahyadri Holidays" — Settings, PDFs, sidebar tenant name if shown
  - "Ananya Menon" — sidebar user menu

---

## B. Story cut — "A day at Sahyadri Holidays" (target 10:00, hard limits 8:00–12:00)

### B.0 Structure and handoffs

| Seg | Scenes | Source | Target |
|---|---|---|---|
| Intro | — | `cards/intro.html` → 5 s clip | 0:05 |
| **Part A** | 1–6 | Playwright `story-A` (one context, one video) | about 6:55 |
| **Phone** | 7 | Emulator + composite | about 1:40 |
| **Part B** | 8–9 | Playwright `story-B` (new context, same storageState) | about 1:30 |
| Outro | — | `cards/outro.html` → 6 s clip | 0:06 |

**Handoff A → Phone.** Part A writes `desktop/showcase/.handoff.json`:

```json
{ "tripId": "<uuid>", "driverPhoneLocal": "9876543210", "driverPhoneE164": "+919876543210",
  "otp": "123456", "tenantId": "01960000-0000-7000-8000-000000000001",
  "tPick": "14:45", "pickup": "Cochin International Airport (COK), Arrival Gate 2",
  "drop": "Vembanad Lake Resort, Kumarakom", "passenger": "Arjun Mehta",
  "priyaLeadId": "...", "priyaInvoiceId": "...", "priyaVoucherId": "...", "itineraryId": "...",
  "frozenFrame": "desktop/showcase/.work/trip-assigned.png", "recordedAt": "<ISO>" }
```

**Handoff Phone → B**
- Part B reads `tripId` from the same file.
- Part B saves `.work/trip-completed.png`, which is used for the crossfade at the end of the phone composite.

**Retake rules** (no on-camera failures, ever)
- **Part A fails:** reseed (A.9 including pre-roll) and rerun Part A. A maximum of 2 retakes.
- **Driver fails:**
  1. `DELETE /fleet/trips/:id`.
  2. Create a clone trip via API with identical fields: Ravi, the same vehicle, `T_PICK`, the same texts.
  3. Rewrite `tripId` in the handoff.
  4. Rerun the driver segment.
  - Part A is not re-recorded, because the trip id is never visible on camera.
- **Part B fails:** rerun Part B. It is read-only.

**Common rules for every shot**
- **Captions** are lower-thirds of 12 words or fewer, shown with `say()`.
- **Hold time** = max(2.2 s, 1.0 s + 55 ms × characters).
- **Scene cards** use `card()`, 2.6 s.
- **Deep links are allowed only while a card is on screen.** Everything else is clicked through the sidebar or in-page controls.
- **"Visible"** items are assertions (`expect(...).toBeVisible()`) made **before** the caption appears. If one fails, the take is aborted.

---

### Scene 1 — A new enquiry arrives (target 40 s) · Part A

**Start state**
- Context logged in, URL `/dashboard`.
- Pre-roll SQL ran less than 2 minutes earlier.

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 1.0 | 2.6 | /dashboard | `card({kicker:'Scene 1', title:'A new enquiry arrives', subtitle:'WhatsApp, email and web enquiries in one inbox'})` | — | — |
| 1.1 | 5 | /dashboard | Dwell 1.2 s. `moveTo` the bell (`header button:has(svg.lucide-bell)`, or `getByRole('button',{name:/notifications/i})` once B5 adds aria-labels), then click. | "A new WhatsApp enquiry, the moment it arrives" | Dropdown shows "New WhatsApp enquiry" and "Priya Nair: family of 4, Kerala, 5 nights" |
| 1.2 | 3 | — | Press `Escape`. Click sidebar `aside a[href="/communication"]` ("Inbox"). With FR-9, clicking the notification instead is fine. | — | — |
| 1.3 | 8 | /communication | Dwell. Hover the first row. | "Every client conversation, every channel, one shared inbox" | First row: "Priya Nair", tag "WHATSAPP", preview starts "Hi! We're a family of four" |
| 1.4 | 7 | /communication | Click the row; the side sheet opens with the full text. `moveTo`, then click "Open full conversation". | "Full context before anyone replies" | Sheet text contains "Munnar" |
| 1.5 | 6 | /communication/{C01} | Dwell on the thread. Slow scroll 1 step. | "Next: turn this message into a qualified lead" | Header "Priya Nair", subtitle with email and phone |

### Scene 2 — Capture and qualify the lead (target 80 s)

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 2.0 | 2.6 | — | `card('Scene 2','Capture and qualify the lead','A structured lead in under a minute')` | — | — |
| 2.1 | 4 | /leads | Click sidebar `a[href="/leads"]`. Dwell. | "Your whole pipeline, searchable and filterable" | Table has at least 20 rows; "Maldives Overwater Villa Honeymoon" is visible |
| 2.2 | 2 | /leads/new | Click "New lead". | — | h1 "New lead" |
| 2.3 | 6 | | `pickRelation(trigger: /Select a contact/, search:'Search contacts...', type:'Priya', option:'Priya Nair')` | "Linked to Priya's record — nothing typed twice" | Trigger shows "Priya Nair" |
| 2.4 | 10 | | Type Title `#title` "Kerala Backwaters Family Holiday". In the destination input (placeholder "Type & press Enter..."), type each of "Munnar", "Thekkady", "Alleppey", "Kumarakom", pressing Enter after each. | — | 4 tags are shown |
| 2.5 | 8 | | Trip Type `#tripType` → "Family". Travel Date (trigger "Pick travel date") → TRAVEL_START. Return Date ("Pick return date") → TRAVEL_START + 5. | "Dates, travellers and budget captured up front" | — |
| 2.6 | 6 | | `#paxAdults` select-all, type "2". `#paxChildren` type "2". Budget (`fieldByLabel('Budget')`) type "125000". | — | Budget shows ₹1,25,000 |
| 2.7 | 6 | | Priority `#priority` → "Hot". Source `#source` → "website" (displays "Website"). Assigned To: `pickRelation(/Select agent/, 'Search team...', 'Ananya', 'Ananya Menon')`. | — | — |
| 2.8 | 6 | | `#specialRequirements` type (delay 25): "Kids aged 8 and 11. One houseboat night, a tea-estate stay in Munnar, vegetarian meals." | — | — |
| 2.9 | 4 | → /leads | Click "Save Lead". | "Saved and assigned in one click" | Toast "Lead created successfully" |
| 2.10 | 5 | /leads | Type "Priya" into the search box ("Search…"). Click the row "Kerala Backwaters Family Holiday". | — | Detail h1 "Kerala Backwaters Family Holiday"; status tag "New" |
| 2.11 | 9 | /leads/{id} | Click "Change Status". Select trigger "Select status" → option "Qualified". Click "Update Status". | "Qualify it and move it down the pipeline" | Toast "Status updated successfully"; tag "Qualified" |
| 2.12 | 8 | | Click "Add note" in the Notes card. Type into the textarea "Write your note..." (delay 22): "Called Priya — dates and budget confirmed. Prefers a private car with an English-speaking chauffeur." Click "Add Note". | "Notes and calls stay on the lead's timeline" | Toast "Note added"; note text visible |
| 2.13 | 4 | | Click tab "Activity". | — | An entry referencing the status change |

### Scene 3 — Build the itinerary from a template (target 75 s, or 95 s with 3.7)

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 3.0 | 2.6 | — | `card('Scene 3','Build the itinerary','From a proven template, priced from supplier rate cards')` | — | — |
| 3.1 | 9 | /rate-cards | Click sidebar Rate Cards. Search "Vembanad". Hover the peak row. | "Negotiated supplier rates, season by season" | Row "Vembanad Lake Resort — Lake View Villa (MAP)" shows ₹14,000 and ₹17,500 |
| 3.2 | 5 | /itineraries/templates | Click sidebar "Itinerary Templates". | "Ten ready-made packages your team reuses daily" | At least 10 rows |
| 3.3 | 6 | | Search "Kerala". Click row "Kerala Backwaters & Hills — 5N/6D"; the preview dialog opens. | — | Dialog: Destination "Kerala", Duration "6 days", "6 day items" |
| 3.4 | 14 | | Click "Use this template". In the "Create Itinerary from Template" dialog: `#newTitle` select-all, type "Nair Family — Kerala Backwaters & Hills". Lead combobox ("Search leads by name…"): type "Kerala Backwaters Family" → option "Kerala Backwaters Family Holiday - Priya Nair". Click "Create itinerary". | "A complete six-day quote in one click" | URL `/itineraries/{id}` |
| 3.5 | 12 | /itineraries/{id} | Dwell on the header ("6D/5N", "Priya Nair"). Itinerary tab: slow scroll 4 steps through the days, then scroll back. | "Hotels, transfers and experiences, day by day" | "Misty Hills Tea Resort" and "Houseboat" text are present |
| 3.6 | 12 | | Click tab "Costs". Hover "Margin". | "Cost, price and margin — visible only to your team" | "Total Cost:" ₹95,100; "Total Selling:" ₹1,17,400; "Grand Total:" ₹1,23,270 |
| 3.7 *(only with FR-6)* | 20 | /itineraries/{id}/edit | Click "Edit". Day 3 → "Activity" button → rate-card icon (title "Select from Rate Card") → search "Kathakali" → row → Select → Save Changes. | "Add extras straight from supplier rate cards" | Toast "Rate card applied" |
| 3.8 | 9 | | Click tab "Share" → "Generate Share Link". Read the input value and store it as `shareLink`. | "A branded, view-only link for the client" | Toast "Share link generated…"; input has a URL |

### Scene 4 — Send it through the Communication Hub (target 45 s)

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 4.0 | 2.6 | — | `card('Scene 4','Send the quote','Through the Communication Hub, logged automatically')` | — | — |
| 4.1 | 6 | /itineraries/{id} (Share tab) | In the "Send to Client" card, click "Send via Email". | "Email, WhatsApp or SMS — always from one place" | Dialog "Choose Template"; "To: Priya Nair (priya.nair@example.com)" |
| 4.2 | 4 | | Click card "Quotation Email". | — | "Compose Email" |
| 4.3 | 12 | | **If FR-5 is present:** keep the body. **Otherwise:** `#msg-subject` select-all, type "Your Kerala holiday plan — {start}–{end}". Then `#msg-body` select-all and fill the text below (paste). | "Personalised in seconds, in your own words" | No `[` placeholders in subject or body |
| 4.4 | 6 | | Click "Preview". | "Preview exactly what Priya receives" | "Preview & Send" |
| 4.5 | 4 | | Click "Send Email". | "Sent — and logged against Priya's record" | Toast "Email sent via Communication Hub" |
| 4.6 | 9 | /leads/{priyaLead} | Sidebar Leads → search "Priya" → row → "Change Status" → "Proposal Sent" → "Update Status". | "Pipeline updated: proposal sent" | Tag "Proposal Sent" |

Body text for 4.3 (fallback):

```
Hi Priya,

Thank you for choosing Sahyadri Holidays. Your 5-night Kerala plan is ready:
• Munnar — 2 nights in a tea-estate family suite
• Thekkady — plantation villa and Periyar boat cruise
• Alleppey — private premium houseboat, all meals
• Kumarakom — lake-view villa
• Private Innova Crysta with chauffeur throughout

Package price: ₹1,23,270 for 2 adults and 2 children, including GST.
Day-by-day plan: {shareLink}

Warm regards,
Ananya Menon
Sahyadri Holidays
```

### Scene 5 — Invoice, payment, voucher (target 110 s)

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 5.0 | 2.6 | — | `card('Scene 5','Priya says yes','Invoice, advance payment and hotel voucher')` | — | — |
| 5.1 | 7 | /leads/{priyaLead} | "Change Status" → "Won" → "Update Status". | "Booked! Mark the lead won" | Tag "Won" |
| 5.2 | 3 | /invoices/new | Sidebar Invoices → "New invoice". | — | h1 "New invoice" |
| 5.3 | 9 | | Keep "Tax Invoice". Contact: `pickRelation(/Search contacts/, 'Type to search contacts...', 'Priya', 'Priya Nair')`. Lead / Trip Reference: `pickRelation(/Search leads/, 'Type to search leads...', 'Kerala Backwaters', 'Kerala Backwaters Family Holiday')`. | "GST-ready invoices linked to the booking" | — |
| 5.4 | 18 | | Line 1 description (placeholder "e.g., Flight tickets, Hotel booking...") type the line-1 text, Qty 1, Unit Price 94600. Click "Add Item". Line 2 description, Qty 1, Unit Price 22800. GST select (the "GST" row trigger) → "5%". | "Taxes and totals calculate as you type" | Total ₹1,23,270 |
| 5.5 | 4 | → /invoices | Click "Save". | — | Toast "Invoice created successfully" |
| 5.6 | 5 | /invoices | Search "Priya" ("Search invoices, clients..."). Click the row. | — | Detail title starts "SH-INV"; status badge "draft" |
| 5.7 | 16 | /invoices/{id} | "More actions" → "Record payment". Dialog: amount input select-all, type "60000". Payment Method → "Bank Transfer". Reference "UTR 362100487715". Click "Record Payment". | "Record the advance — balances update instantly" | Toast "Payment recorded"; badge "partially paid" |
| 5.8 | 5 | | Tab "Related" (or the section with "Payment History"). | — | Row with ₹60,000 |
| 5.9 | 3 | /vouchers/new | Sidebar Vouchers → "New voucher". | — | h1 "New voucher" |
| 5.10 | 26 | | Lead: pick "Kerala Backwaters Family Holiday". Voucher type: Hotel (default). Supplier → "Vembanad". `#hotelName`, `#hotelAddress`. Check-in and Check-out DatePickers → +4 / +5. Room type → "Villa". Meal plan → "MAP — Half Board". `#confirmationNumber` "VLR-26-88417". `#guestNames` "Priya Nair, Vivek Nair, Aditi Nair, Kabir Nair". Click "Save". | "Supplier-ready hotel vouchers from the same booking" | Toast "Voucher created successfully"; URL `/vouchers/{id}` |
| 5.11 | 8 | /vouchers/{id} | Click "Mark as sent" → dialog "Mark as sent?" → "Confirm". | "Track every voucher from draft to confirmed" | Status tag "sent" |

### Scene 6 — Book the airport transfer and assign Ravi (target 75 s)

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 6.0 | 2.6 | — | `card('Scene 6','Same day: an airport pickup','The Mehtas land in Kochi this afternoon')`. Optionally, during the card, `goto('/leads/{L01}')` and dwell 2 s on "Kerala Honeymoon — Kochi & Kumarakom" (Won). | — | — |
| 6.1 | 6 | /fleet | Click sidebar Fleet. Hover the "Active Trips" card (T04). | "Every vehicle, driver and live trip at a glance" | StatCards "Total Vehicles", "Active Trips" ≥ 1 |
| 6.2 | 2 | /fleet/trips/new | Click "New Trip". | — | h1 "New trip" |
| 6.3 | 8 | | `pickRelation(/Select vehicle/, 'Registration or make/model...', 'Innova', 'KA 05 MN 4521')` | "Choose from available vehicles and active drivers" | — |
| 6.4 | 6 | | `pickRelation(/Select driver/, 'Driver name or phone...', 'Ravi', 'Ravi Kumar')` | — | Option description "+919876543210" |
| 6.5 | 10 | | Placeholder "Enter pickup location" → type the H5 start. "Enter drop location" → type the H5 end. | — | — |
| 6.6 | 8 | | Start date (first "Pick a date") → today. `#startClock` fill T_PICK. End date → today. `#endClock` fill T_PICK + 2:15. *(FR-7: Trip type → "Airport Pickup".)* | — | — |
| 6.7 | 12 | | `#passengerName` "Arjun Mehta". `input[type=tel]` "9820144562". `#specialInstructions` (delay 22) the H5 text. | "Flight details and instructions go straight to the driver" | — |
| 6.8 | 4 | | `#distance` "82". `#fare` "3200". | — | — |
| 6.9 | 4 | → /fleet/trips | Click "Save". Capture the POST `/fleet/trips` response → `tripId`. | "Assigned — Ravi sees it in his driver app" | Toast "Trip created successfully" |
| 6.10 | 7 | /fleet/trips/{id} | Search "Arjun" ("Search trips by passenger, vehicle, or driver..."). Click the row. Dwell. `hideOverlays()`, `page.screenshot` → `trip-assigned.png`, `showOverlays()`. Write the handoff. | — | h1 "Cochin International Airport (COK), Arrival Gate 2 → Vembanad Lake Resort, Kumarakom"; tag "Assigned"; "Ravi Kumar"; "KA 05 MN 4521" |

Part A ends here. Hold 1.5 s, then close the context so the video finalises.

### Scene 7 — PHONE: on the road with Ravi (target 100 s composite)

**Driver test sequence** (`demo_flow_test.dart`; marks are printed as `DEMO_MARK <name> [text]`)

| # | Phone action | Mark / caption (composited, left lower-third) |
|---|---|---|
| 7.0 | (composite card, 2.5 s) | Card: "Scene 7 · On the road with Ravi" / "TravelCRM Driver app on Android" |
| 7.1 | App launches on "Driver Login". Wait 2.5 s. Country "+91" is the default. Type phone `9876543210` digit by digit, 140 ms per digit. `showTouch` + tap "Send OTP". | `CAPTION "Ravi signs in with his mobile number and a one-time code"` |
| 7.2 | OTP screen ("OTP sent to +919876543210"). Type 1,2,3,4,5,6 into the 6 boxes, 220 ms each. It auto-submits. | — |
| 7.3 | "My Trips", Today tab. The trip card shows "Cochin International Airport…" and "Arjun Mehta". Dwell 2.5 s. Tap "Upcoming" (shows T07, Thekkady), dwell 1.5 s, tap "Today". Tap the card. | `CAPTION "Today's jobs are waiting the moment he logs in"` |
| 7.4 | Trip Detail. Dwell. Slow-drag scroll to show Passenger, Vehicle (KA 05 MN 4521), Special Instructions (flight 6E 6171) and Timeline. Scroll back. | `CAPTION "Pickup, flight notes and one-tap navigation"` |
| 7.5 | Tap "Accept" → dialog "Accept Trip" → tap "Confirm". Snackbar "Trip accepted successfully". | `CAPTION "One tap to accept — the office sees it instantly"` |
| 7.6 | Tap "En Route". The status chip changes. | `CAPTION "Live status updates flow back to dispatch"` |
| 7.7 | Tap "Check In" → "Getting your location…" → coordinates "10.152000, 76.401900". Dwell 2 s. Tap "Confirm Check-In". Snackbar "Checked in successfully". Returns to detail with status Started. | `CAPTION "GPS-verified check-in at Cochin airport"` |
| 7.8 | `DEMO_MARK GEO 76.4285 9.6177`. Then `DEMO_MARK CARD "Two hours later · Kumarakom"`; the test waits 2.5 s. | Composite card overlay (phone area dimmed) |
| 7.9 | Tap "Mark Completed". Snackbar. Status Completed. Dwell 3 s. Tap the "History" bottom tab and dwell 2 s. | `CAPTION "Trip complete — car and driver free for the next job"` |
| 7.10 | `DEMO_MARK done` | — |

**Desktop side of the composite**
- Left inset: `trip-assigned.png`.
- In the last 3 s it crossfades to `trip-completed.png`, which comes from Part B shot 8.1. That is why the composite is rendered after Part B.

### Scene 8 — Back at the office (target 40 s) · Part B

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 8.0 | 2.6 | — | `card('Scene 8','Back at the office','Every step from the road, already on the record')`. During the card: `goto('/fleet/trips/{tripId}')`. | — | — |
| 8.1 | 6 | /fleet/trips/{id} | Dwell. Screenshot with overlays hidden → `trip-completed.png`. | "The trip record updated itself from Ravi's phone" | Tag "Completed" |
| 8.2 | 11 | | Click tab "Activity". Hover each row. | "Accepted, en route, GPS check-in, completed — all timestamped" | At least 5 timeline rows, including "Accepted", "En Route", "Completed" |
| 8.3 | 10 | /fleet | Click sidebar Fleet. Hover "Recently Completed", then "Fleet Status". | "Utilisation and availability update automatically" | "Recently Completed" lists "Arjun Mehta" or the route; vehicle KA 05 MN 4521 is available |
| 8.4 | 6 | | Hover "Top Drivers" → Ravi Kumar. | "See which drivers your clients love" | "Ravi Kumar" |

### Scene 9 — The day at a glance (target 45 s)

| # | Dur | Route | Action | Caption | Visible |
|---|---|---|---|---|---|
| 9.0 | 2.6 | — | `card('Scene 9','The day at a glance','Dashboards and reports that run themselves')` | — | — |
| 9.1 | 8 | /dashboard | Click sidebar Dashboard. Dwell on the KPI tiles. | "Leads, follow-ups, revenue and collections — live" | "New Leads", "Follow-ups Today", "Revenue (Month)" |
| 9.2 | 12 | | Slow scroll 5 steps: Revenue chart, Pipeline funnel, Upcoming travel, Recent activity. | "Today's work is already in the pipeline and timeline" | Text "Kerala Backwaters Family Holiday" somewhere on the page |
| 9.3 | 8 | /reports/sales | Sidebar Reports → card "Sales Reports". | "Drill into sales, finance, fleet and marketing" | "Total Revenue" |
| 9.4 | 8 | /reports/fleet | Back → "Fleet Reports". Dwell. | "One platform from first message to final drop-off" | Page heading |

Part B ends here. The outro is added in post.

**Story total:**
- 5 + about 40 + 80 + 75 + 45 + 110 + 75 + 100 + 40 + 45 + 6 ≈ **621 s (10:21)**.
- Add 20 s if 3.7 runs.
- If the measured length goes over 11:30, drop shots in this order: 6.0 detour, 2.13, 3.1, 8.4, 9.4.

### B.10 Story chapters (`story-chapters.txt`, YouTube format)

`00:00 Introduction`, then one line per scene ("A new enquiry arrives", …), then "Thank you". Timestamps are computed from the composited timeline.

---

## C. Full walkthrough — chapter list

**General rules**
- One Playwright take, `full-walkthrough.spec.ts`. The context starts **unauthenticated** at `/login`.
- Each chapter:
  1. a 1.8 s chapter card;
  2. a list tour: dwell, search with a real term, apply one filter, scroll 3 steps;
  3. one real create **or** edit, plus a detail view.
- Target per chapter is 20–40 s. Captions are 12 words or fewer.
- A failure throws and aborts the take (no `section()` swallowing).

**Driver chapter**
- At chapter 21 the spec shows a 1 s solid indigo hold card and logs `{title:'Driver app', insert:'driver', at}`.
- The compositor cuts there and inserts a 55 s driver clip: the story phone composite, sped up 1.25× from 7.3 to 7.9, with chapter-specific captions. All later chapter times shift by that amount.

**Created-ids ledger**
- Every live-created id is appended to `.work/walkthrough-created.json`.
- On a retake, the orchestrator deletes them via API first.
- Values that are unique keys (vehicle registration, emails) are fixed values. Deleting first is required.

| # | Chapter (YouTube title) | s | Route(s) | Actions | Caption(s) |
|---|---|---|---|---|---|
| 0 | Introduction | 5 | (post) | Intro card | — |
| 1 | Sign in & workspace | 35 | /login → /dashboard → /settings/sessions | Type DEMO_EMAIL (#email) → submit → `#password` "Admin@123" → submit. Ctrl+K → type "Mehta" → results → Esc. Theme toggle to dark, dwell 2 s, back to light. Settings → Sessions. | "Secure sign-in to your agency's private workspace" · "Find any client, lead or invoice instantly" |
| 2 | Dashboard | 30 | /dashboard | KPI dwell. Date-range selector → "This month". Sticky notes widget → add "Call the Mehtas after airport pickup" (yellow). Click the "New Leads" tile → /leads → back. | "Live KPIs — click any tile to drill down" |
| 3 | Contacts | 40 | /contacts | Search "Nair". Filter source. **Create:** "New Contact" → `#name` "Rohit Bhatia", `#email` rohit.bhatia@example.com, Phone 9811142587, Contact Type Customer, Source Referral, `#city` New Delhi, `#state` Delhi, `#country` India, tags "adventure", "scuba" → "Save Contact" → search "Rohit" → open. **Edit:** Edit → City "Gurugram", State "Haryana" → Save. | "Every traveller and client, one clean record" |
| 4 | Leads & pipeline | 40 | /leads, /leads/unassigned | Filter status Qualified. Unassigned queue → row "Andaman Scuba & Beaches" → "Assign" → Farhan Qureshi. **Create:** "Andaman Scuba Week", contact Rohit Bhatia, destinations Port Blair + Havelock, Adventure, travel D0+100, adults 2, budget 140000, Warm, Referral → Save Lead → open → More actions → "Schedule follow-up" (tomorrow 11:00, Call, "Share PADI course options") → Edit → budget 155000. | "Unassigned leads never slip — assign in one click" |
| 5 | Accounts | 20 | /accounts | Search "Vembanad" → open → dwell. | "Supplier accounts with contacts, rates and history" |
| 6 | Itineraries | 45 | /itineraries, /itineraries/new | List chips. **Create:** "New" builder → title "Goa Beach Escape — Desai family", Destination "Goa", Link to Lead "Goa Beach Escape — Desai family - Rohan Desai", Day 1 title "Arrive North Goa" → Hotel → (FR-6) rate-card picker "Candolim Sands Resort — Deluxe Sea View (CP)", otherwise type hotel name and cost 6500 / sell 8200 → Day 2 Activity "Mandovi sunset cruise" 1600/2200 → Save → detail tabs: Versions, Share. | "Drag-and-drop day builder with live margins" |
| 7 | Itinerary templates | 25 | /itineraries/templates | Preview "Rajasthan Royal Heritage — 7N/8D" → "Use this template" → lead "Rajasthan Royal Heritage — 8 days - James Carter" → Create. (FR-10: also "New template" "Coorg Coffee Trails — 2N/3D".) | "Reusable packages turn into quotes instantly" |
| 8 | Rate cards | 30 | /rate-cards | Search "Kerala". **Create:** "Add Rate Card" → Service Name "Alleppey Sunset Shikara Ride — 2 hrs", Category Activity, Supplier "Lakes & Lagoons Houseboats", Season Peak, Cost 600, Selling 850, Unit Per Person, valid D0 → Mar 31 → Save. **Edit** selling to 900. | "Seasonal supplier pricing your whole team trusts" |
| 9 | Suppliers & rate comparison | 35 | /suppliers, /suppliers/compare | **Create:** "Add Supplier" → "Konkan Coast Cabs", Category Transport, Contact "Sachin Naik", Phone 9822061734, Email bookings.konkancabs@example.com, City Panaji, State Goa, Country India, GST 30AAKFK2219R1Z4, Preferred on → "Save Supplier" → detail. Rate Comparison → hotel, Kerala. | "Compare supplier rates side by side" |
| 10 | Invoices | 40 | /invoices | Overdue filter → open I-07 (Karan Malhotra) → "Send message" → WhatsApp → "Payment Reminder WA" → Preview → back out. Open I-09 (draft) → Edit → "Add Item" "Travel insurance (2 travellers)" 1,800 → Save. More actions → "Download PDF" (assert a download event). | "Overdue invoices surface themselves — remind in two clicks" |
| 11 | Payments | 30 | /payments/new | "Record payment" → Amount 25000, date today, Method Bank Transfer, Reference "UTR 362100512208", Lead "Northstar Analytics Offsite — Coorg", Invoice = I-06 → Save → detail. | "Every rupee in, matched to its invoice" |
| 12 | Credit & debit notes | 30 | /credit-notes/new, /debit-notes | **Create:** Invoice I-01 → Reason "Sunset cruise cancelled due to weather" → item "Kumarakom sunset cruise — refund" 1 × 3,600 → Save. Debit notes list. | "Adjustments stay GST-compliant and traceable" |
| 13 | Vouchers | 35 | /vouchers/new | Transport voucher for "Goa Christmas Homecoming": Vehicle type Innova, Pickup time D0+83, Driver "Abdul Rasheed", phone +91 94471 23456, Pickup "Goa International Airport (Dabolim)", Drop "Candolim Sands Resort" → Save → "PDF" (download) → "Mark as sent". | "Branded vouchers for hotels, transfers, flights, activities" |
| 14 | Travellers | 30 | /travellers/new | Contact Priya Nair, First "Kabir", Last "Nair", DOB 14 Feb 2018, Nationality Indian, Passport "Z7104418", expiry 13 Feb 2028 → Save → detail → Edit → Phone. | "Passports and expiries tracked for every traveller" |
| 15 | Visa | 35 | /visa/dashboard, /visa/new | Dashboard by stage. "New Application" → Traveller "Ishaan Chatterjee", Destination Country "France", Visa Type Tourist → "Create Application" → detail → tick 2 checklist items → Edit status "Documents collecting". | "Visa applications tracked stage by stage" |
| 16 | Fleet — vehicles | 35 | /fleet/vehicles | **Create:** "Add vehicle" → "KA 05 NP 7203", type MUV, Toyota, Innova Hycross, 7 seats, 2025, White → Save → detail → log maintenance (Regular service, today, odometer 1200, vendor "Toyota service centre, Whitefield"). **Edit** colour. | "Vehicles, documents and maintenance in one place" |
| 17 | Fleet — drivers | 30 | /fleet/drivers | **Create:** "Add driver" → "Shivakumar R", phone 9886147290, licence "KA51 20210098765", expiry +3 y, type "LMV-Transport", emergency "Gowri R" 9886147291 "Wife" → Save → detail (schedule, ratings). | "Driver licences, schedules and ratings" |
| 18 | Fleet — trips | 40 | /fleet/trips | **Create:** KA 01 AH 9034 Dzire, Manjunath Gowda, "Indiranagar, Bengaluru" → "Kempegowda International Airport (BLR), Terminal 2", D0+2 05:30–06:45, passenger Nikhil Bansal 9845177230, "Early flight 6E 5131 — please arrive 10 minutes early", 41 km, 1400 → Save → detail → "Add cost" Toll 160 "Airport toll" → Edit start 05:15. Open T01 → More actions → "Generate invoice". | "Dispatch, costs and trip invoices in one flow" |
| 19 | Fleet — rate cards | 25 | /fleet/rate-cards | **Create** "Tempo Traveller 12 — Outstation (Kerala)": tempo_traveller / outstation, 24/km, min 300 km, allowance 500, night 300 → Save. Estimate 300 km if the UI exists. | "Per-km pricing by vehicle and trip type" |
| 20 | Fleet — dashboard & alerts | 25 | /fleet, /fleet/alerts | Dwell on stats. Alerts: insurance for KA 51 C 2210 and Joseph's licence. | "Expiring documents flagged before they become problems" |
| 21 | Driver app | 55 | (inserted clip) | Story phone composite, condensed. | "Drivers accept, check in by GPS and complete on mobile" |
| 22 | Tasks | 35 | /tasks | Kanban view. **Create:** "Confirm veg houseboat menu for the Nair family", High, due tomorrow, assignee Deepa Thomas, lead "Kerala Backwaters Family Holiday" → open → comment "Lakes & Lagoons confirmed a Kerala sadya lunch on day 4." → status In progress. | "Team tasks with owners, due dates and context" |
| 23 | Calendar | 25 | /calendar | Week view. **Create** event "Supplier meet — Vembanad Lake Resort", D0+1 15:00–16:00, location "Kumarakom" → Save → Month view. | "Meetings, arrivals and follow-ups on one calendar" |
| 24 | Follow-ups | 30 | /follow-ups | Overdue filter → "Mark complete" on Aditya Joshi, outcome "Interested", notes "Wants the Universal Studios add-on" → schedule the next one D0+2. | "Never miss a callback again" |
| 25 | Documents | 25 | /documents | "Upload document" → `nair-family-passports.pdf` (fixture), name "Nair family — passport copies", category, lead "Kerala Backwaters Family Holiday" → Upload → Rename. | "Every file attached to the right booking" |
| 26 | Inbox & bulk send | 35 | /communication, /communication/bulk-send | Channel filter WhatsApp → open Neha's thread → "New message" compose page → Bulk Send: pick segment "Honeymooners", template, preview (do not send). | "Every channel in one inbox, plus bulk sends" |
| 27 | Message templates | 30 | /communication/templates/new | "Create Template" → name "Driver details — airport pickup", Channel WhatsApp, Category Booking, Language English, Content "Hi {{first_name}}, your driver {{driver_name}} will meet you at the arrival gate with a name board." → preview with contact "Arjun Mehta" → "Save Template" → Edit name. | "Reusable templates with live variable preview" |
| 28 | Calls & VoIP | 30 | /communication/calls, /calls/analytics, /settings/voip | Missed filter → analytics → VoIP settings view only. **Do not click any "Test" button.** Mask SIDs (D.9). | "Every call logged, missed calls never lost" |
| 29 | Chatbot | 25 | /chatbot, /settings/chatbot | Open "Rahul S" → "Hand off to human" if active → settings widget snippet. | "Website chatbot that hands off to your team" |
| 30 | Marketing dashboard | 20 | /marketing | Dwell. | "All campaign results in one view" |
| 31 | Campaigns | 35 | /marketing/campaigns | Open "Diwali Getaways 2026" stats. **Create:** "New campaign" → "Christmas in Kerala — early bird", Channel Email, segment "Families with kids", Schedule D0+7 10:00, Subject "Christmas in Kerala — book by 31 Oct, save 10%", body (2 lines) → Save → Edit subject. | "Email and WhatsApp campaigns with open and click tracking" |
| 32 | Segments | 30 | /marketing/segments/new | "Kerala enquiries — Bengaluru": rules city = Bengaluru AND tag contains kerala → Save → refresh count / preview. | "Rule-based audiences that update themselves" |
| 33 | Flyers & branding | 35 | /marketing/flyers/new, /marketing/branding | New flyer from "Festival offer" → headline "Diwali in Udaipur — 3 nights from ₹38,999" → Save → detail. Branding page (logo, colours). | "On-brand flyers in minutes" |
| 34 | Festival offers & social | 20 | /marketing/festivals, /marketing/social | Seeded suggestions only. No "Generate". | "Festival-ready offers, suggested ahead of time" |
| 35 | Opted-out | 20 | /marketing/opted-out | Dwell on Zoya and Sanjay. | "Unsubscribes honoured automatically" |
| 36 | WhatsApp campaigns | 25 | /marketing/whatsapp | Open the draft → Edit audience. | "Approved-template WhatsApp broadcasts" |
| 37 | AI assistant & extractions | 35 | /ai, /ai/extractions | AI home tiles. Extractions queue → open Kavitha Reddy → "Confirm" (only if confirm does not call an LLM; otherwise just view). | "Enquiry emails parsed into leads for your review" |
| 38 | AI insights & lead scoring | 30 | /ai/insights, /ai/lead-score, /ai/smart-followups | Recommendations list, lead scores (L02 86), smart follow-up drafts. | "Know which leads to call first, and why" |
| 39 | Business intelligence | 25 | /ai/bi | Revenue pulse, health score, trending destinations. | "Executive insight on revenue, health and demand" |
| 40 | AI settings & usage | 20 | /settings/ai, /settings/ai-usage | Dwell. | "Control every AI feature and its usage" |
| 41 | Reports | 35 | /reports/* | Sales → range; Financial; Fleet; Export (download event). | "Export any report as a branded Excel file" |
| 42 | Import & export | 35 | /import, /settings/export | Download template. Upload fixture `sahyadri-new-enquiries.csv` (5 contacts: Aisha Rahman, Varun Khanna, Leela Krishnan, Mohit Arora, Sara Thomas) → map → progress → done. Export Contacts. | "Bring data in or out in minutes" |
| 43 | Notifications | 20 | /notifications, /settings/notifications | Unread filter → "Mark all read" → preferences. | "Alerts that link straight to the record" |
| 44 | Settings — company | 30 | /settings/company, /settings/numbering, /settings/invoice-defaults | **Edit:** Website → "www.sahyadriholidays.in/kerala" → Save, then revert. Numbering view. | "Your brand and numbering on every document" |
| 45 | Settings — team | 30 | /settings/team, /settings/activity-log | "Invite team member" → "Meera Pillai", meera.pillai@example.com, Operations, department "Kochi desk" → Edit role → activity log filtered to Ananya. | "Roles and permissions with a full audit trail" |
| 46 | Integrations & webhooks | 20 | /settings/integrations | Masked key; delivery log. | "Plug your website forms straight into the CRM" |
| 47 | Super Admin | 30 | /super-admin, /super-admin/tenants, /super-admin/tenants/{id}, /super-admin/plans | Platform dashboard → Tenants (5) → open "Sahyadri Holidays" → Plans. Read-only surface; no CRUD exists. | "Run every agency on the platform from one console" |
| 48 | Help & bookmarks | 20 | /bookmarks, /help | Bookmark Priya's lead (star) → Bookmarks → Help Center search "invoice". | "Bookmarks and built-in help, always one click away" |
| 49 | Thank you | 6 | (post) | Outro card | — |

**Data needed:** all of section A, plus the fixtures `desktop/e2e/showcase/fixtures/nair-family-passports.pdf` and `sahyadri-new-enquiries.csv`.

**Super Admin.**
- Requires A.9 #4 (super_admins row) and #5 (tenants).
- If `/super-admin` shows "Platform administration access required", the take aborts: the seed is wrong. Do not record the denied state.

**Expected length:** about 1,470 s ≈ 24.5 min.

---

## D. Recording and production spec

### D.1 Pipeline (`scripts/record-demo.mjs`)

**Preflight** — abort on any failure:
- ports 8787 and 3100 are up, or start them per 0.3;
- `nowIST` is between 08:00 and 20:30;
- `ffmpeg-static` resolves;
- `adb devices` shows `emulator-5554` with `sys.boot_completed=1`;
- FIX-REQ detections (0.4) pass and are written to `.work/fixreq.json`.

**Run order**
1. `node backend/scripts/seed-demo.mjs` → `.work/seed.json`.
2. `npx playwright test --config=playwright.showcase.config.ts --project=showcase-setup`. This logs in with DEMO_EMAIL and saves storageState.
3. Pre-roll SQL (A.9 #10).
4. `--grep story-A` → `.work/partA.webm`, `marks-A.json`, `.handoff.json`, `trip-assigned.png`.
5. `scripts/record-driver.ps1 -Handoff desktop/showcase/.handoff.json` → `.work/driver-raw.mp4`, `driver-marks.json`.
6. `--grep story-B` → `partB.webm`, `marks-B.json`, `trip-completed.png`.
7. Between-takes SQL (A.9 #11).
8. `full-walkthrough` → `walkthrough.webm`, `chapters.json`.
9. `node scripts/compose-demo.mjs` → MP4s, `chapters.txt`, `story-chapters.txt`.
10. `finalize.ts` gate. A failure prints the reason and exits 1.

**Retakes:** per B.0 and C. At most 2 retakes per segment, then stop and report.

### D.2 Harness and helpers (`showcase-helpers.ts`)

The old `section()`, failure captions, `softFail` and auto-`fillForm` are **removed**. Specs hand-write each fill.

**Overlay and narration**

| Helper | Behaviour |
|---|---|
| `installOverlays(context)` | `context.addInitScript(cursorOverlayScript)` plus the caption and card CSS. Re-attaches on every navigation. |
| `card(page, {kicker, title, subtitle, holdMs=2600})` | Full-screen card (D.4). Hides the cursor while shown. Logs a mark `{type:'card', title, atMs}`. |
| `say(page, text, holdMs?)` | Lower-third caption (D.3). The hold defaults to the B.0 formula. The caption stays until the next `say` or `clearSay`. |
| `hideOverlays(page)` / `showOverlays(page)` | Used around screenshots. |

**Pointer**

| Helper | Behaviour |
|---|---|
| `moveTo(page, locator)` | `scrollIntoViewIfNeeded`, then `boundingBox`, then `page.mouse.move(cx+jitter(±3), cy+jitter(±2), {steps: clamp(dist/22, 12, 40)})`, then wait 120 ms. |
| `clickOn(page, locator)` | `moveTo`, wait 180 ms, `locator.click()`, then `settle()`. |

**Input**

| Helper | Behaviour |
|---|---|
| `typeInto(page, locator, text, {delay=45})` | `clickOn`, select all (Ctrl+A), Backspace, `pressSequentially(text, {delay})`. Text over 140 characters uses `delay=18`. Body paste in 4.3 uses `fill()`. |
| `pickRelation(page, triggerText:RegExp, searchPlaceholder, query, optionText)` | Pattern proven in `fleet-trips.spec.ts`: `getByRole('combobox').filter({hasText})`, then `getByPlaceholder(searchPlaceholder)`, `typeInto`, `locator('[cmdk-item]').filter({hasText: optionText})` (fallback `getByRole('option')`), then `clickOn`. |
| `pickSelect(page, trigger, optionName)` | Radix Select: `clickOn(trigger)`, then `getByRole('option',{name:optionName, exact:true})`. |
| `pickDate(page, trigger, date)` | Open the trigger. If the B3 month/year dropdowns exist (`[role=dialog] select` or comboboxes named Month/Year), choose them. Otherwise click the header next button N times. The calendar is `.w-\[280px\]`, the last one. Then click the grid button with `name: String(day), exact: true`. |
| `fieldByLabel(page, label)` | `getByLabel(label,{exact:true})`. Fallback: the `label:text-is("<label>")` ancestor's `input` or `textarea`. |

**Timing and checks**

| Helper | Behaviour |
|---|---|
| `settle(page, ms=900)` | No `.animate-spin` elements and network idle (500 ms), then dwell. |
| `mark(name, data)` | Appends `{name, atMs: Date.now() - videoT0}` to `marks-*.json`. `videoT0` is captured right after `context.newPage()`. |
| `assertClean(page)` | Runs the D.9 DOM checks. Called at the end of every scene or chapter. |

**Listeners** — attached at page creation; any hit throws at the next `assertClean`:
- `page.on('console')` for type error;
- `page.on('pageerror')`;
- `page.on('response')` for status ≥ 500, or ≥ 400 not on the allowlist.

**Config** — the `playwright.showcase.config.ts` items listed in 0.2, plus:
- `use.viewport 1920×1080`, `deviceScaleFactor: 1`
- `video: {mode:'on', size:{1920,1080}}`
- `actionTimeout 15000`, `navigationTimeout 30000`
- Test timeout: story-A 15 min, story-B 5 min, walkthrough 50 min.

### D.3 Cursor and click ripple (`cursor-overlay.ts`, injected into every page)

**Cursor**
- A `div#sc-cursor`: 26×26 px inline SVG arrow, fill `#FFFFFF`, stroke `#111117` 1.5 px, drop-shadow `0 2px 4px rgba(0,0,0,.35)`.
- `position:fixed`, `z-index:2147483647`, `pointer-events:none`.
- Transform translate to `(x-3, y-2)`.
- Updates on `mousemove` (capture phase, `document`).
- Persists last x,y in `sessionStorage`, so after a navigation it reappears in place rather than at 0,0.

**Ripple**
- On `mousedown`, append a `div.sc-ripple` at x,y: 14 px circle, `border:2px solid #4F46E5`, `background:rgba(79,70,229,.25)`.
- Animate scale 1 → 3.2 and opacity 0.9 → 0 over 450 ms ease-out, then remove.

**Visibility**
- The cursor is hidden while a card is visible (`body.sc-card-open #sc-cursor {display:none}`).
- All overlay elements are `pointer-events:none`.

### D.4 Captions and title cards (brand style)

**Lower-third caption (`#sc-caption`)**
- Position: fixed, left 64 px, bottom 64 px, max-width 1100 px.
- Kicker line, 14 px uppercase, `letter-spacing .2em`, `#A5B4FC`. Shows the scene or chapter name.
- Text 28 px / 1.35, DM Sans 600, `#FFFFFF`.
- Container: `rgba(17,17,23,.86)`, `backdrop-filter: blur(6px)`, radius 14 px, padding 14 px 28 px 16 px 24 px, `border-left: 6px solid #4F46E5`, shadow `0 12px 40px rgba(0,0,0,.35)`.
- Enter: fade + translateY(8 px) over 250 ms. Exit: 200 ms fade.
- No red or error variant exists.

**Scene and chapter card (`#sc-card`)**
- Full-screen. Background `linear-gradient(135deg,#1E1B4B 0%,#312E81 55%,#4F46E5 100%)` with a faint 32 px dot-grid at 6% white.
- Centred text block:
  - kicker 18 px, `letter-spacing .32em`, `#C7D2FE` (for example "SCENE 3 OF 9" or "CHAPTER 12");
  - title 72 px DM Sans 700, white, `letter-spacing -.02em`;
  - subtitle 28 px `#E0E7FF`, max 60 ch.
- Bottom-left: the "SH" monogram (40 px) and "Sahyadri Holidays · powered by TravelCRM Pro", 16 px `#C7D2FE`.
- 300 ms fade in and out. Hold 2.6 s for scenes, 1.8 s for chapters.

**Intro (5 s, post-rendered)**
- Same background.
- "TravelCRM Pro" at 96 px.
- Tagline "The all-in-one CRM for tours & travels agencies" at 32 px.
- Small line "A day at Sahyadri Holidays, Bengaluru".

**Outro (6 s)**
- "Leads · Itineraries · Invoicing · Fleet · Driver app — one platform", 40 px.
- "travelcrm.pro", 28 px `#C7D2FE`.
- Monogram.

**Phone segment captions**
- The same caption design, rendered to transparent PNGs (1920×1080, caption at left 80 px, bottom 72 px, max-width 1180 px) from `cards/caption.html?text=…`.

### D.5 Pacing rules

| Rule | Value |
|---|---|
| Dwell after a navigation settles | 1.2 s before the first action |
| Dwell after a toast | 1.5 s |
| Dwell after a dialog opens | 0.6 s |
| Mouse to target | 12–40 steps (about 0.25–0.6 s). Never teleport. |
| Typing | 45 ms per character (short text), 18–25 ms (long text) |
| Selects, comboboxes, date pickers | 0.4 s pause after opening, before choosing |
| Scrolling | `mouse.wheel(0, 500)` steps, 650 ms apart. Never jump. |
| Idle | At most 3 s of no visible change, except deliberate dwells under a caption |
| Speed | Global `slowMo` is removed. All slowness comes from explicit pauses. |

### D.6 Driver segment

**Prerequisite:** FR-2b widget keys. If they are absent, use the fallback finder shown second.

| Key | Fallback finder |
|---|---|
| `Key('phone-field')` | `find.byType(TextFormField).first` |
| `Key('send-otp')` | `find.text('Send OTP')` |
| `Key('otp-0')` … `Key('otp-5')` | `find.byType(TextFormField).at(i)` |
| `Key('verify-otp')` | `find.text('Verify')` |
| `Key('tab-today')`, `Key('tab-upcoming')` | `find.text('Today')`, `find.text('Upcoming')` |
| `Key('trip-card-<id>')` | `find.textContaining('Cochin International Airport')` |
| `Key('action-accept')` | `find.text('Accept')` |
| `Key('confirm-accept')` | `find.text('Confirm')` |
| `Key('action-en-route')` | `find.text('En Route')` |
| `Key('action-check-in')` | `find.text('Check In')` |
| `Key('confirm-check-in')` | `find.text('Confirm Check-In')` |
| `Key('action-complete')` | `find.text('Mark Completed')` |
| `Key('nav-history')` | `find.text('History')` |

**`integration_test/demo_flow_test.dart`**

Setup:
- Call `IntegrationTestWidgetsFlutterBinding.ensureInitialized()`.
- Read `String.fromEnvironment`: TRIP_ID, DRIVER_PHONE, OTP.
- `API_BASE_URL` and `TENANT_ID` are already read by `AppConfig`.
- Before `app.main()`: `await Hive.initFlutter(); await Hive.deleteFromDisk();` so the app starts at `/login`.

Test body:
1. `app.main()`, then `pumpAndSettle`.
2. `print('DEMO_MARK ready')`, then idle 4 s while the script starts screenrecord.

Helpers:
- **`showTouch(tester, finder)`**
  1. Get the centre of `finder`.
  2. Insert an `OverlayEntry` into `tester.state<OverlayState>(find.byType(Overlay).first)`.
  3. Draw a 44 px circle: fill `#4F46E5` at 30% alpha, 2 px border `#4F46E5`.
  4. Animate scale 0.6 → 1.4 and fade over 450 ms.
  5. Pump frames for 450 ms, then `tester.tap(finder)`.
  6. This is needed because synthetic taps do not trigger Android `show_touches`.
- **`typeHuman(tester, finder, text, msPerChar)`** — `tester.enterText` with growing substrings, pumping `Duration(milliseconds: msPerChar)` between them.
- **`dwell(ms)`** — pump in 16 ms frames for `ms`. Never use `sleep`; keep the app rendering.
- **Captions and cards** — print `DEMO_MARK CAPTION <text>` and `DEMO_MARK CARD <text>`. The script timestamps each mark when the line appears on stdout.
- **Scrolling** — `tester.drag(find.byType(Scrollable).first, Offset(0,-300))` in 4 steps of 400 ms.

**`scripts/record-driver.ps1`** — steps run under SysWOW64 PowerShell for Flutter:

1. Read the handoff JSON.
2. `adb -s emulator-5554 wait-for-device`; poll `getprop sys.boot_completed`.
3. Prepare the device:
   - `adb reverse tcp:8787 tcp:8787`
   - `adb shell settings put secure location_mode 3`
   - `adb emu geo fix 76.4019 10.1520` (airport)
   - `adb shell settings put system screen_off_timeout 1800000`
4. Clean status bar:
   - `settings put global sysui_demo_allowed 1`
   - `am broadcast -a com.android.systemui.demo -e command enter`
   - `… -e command clock -e hhmm <HHmm of now IST>`
   - `… -e command battery -e level 100 -e plugged false`
   - `… -e command network -e wifi show -e level 4`
   - `… -e command network -e mobile show -e datatype 4g -e level 4`
   - `… -e command notifications -e visible false`
5. If the package is installed: `adb shell pm clear com.travelcrm.driver_app`.
6. Run the test as a background process, capturing stdout line by line with host timestamps:
   ```
   flutter test integration_test/demo_flow_test.dart -d emulator-5554 --dart-define=API_BASE_URL=http://localhost:8787 --dart-define=TENANT_ID=01960000-0000-7000-8000-000000000001 --dart-define=ENVIRONMENT=dev --dart-define=TRIP_ID=<id> --dart-define=DRIVER_PHONE=9876543210 --dart-define=OTP=123456
   ```
7. On `DEMO_MARK ready`:
   - `adb shell pm grant com.travelcrm.driver_app android.permission.ACCESS_FINE_LOCATION` (and COARSE);
   - start `adb shell screenrecord --bit-rate 8000000 --time-limit 175 /sdcard/driver.mp4` as a separate process, recording `recStartHost`.
8. On `DEMO_MARK GEO <lng> <lat>`: `adb emu geo fix <lng> <lat>`.
9. Write all marks to `driver-marks.json` as `{name, text, tHostMs, tVideoS = (tHostMs - recStartHost)/1000}`.
10. On process exit:
    - exit code ≠ 0 → driver-failure retake path;
    - otherwise `adb shell pkill -INT screenrecord`, wait 2 s, `adb pull /sdcard/driver.mp4 desktop/showcase/.work/driver-raw.mp4`.
11. Exit demo mode: `-e command exit`.

**Length budget:** from ready to done must stay under 170 s, because screenrecord stops at 180 s. If the dry run measures more than 165 s, shorten the dwell times.

### D.7 Compositing (`scripts/compose-demo.mjs`, ffmpeg-static)

**Normalise every source first**
- Encode settings: `-vf "fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 16 -profile:v high -r 30`.
- **Part A, Part B and walkthrough:** trim from the first `card` mark minus 0.3 s to the last mark plus the final hold (`-ss`/`-to` from the marks files).
- **Driver:** `-ss` = `ready` mark `tVideoS` + 3.5 s; `-to` = `done` + 2 s.

**Cards and caption PNGs**
- Render each `cards/*.html` with Playwright to a 1920×1080 PNG. Caption PNGs use `omitBackground`.
- Card clip example:
  ```
  ffmpeg -loop 1 -t 5 -i intro.png -vf "fps=30,format=yuv420p,fade=in:0:12,fade=out:st=4.6:d=0.4" -c:v libx264 -crf 16 intro.mp4
  ```

**Phone composite layout (1920×1080)**

| Layer | Position and size | Notes |
|---|---|---|
| Background | full frame | `cards/phone-bg.html`: the frozen desktop frame scaled to cover, Gaussian blur 18 px, a 55% `#1E1B4B` overlay, plus the brand gradient at 40% |
| Desktop inset | x=80, y=208, w=1180, h=664 (scale 0.6146 of 1920×1080) | 16 px radius, 1 px `rgba(255,255,255,.25)` border, shadow. Variant A: `trip-assigned.png`. Variant B: `trip-completed.png`. Pre-composite both into `bgA.png` / `bgB.png`. |
| Label above inset | x=80, y=160 | Chip "Dispatch desk · Sahyadri Holidays", 18 px `#C7D2FE` |
| Phone screen video | x=1379, y=90, w=405, h=900 | Scaled from 1080×2400. Rounded with `alphamerge` using `mask-405x900.png` (radius 44). |
| Device frame PNG | x=1363, y=74, outer 437×932 | Bezel 16 px `#0B0B10` with a 1 px `#3A3A44` highlight, outer radius 56, transparent screen hole, punch-hole camera dot at top centre |
| Label under phone | x=1363, y=1018 (centred to the phone) | "Ravi Kumar · TravelCRM Driver", 18 px `#C7D2FE` |
| Captions | x=80, bottom 72 | From the CAPTION marks; each shown from its mark time to the next CAPTION mark or +5 s |
| CARD marks | over the phone screen only | 2.5 s: `rgba(30,27,75,.85)` with centred 30 px text |
| Scene 7 card | before the composite | 2.5 s full-screen |

**Filtergraph sketch**

```
[0]=bgA.png loop, [1]=bgB.png loop, [2]=phone.mp4, [3]=mask.png, [4]=frame.png, [5..]=caption PNGs
[2:v]scale=405:900,format=rgba[ph];[ph][3:v]alphamerge[phr];
[1:v]format=rgba,fade=t=in:st={T-3}:d=0.8:alpha=1[bgB];
[0:v][bgB]overlay=0:0[bg];[bg][phr]overlay=1379:90[a];[a][4:v]overlay=1363:74[b];
[b][5:v]overlay=0:0:enable='between(t,{s1},{e1})'[c1]; ... → fps=30,format=yuv420p
```

**Concatenation**
1. Every piece already uses identical encode settings, so use the concat demuxer: `-f concat -safe 0 -i list.txt -c copy`.
2. Final pass: add silent audio and faststart:
   ```
   -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -shortest -c:v copy -c:a aac -b:a 128k -movflags +faststart
   ```

**Story order:** intro, partA, scene7 card, phone composite, partB, outro.

**Walkthrough order:** intro, walkthrough[0 → driver mark], driver-chapter composite (1.25× via `setpts=PTS/1.25`, same layout, chapter captions), walkthrough[driver mark + 1 s → end], outro.

### D.8 Chapters files (YouTube format)

**Format rules**
- Plain text, one line per chapter: `MM:SS Title`, or `H:MM:SS Title` when the video is longer than 1 h.
- The first line must be `00:00 Introduction`.
- Timestamps strictly ascending, at least 3 chapters, each chapter at least 10 s.
- Titles must not contain `<` or `>`.

**Example**

```
00:00 Introduction
00:05 Sign in & workspace
00:42 Dashboard
...
24:31 Thank you
```

Times come from the composited timeline: card marks plus segment offsets plus the driver-clip shift. Write them to both `chapters.txt` and SHOWCASE.md.

### D.9 Quality gate (`finalize.ts`)

**Fail the run and retake** if any of the following holds.

1. **DOM text.** At each `assertClean`, `document.body.innerText` matches any banned pattern in A.13.
   - Before matching, remove allowlisted app-chrome strings: `Test connection`, `Test Connection`, `Send test`, `Test webhook`.
   - Also scan input and textarea values.
2. **Secrets.** On `/settings/integrations`, `/settings/voip` and `/settings/phone-numbers`, any `input`, `code` or `pre` text matching `/(sk_|AC[0-9a-f]{32}|[A-Za-z0-9]{32,})/` is not covered by the mask style.
   - Mask style: inject `filter: blur(6px)` on `input[type=password], [data-secret], code, pre` for those routes.
3. **Console and network.** Any console error, any `pageerror`, any response ≥ 500, or any 4xx outside the allowlist.
   - Allowlist: `401` on `/auth/refresh` followed by success; `404` on `*/photo`; Google Maps script load failures.
4. **Visible validation or error.**
   - `[aria-invalid="true"]:visible`
   - `.text-ds-danger:visible` with text
   - `[data-sonner-toast][data-type="error"]`
   - empty-state text "Failed to load"
   - any of these at the moment of `assertClean`.
5. **Durations.**
   - Story final duration outside 480–720 s.
   - Any walkthrough chapter under 10 s (warn above 60 s).
   - Phone clip outside 60–170 s.
6. **Frames.**
   - Extract one frame every 10 s to `.work/frames/{story|full}/`.
   - Fail on any frame with mean luma above 245 or below 8 for at least 2 consecutive samples (white or black flash). Use `ffmpeg … -vf "fps=1/10,signalstats" -f null -` plus the `blackdetect` filter.
   - These frames are also handed to the human reviewer.
7. **Marks.**
   - Every expected story shot id (`1.0` … `9.4`, minus documented skips) is present in the marks files.
   - All FIX-REQ fallbacks used are listed in `SHOWCASE.md` under "Notes".

**Successful run**
- Write `SHOWCASE.md`: video links, durations, sizes, both chapter lists, the regenerate command `node scripts/record-demo.mjs`, and the FIX-REQ status.
- Delete `.work/*.webm` only after the MP4s pass.

### D.10 Output specs

| Property | Value |
|---|---|
| Resolution | 1920×1080 |
| Frame rate | 30 fps CFR |
| Video codec | H.264 High, yuv420p, CRF 16–18 |
| Container | MP4 with faststart |
| Audio | AAC 128k silent track |
| Size target | Story ≤ 250 MB; walkthrough ≤ 700 MB. Raise CRF to 20 if over. |

**If Playwright video text looks soft** in the frame review (blurred table text at 100% zoom):
- Switch the desktop capture to CDP `Page.startScreencast` (format jpeg, quality 92, everyNthFrame 1).
- Write frames with timestamps and assemble with ffmpeg concat and per-frame durations.
- This is the documented fallback only; try the built-in recorder first.

---

## E. Risks and fallbacks by scene

| Scene / area | Risk | Detection | Fallback |
|---|---|---|---|
| All | Session expires mid-take (token refresh race) | 401 followed by redirect to /login | FR-11. Separate contexts per segment. Abort and retake. |
| All | ListPage refetch or remount flicker after create | Frame review | Add `settle()` after list search. B2 should fix. |
| All | DatePicker selectors change (B3 dropdowns) | `pickDate` probes both UIs | Built in. |
| All | Combobox filters by value, not label (pre-B3) | Typed query shows no option | Type a substring that matches the stored id or label. If still empty, open without typing and scroll to the option. |
| 1 | Bell has no aria-label; notification click is a no-op | FR-9 | Bell via `svg.lucide-bell`; navigate with sidebar Inbox. |
| 1 | Inbox "Sent" column empty for an incoming row | Column text | Ensure `sent_at` is set in the pre-roll insert. |
| 2 | `toISOString` date shifts a day (IST) before B3 | Detail Travel Date ≠ TRAVEL_START | Only matters if B3 has not landed. Then pick TRAVEL_START + 1 so it saves correctly. Note it. |
| 2 | Lead list redirect after save does not show the new lead (sort) | Search returns 0 rows | Search "Priya". Default sort is created desc. |
| 3 | Template preview "Days planned" is 0 if `templateData` is not parsed | Dialog text | Ensure the API returns `templateData` as an object or a parsed string. If it shows 0, remove that row from the shot (do not hover). |
| 3 | Rate-card picker shows N/A or 0 (field mismatch) | FR-6 | Skip 3.7. 3.1 still shows rate cards. |
| 3 | Share link clipboard denied, causing an error toast | Toast type | Context permissions `clipboard-read` and `clipboard-write`. |
| 4 | Template placeholders `[Destination]` visible | FR-5 / D.9 regex | Retype the subject and paste the body (4.3). |
| 4 | Queue consumer marks the message failed | Inbox status later | Never revisit the inbox in the story. Between-takes SQL resets it. |
| 5 | Invoice GST select ambiguous (two "%" selects) | — | Locate within the row containing the text "GST": `locator('div', {hasText:/^GST/}).getByRole('combobox')`. |
| 5 | Payment dialog amount stays prefilled | Assertion on input value | Ctrl+A, then type. |
| 5 | Voucher Lead combobox has no placeholder text | — | `getByRole('combobox').first()` inside the "Lead & type" SectionCard. |
| 6 | Ravi or the vehicle missing from the combobox (status filter) | Option absent | Seeder asserts Ravi `active` and KA 05 MN 4521 `available` right before Part A. Reset them via API if T07 changed them. |
| 6 | Trip type not settable (FR-7) | — | Omit it. Captions never say "airport pickup type". |
| 6 | `T_PICK` after 21:30 IST | Preflight | Abort before recording. |
| 7 | OTP bypass not in TEST_MODE | FR-1 | Blocking. Report to B4. |
| 7 | OTP rate limit 429 on a retake | `DEMO_MARK` error / snackbar | Pre-roll and retake SQL `DELETE FROM driver_otp_log`. |
| 7 | Today tab empty (UTC versus IST) | Dry run | Blocking FR-2. |
| 7 | Location permission dialog covers the UI | Screen shows a system dialog | Runtime grant on `ready`. If the dialog still appears, stop and fix manifest permissions (B8). |
| 7 | Soft keyboard covers fields | Frame review | `hw.keyboard=yes`. Also run `adb shell settings put secure show_ime_with_hard_keyboard 0`. |
| 7 | screenrecord 180 s cap | Mark timing | Under 170 s budget. Otherwise run two segments (`--time-limit` and restart at `DEMO_MARK split`) and concatenate. |
| 7 | Check-in screen gets a stale location | Coordinates differ from 10.152 | Geo fix before the test starts; the test waits for the coordinates text before Confirm. |
| 8 | Timeline label "check_in" is raw | FR-8 | Caption covers it. Acceptable. |
| 8 | Fleet dashboard "Recently Completed" ordering | Text absent | Hover "Fleet Status" instead. Do not assert the passenger name. |
| 9 | Dashboard does not list Priya | Text absent | Drop that assertion. Keep the caption generic. |
| Walkthrough AI | Any click that calls the LLM | — | Excluded by design. Extraction "Confirm" only if `ai-extractions` confirm makes no AI call. Check the route first. |
| Walkthrough Import | Import queue does not process locally | Progress stuck more than 20 s | Show template download and column mapping only. Skip the upload. Note it. |
| Walkthrough Calls / VoIP | No call table rows; dial page needs Twilio | Empty state | Show analytics and settings only. Never dial. |
| Walkthrough Super Admin | Gated by the super_admins registry | "access required" text | A.9 #4. Abort if missing. |
| Walkthrough Settings | Secrets visible (integrations key, VoIP SID) | D.9 #2 | Mask style. |
| Walkthrough Team | Pending invites show "Invited" badges | Visual | A.9 #3. The live invite (Meera) is meant to be pending. |
| Data | Shared local DB means `/test/reset` re-creates the "Test Agency" and e2e users | D.9 regex | A.9 #1 runs on every seed. Gate catches leftovers. |
| Data | Real emails or SMS sent | — | Providers blanked via `--var` (0.3). Example domains used for people. |

---

### Critical files for implementation
- `C:/Users/Admin/Downloads/pro/CRM/desktop/e2e/showcase/showcase-helpers.ts` (rewrite) and `C:/Users/Admin/Downloads/pro/CRM/desktop/playwright.showcase.config.ts`
- `C:/Users/Admin/Downloads/pro/CRM/desktop/e2e/helpers/api-seed.ts` (API patterns to reuse) and `C:/Users/Admin/Downloads/pro/CRM/backend/routes/test.ts`, actual path `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/test.ts` (what reset creates and must be fixed up)
- `C:/Users/Admin/Downloads/pro/CRM/desktop/src/app/(app)/fleet/trips/new/page.tsx` and `C:/Users/Admin/Downloads/pro/CRM/desktop/src/app/(app)/itineraries/templates/page.tsx` (story-critical forms and dialogs)
- `C:/Users/Admin/Downloads/pro/CRM/packages/driver_app/lib/features/trips/presentation/screens/trip_detail_screen.dart` (action buttons the integration test drives) and `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/driver.ts` (OTP, transitions, check-in)
- `C:/Users/Admin/Downloads/pro/CRM/desktop/src/components/communication/send-message-dialog.tsx` (Scene 4 behaviour and the placeholder issue)
