# Tour operator wave: design

- Written by the readiness planner on 2026-10-21. Planning only: nothing here is built yet.
- Batches: `docs/readiness/batches/R136-*.json` to `R162-*.json`, run order in `docs/readiness/batches/INDEX.json` (tier 4).
- Owner decisions applied (2026-10-21):
  - Build every gap found while mapping a fixed-departure coach-tour agency onto the product, before the next client film is recorded.
  - Keep each feature general and configurable for each agency ("generic, configurable as per the tenant need").
  - Invoice tax stays configurable.
  - Calling in the Netherlands and a Dutch interface are in scope, built as general EU readiness with the Netherlands first.
- Read with: `docs/readiness/READINESS-PLAN.md` section 0 (how a batch runs) and `desktop/audit/remake/CONTRACT.md` (desktop UI contract).
- This design names no agency. Everything below is a product feature that any agency can switch on. An agency that does not switch it on sees nothing new.

## 0. What this wave adds, in one paragraph

Today the product sells custom trips: a lead, a quote built from a template, an invoice and a voucher.

This wave adds **fixed-departure group tours**:
- a tour (the product) and its dated departures, with seat capacity from the coaches;
- seats held, confirmed or waitlisted per booking;
- a passenger manifest with pickup points, rooms, meals and documents;
- a public booking page per departure;
- a self-service page where each party picks paid extras, enters traveller details and pays;
- coach trips with ordered stops and passenger check-in on the driver app, which a tour leader can also use;
- messages sent N days before or after a departure, with each person's own pickup time.

Around that:
- **Amounts and banks** stop assuming India.
- **Payment links** can be shown working locally, with deposit and balance amounts.
- **Quotes** gain age-band pricing and an "Accept and book" button.
- **Invoices** gain a margin-scheme mode.
- **The website chat** can ask for contact details.
- **Leads** get a drag-and-drop pipeline board.
- **Customer emails** reach the local outbox in test mode.
- **Calling** becomes ready to switch on in the Netherlands.
- **A Dutch interface** is added.

## 1. Words and naming

| Word | Meaning | Code name |
|---|---|---|
| Tour | A product sold on fixed dates (title, template, prices, stops, extras). | `tours` |
| Departure | One dated run of a tour, with capacity and status. | `departures` |
| Seat booking | One party's claim on seats of one departure, tied to a lead. | `seat_bookings` |
| Passenger | One person in a seat booking (manifest row). | `seat_passengers` |
| Extra | An optional paid item (excursion, meal, ticket), per tour, departure or day. | `tour_extras`, `passenger_extras` |
| Stop | An ordered pickup or drop point, on a departure and on a coach trip. | `departure_stops`, `trip_stops` |
| Tour leader | A crew member who runs check-in on the coach (a `drivers` row with a crew role). | `drivers.crew_role` |

**Naming collision, avoided.**
- "Add-on" already means a platform purchase: `addon_products`, `tenant_addons`, `addon_orders` (R206), `services/billing/addons.ts`.
- So the code never uses `addon` for tour items. The tables and routes are called **extras**.
- The English interface may still show "Add-ons", through `t()`.

**Bookings.** There is no `bookings` table. A booking is a lead at status `won` / `booking_confirmed` with its itinerary and invoices, and that stays true. A seat booking hangs off the lead and adds seats; it does not replace the lead.

## 2. How an agency switches it on

Every new module has two layers.

1. **Plan feature (platform side, R127).**
   - Each key is added to `backend/src/services/features/registry.ts`, and to `plan_features` in master migration 0030.
   - The super admin can move a key between plans, switch it off for every agency, or override it for one agency (Feature switches console).
   - Backend routes check it with `requireFeature()`, mounted in `backend/src/index.ts` for staff routes and called through the resolved tenant on public routes, like `routes/public-chatbot.ts` does.
2. **Agency switch (agency side).**
   - A setting the agency's admin turns on under Settings. Example: `group_tours.enabled`, default **off**.
   - The sidebar and every entry point show a module only when both the plan feature and the agency switch are on.
   - An agency that sells custom trips only sees nothing new. At most it sees one card on the Settings hub: "Sell fixed-departure group tours?" with a switch. The card is hidden when the plan lacks the feature.

The desktop reads plan features through `GET /ai/settings` (`aiFeatures`); new keys are added to `AI_FEATURE_KEYS` in `backend/src/routes/ai-settings.ts` and to `GatedFeature` in `desktop/src/hooks/use-feature-gate.ts`, the pattern `voip_calling` and `whatsapp_campaigns` already use. The list's name ("AI") is historical; a rename is out of scope.

### 2.1 Feature keys and plan placement (owner can change any of these in the console)

| Key | Name (console) | Area | trial | basic | pro | enterprise | Why this plan |
|---|---|---|---|---|---|---|---|
| `group_departures` | Group departures | Tours | yes | no | yes | yes | The core of a tour operator's work; a Pro differentiator. Covers tours, departures, seats, waitlist, manifest, staff-side extras, departure messages, seat reports. |
| `public_booking` | Public booking pages | Tours | yes | no | yes | yes | The booking page and the self-service extras / details / pay page. Needs `group_departures`. |
| `coach_trips` | Coach trips and check-in | Core | yes | yes | yes | yes | Ordered stops and passenger check-in on any coach trip; fleet is in every plan. Passenger lists from a departure also need `group_departures`. |
| `age_band_pricing` | Age-band pricing | Core | yes | yes | yes | yes | Quoting basics; not a paywall item. |
| `margin_scheme` | Margin-scheme invoices | Core | yes | yes | yes | yes | Tax compliance must not be paywalled. |
| `quote_acceptance` | Accept quotes online | Core | yes | yes | yes | yes | Closing basics. Holding seats on accept also needs `group_departures`. |

No new key for:
- chat contact capture (existing `ai_chatbot`);
- the leads board (a view of an existing page);
- the mock gateway (test mode only);
- deposit links (existing payment links);
- calling in the Netherlands (existing `voip_calling` plus the country gate);
- the Dutch interface (languages are not plan-gated).

All six keys are added in one master migration (0030, batch R139) so later batches never touch the master database for keys. A key whose module is not built yet resolves but guards nothing until its batch lands.

## 3. Data model

All tenant tables use UUIDv7 ids (`utils/uuid.ts` `generateId()`). Dates are TEXT ISO 8601, money is REAL, JSON is TEXT and booleans are INTEGER. Every list table has `is_deleted` where staff can delete.

The relations, in short:
- tours → departures → seat_bookings → seat_passengers;
- seat_bookings → leads → contacts;
- seat_passengers → travellers (optional);
- trip_assignments → departures, and trip_stops → departure_stops.

### 3.1 Tenant migration 0057_group_departures.sql (batch R139)

**`tours`**: the product.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| code | TEXT NOT NULL UNIQUE | Short code shown in lists and departure codes (e.g. `ALPS5`). |
| title, description, destination | TEXT | |
| itinerary_template_id | TEXT FK itinerary_templates | The day plan and quote lines a booking's quote starts from. |
| duration_days | INTEGER | |
| currency | TEXT | NULL = agency currency. |
| default_capacity | INTEGER | Used when a departure has no vehicles. |
| booking_cutoff_days, extras_cutoff_days, hold_expiry_hours | INTEGER NULL | Overrides of the agency settings (NULL = setting). |
| confirm_mode | TEXT NULL | `manual`, `auto_when_available`, `on_deposit`; NULL = setting. |
| deposit_type, deposit_value | TEXT NULL, REAL NULL | `none`, `percent`, `per_seat`, `fixed`; NULL = setting. |
| passenger_fields, room_types | TEXT JSON NULL | Overrides of the agency lists (section 4). |
| terms | TEXT | Shown on the booking page; NULL = itinerary defaults terms. |
| status | TEXT | `active`, `archived`. |
| created_by, created_at, updated_at, is_deleted | | |

**`tour_stops`**: the tour's default pickup and drop points.

| Column | Notes |
|---|---|
| id, tour_id FK | |
| sort_order | |
| name, address, lat, lng | |
| local_time | `HH:MM`, on the departure day plus day_offset. |
| day_offset | Default 0. |
| kind | `pickup`, `dropoff`, `both`, `waypoint`. |
| documents_check | INTEGER: documents are checked at this stop. |
| notes | |

**`departures`**: one dated run.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| tour_id | TEXT FK tours | |
| code | TEXT UNIQUE | Default `<tour code>-<YYYY-MM-DD>`, editable. |
| start_date, end_date | TEXT | Tenant-local dates. |
| start_time | TEXT NULL | `HH:MM`. |
| status | TEXT | `draft`, `open`, `closed`, `departed`, `completed`, `cancelled` (section 5.2). |
| capacity_mode | TEXT | `vehicles` (sum of departure_vehicles.capacity) or `manual`. |
| capacity | INTEGER | Stored; recomputed when vehicles change in `vehicles` mode. |
| booking_cutoff_date, extras_cutoff_date | TEXT NULL | Computed from the tour or settings at creation, editable. |
| hold_expiry_hours, confirm_mode, show_seats_left | NULL | Overrides. |
| public_booking_enabled | INTEGER | Default 0. |
| tour_leader_driver_id | TEXT FK drivers | |
| tour_leader_user_id | TEXT FK users | |
| calendar_event_id | TEXT | The `events` row kept in sync (section 9.4). |
| notes, cancelled_reason | TEXT | |
| created_by, created_at, updated_at, is_deleted | | |

Index: (tour_id, start_date) and (status, start_date).

**`departure_vehicles`**: coaches on a departure.

| Column | Notes |
|---|---|
| id, departure_id FK | |
| vehicle_id | FK vehicles; NULL for a hired coach. |
| label | |
| capacity | Default `vehicles.seating_capacity`, else `group_tours.defaultVehicleCapacity`. |
| driver_id | FK drivers. |
| seat_layout | JSON NULL: rows, columns, aisle, seat labels, premium seats. |
| sort_order | |

**`departure_stops`**: copied from `tour_stops` when a departure is created, then editable. The columns are the same as `tour_stops` plus `scheduled_at` (UTC ISO, computed from the departure date, day_offset and local_time in the tenant zone).

**`tour_prices`**: prices by age band, room supplements and seat surcharges.

| Column | Notes |
|---|---|
| id, tour_id FK | |
| departure_id | FK, NULL = tour default; a departure row overrides the tour row with the same kind and key. |
| kind | `age_band`, `room_supplement`, `seat_surcharge`, `other`. |
| key | The band key (section 4.2), room type key, or a free key. |
| label | |
| amount | |
| currency | NULL = tour currency. |
| sort_order | |

**`seat_bookings`**: one party's seats.

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| departure_id | TEXT FK | |
| lead_id | TEXT FK leads NOT NULL | Every seat booking has a lead (created if needed). |
| contact_id | TEXT FK contacts NOT NULL | |
| itinerary_id, invoice_id | TEXT NULL | The quote; the main invoice. |
| status | TEXT | `held`, `confirmed`, `waitlisted`, `cancelled`, `expired` (section 5.1). |
| seats | INTEGER | Equals the count of active passengers once passengers are known. |
| hold_expires_at | TEXT NULL | UTC. |
| waitlist_position | INTEGER NULL | |
| offered_at | TEXT NULL | Set when a waitlisted party is offered seats. |
| confirmed_at, confirmed_by | | `confirmed_by` is a user id, or `auto`, `deposit` or `quote_accept`. |
| cancelled_at, cancel_reason | | |
| source | TEXT | `staff`, `public_page`, `quote_accept`, `assistant`, `import`. |
| room_notes, notes | TEXT | |
| created_by, created_at, updated_at | | |

Indexes:
- (departure_id, status);
- (lead_id);
- a unique partial index on (departure_id, lead_id) WHERE status IN ('held','confirmed','waitlisted').

**`seat_passengers`**: the manifest.

| Column | Notes |
|---|---|
| id, seat_booking_id FK, departure_id FK | departure_id is denormalised for manifest queries. |
| traveller_id | FK travellers, NULL until linked or created from self-service. |
| first_name, last_name | `last_name` may be empty until known. |
| gender | |
| date_of_birth | |
| age_years | When no DOB, e.g. from "kids aged 8 and 5". |
| band_key | Age band. |
| pickup_stop_id | FK departure_stops. |
| room_type | Key from the room types list. |
| share_ok | Willing to share. |
| share_gender | Same-gender sharing preference. |
| room_group | Rooming list group / room number. |
| seat_number, seat_surcharge | |
| meal_preference | |
| documents_status | `unknown`, `provided`, `checked`, `problem`. |
| documents_checked_at, documents_checked_by_driver_id, documents_checked_by_user_id | |
| extra_fields | JSON: values of agency-defined passenger fields (section 4.1). |
| status | `active`, `cancelled`. |
| created_at, updated_at | |

**`tour_extras`**: the extras catalogue.

| Column | Notes |
|---|---|
| id | |
| tour_id | FK, NULL = every tour. |
| departure_id | FK, NULL = every departure of the tour. |
| day_number | NULL = whole trip. |
| title, description | |
| price, currency | |
| band_prices | JSON NULL `{bandKey: amount}`. |
| rate_card_id | FK rate_cards, optional: the price follows the rate card while set. |
| supplier_id | |
| capacity | NULL = unlimited. |
| cutoff_hours_before | NULL = departure extras cut-off. |
| refundable_until_hours | |
| is_active, sort_order, created_at, updated_at | |

**`passenger_extras`**: choices.

| Column | Notes |
|---|---|
| id, seat_passenger_id FK, tour_extra_id FK, departure_id | |
| quantity, unit_price, currency | |
| status | `selected`, `invoiced`, `paid`, `cancelled`. |
| invoice_id, invoice_item_id | |
| selected_via | `staff`, `self_service`. |
| created_at, updated_at | |

**`departure_costs`**: the cost side, for margin and the margin scheme.

| Column | Notes |
|---|---|
| id, departure_id FK | |
| supplier_id | |
| description | |
| kind | `per_departure`, `per_seat`. |
| amount, currency | |
| created_by, created_at | |

**`departure_message_rules`**: section 9.3.

| Column | Notes |
|---|---|
| id | |
| tour_id | NULL = all tours. |
| name | |
| template_id | FK message_templates. |
| channel | `preferred`, `whatsapp`, `email`, `sms`. |
| fallback_channel | |
| anchor | `start`, `end`, `extras_cutoff`. |
| offset_days | Signed. |
| local_time | `HH:MM`. |
| audience | `confirmed`, `confirmed_and_held`, `waitlisted`. |
| recipient | `booking_contact`, `each_passenger_with_contact`. |
| purpose | `service` or `marketing`; consent rules differ. |
| mode | `auto`, `suggest`. |
| is_active, created_by, created_at, updated_at | |

**`departure_message_sends`**: one row per rule, departure, booking and passenger.

| Column | Notes |
|---|---|
| id, rule_id, departure_id, seat_booking_id, seat_passenger_id NULL, contact_id | |
| message_log_id, suggestion_id | |
| status | `sent`, `suggested`, `skipped_opt_out`, `skipped_cap`, `skipped_no_address`, `failed`. |
| detail, created_at | |

Unique on (rule_id, departure_id, seat_booking_id, IFNULL(seat_passenger_id,'')): a message goes out once.

**Columns added to existing tables in 0057:**
- `itineraries.departure_id` (FK departures), `itineraries.seats_requested` (INTEGER);
- `leads.departure_id`: the departure the enquiry is about; set by the booking page and the "Hold seats" action;
- `events.related_departure_id`.

**Bundle.** The migration bundle is regenerated with `node backend/scripts/bundle-tenant-migrations.mjs`, which updates `backend/src/db/tenant-migrations.generated.ts`.

### 3.2 Other tenant migrations of the wave

| No. | File | Batch | What |
|---|---|---|---|
| 0058 | `0058_payment_link_amounts.sql` | R142 | `invoices` ADD `payment_link_amount` REAL, `payment_link_purpose` TEXT (`deposit`, `balance`, `custom`). |
| 0059 | `0059_coach_trip_stops.sql` | R145 | `trip_stops`, `trip_passengers` (section 3.3); `trip_assignments` ADD `departure_id`, `trip_kind` (`transfer`, `coach`; default `transfer`), `tour_leader_id` (FK drivers); `drivers` ADD `crew_role` (`driver`, `tour_leader`, `both`; default `driver`), `user_id` (optional link to a staff user). |
| 0060 | `0060_age_bands.sql` | R149 | `itinerary_templates` ADD `age_bands` TEXT; `itineraries` ADD `age_bands` TEXT (snapshot), `pax_ages` TEXT (JSON list used for the last fill). |
| 0061 | `0061_chatbot_contact_capture.sql` | R151 | `chatbot_config` ADD `contact_capture` TEXT (JSON, section 13.1). |
| 0062 | `0062_margin_scheme.sql` | R152 | `invoices` ADD `margin_cost` REAL, `margin_cost_source` TEXT, `margin_vat_rate` REAL, `margin_wording` TEXT. |
| 0063 | `0063_quote_acceptance.sql` | R155 | `itineraries` ADD `accepted_at`, `accepted_via` (`share_link`, `staff`, `message`), `accepted_name`, `accepted_ip_hash`. |

The Dutch interface (R136) and the other batches need no tenant migration.

### 3.3 Coach trips (0059)

**`trip_stops`**

| Column | Notes |
|---|---|
| id, trip_id FK trip_assignments (cascade) | |
| departure_stop_id | NULL for a trip with no departure. |
| sort_order | |
| name, address, lat, lng | |
| scheduled_at | |
| documents_check | |
| status | `pending`, `arrived`, `departed`, `skipped`. |
| arrived_at, departed_at, arrived_lat, arrived_lng | |
| created_at, updated_at | |

**`trip_passengers`**

| Column | Notes |
|---|---|
| id, trip_id FK (cascade), trip_stop_id FK | |
| seat_passenger_id | NULL for an ad-hoc passenger. |
| contact_id | |
| name, phone, seats | `seats` default 1. |
| boarding_status | `pending`, `boarded`, `no_show`. |
| boarded_at | |
| marked_by_driver_id, marked_by_user_id | |
| documents_checked, documents_checked_at | |
| last_op_id | Idempotency for offline ticks from the app. |
| notes, created_at, updated_at | |

Boarding is per trip, so a multi-day tour can count heads each morning. A "documents checked" tick is mirrored to `seat_passengers.documents_status = 'checked'`.

### 3.4 Master migrations of the wave

| No. | File | Batch | What |
|---|---|---|---|
| 0029 | `0029_calling_eu_nl.sql` | R137 | Calling in the Netherlands, section 16. |
| 0030 | `0030_tour_operator_features.sql` | R139 | `plan_features` rows for the six keys (section 2.1). |
| 0031 | `0031_public_links.sql` | R148 | `public_links` (section 7). |

## 4. Configuration (tenant settings, defaults, where in the UI)

Settings live in the tenant `settings` table as one JSON value per key, the same as `itinerary_defaults`.

- Defaults live in code, in one function per key, so a missing row reads as the defaults.
- The UI lives under Settings.
- Every value below is per agency.
- Tours and departures override the starred ones (*).

### 4.1 `group_tours` (Settings > Group tours, new page; R144)

| Field | Default | Meaning |
|---|---|---|
| enabled | false | The agency switch (section 2). |
| holdExpiryHours* | 48 | A held seat is released after this. |
| confirmMode* | `manual` | `manual`: staff click. `auto_when_available`: confirmed at once while seats remain. `on_deposit`: confirmed when the deposit is paid. |
| markLeadWonOnConfirm | true | A confirmed seat booking moves its lead to `won` if it is earlier in the pipeline. |
| waitlist.enabled | true | |
| waitlist.offerMode | `suggest` | `suggest`: staff see "offer seats to the next party"; `auto_hold`: seats are held for the next party automatically and they are told. |
| waitlist.offerHoldHours | 24 | |
| defaultVehicleCapacity | 49 | Used when a vehicle has no seating capacity. |
| bookingCutoffDays* | 3 | |
| extrasCutoffDays* | 7 | |
| passengerFields* | name, gender, date of birth, pickup point, room type and sharing, meal; optional: nationality, document type, document number, document expiry, second document expiry (e.g. a residence permit) | Each has `required`, `collectOn` (`booking`, `self_service`, `staff_only`). Custom fields `{key, label, type: text, date, select, boolean; options; required}` are allowed and stored in `extra_fields`. |
| roomTypes* | double (2 sharing), twin (2 sharing), triple (3), family (4), single (1) | `{key, label, occupancy}`. Supplements come from `tour_prices` kind `room_supplement`. |
| shareMatching | true | Offer "willing to share" for solo travellers; the rooming list pairs by gender. |
| preferredSeat.enabled | false | |
| preferredSeat.surcharge* | NULL | The surcharge is a `tour_prices` row of kind `seat_surcharge`. |
| showSeatsLeft* | `below_threshold` | `always`, `below_threshold`, `never`: what the public pages show. Staff always see the numbers. |
| seatsLeftThreshold | 10 | |
| deposit.type* / deposit.value* | `none` / NULL | `percent`, `per_seat`, `fixed`. |
| publicBooking.requireTerms | true | |
| publicBooking.termsText | '' | Falls back to the tour's terms, then itinerary defaults. |
| publicBooking.marketingOptIn | true | Shows an unticked marketing opt-in box. |
| driverSeesPassengers | false | Drivers (crew role `driver`) see stops only. Tour leaders always see passengers. |

### 4.2 `pricing.age_bands` (Settings > Itinerary defaults, Age bands card; R149)

The default is `[{key:'adult', label:'Adult', minAge:12}, {key:'child', label:'Child', minAge:2}, {key:'infant', label:'Infant', minAge:0}]`.

How bands work:
- **Each band covers** [minAge, next band's minAge). The list has no gaps by construction.
- **Labels** are free text. A band list such as 12+, 6–11, 4–5 and 0–3 is just four rows.
- **Templates and tours** may carry their own list, which overrides the agency list.
- **Age** is measured on the travel (departure) start date.
- **Keys** are stable (`adult`, `child_6`, ...). `itinerary_items.pax_type` and `tour_prices.key` hold them, and the existing `adult`, `child` and `infant` values keep working.

### 4.3 `payment_defaults` (Settings > Invoice defaults, Payments card; R142)

| Field | Default | Meaning |
|---|---|---|
| deposit.type / value | `none` / NULL | Default deposit for a payment link ("Deposit" button). |
| stripeMethodTypes | NULL | NULL = Stripe dynamic payment methods: the agency's Stripe dashboard decides, and iDEAL shows for EUR when enabled there. A list (`card`, `ideal`, `bancontact`, `sepa_debit`) is sent as `payment_method_types[]` after validation by currency (iDEAL and Bancontact EUR only). |
| bankReference | `{invoice_number}` | The reference customers are asked to use for a bank transfer. |

### 4.4 `bank_details` (existing key, extended; R140)

The existing JSON gains country-shaped fields. Which fields show, and which print, follows the agency country:

| Country | Fields |
|---|---|
| IN | account name, account number, IFSC, bank, branch, UPI id |
| GB | account name, sort code, account number, IBAN, BIC |
| EU, EEA, CH | account name, IBAN, BIC, bank |
| US | account name, routing number, account number, SWIFT |
| AU | account name, BSB, account number |
| Gulf | account name, IBAN, SWIFT |
| Other | account name, IBAN or account number, SWIFT |

Validation:
- IBAN by mod-97;
- BIC/SWIFT by format;
- sort code and BSB as 6 digits.

The old `ifsc` and `upi_id` keys keep working.

### 4.5 `margin_scheme` (Settings > Invoice defaults, Tax card; R152)

| Field | Default | Meaning |
|---|---|---|
| enabled | false | Offer "Margin scheme" as a tax treatment. |
| defaultFor | `none` | `none`, `tour_bookings`, `all_invoices`: when new invoices start in margin mode. |
| wording | '' | The legal mention printed on the invoice. Presets are offered (section 12) and stay editable. |
| vatRate | NULL | No default. The report computes VAT on the margin only when the agency enters its rate. |
| costSource | `auto` | `auto`: departure costs per seat for seat bookings, else itinerary cost; or `manual`. |

### 4.6 `quotes.accept` (Settings > Itinerary defaults, Quote link card; R155)

| Field | Default | Meaning |
|---|---|---|
| enabled | false | |
| label | "Accept and book" | Through `t()`, editable per agency. |
| requireName | true | |
| requireTerms | true | |
| holdSeats | true | |
| createInvoice | `none` | `none`, `proforma`, `invoice`. |
| offerDeposit | true | |

### 4.7 `leads.board` (Leads page, board settings; R153)

| Field | Default |
|---|---|
| columns | Every pipeline status in order, `on_hold` hidden. |
| showValue | true |

### 4.8 Chatbot `contact_capture` (Settings > Chatbot; R151)

| Field | Default | Meaning |
|---|---|---|
| mode | `off` | `off`, `before_chat`, `after_first_reply`, `before_handoff`. |
| fields | name optional, email optional, phone optional | Each is `required`, `optional` or `hidden`. |
| requireOneOf | `['email','phone']` | |
| consentText | '' | |
| marketingOptIn | false | |
| autoCreateLead | false | |

## 5. State machines

### 5.1 Seat booking

```
             request (seats <= free)            confirm (staff, auto, deposit paid, quote accepted)
  (none) ──────────────────────────► held ──────────────────────────────────────────► confirmed
     │                                 │  ▲                                                  │
     │ request (seats > free,          │  │ offer (waitlist, seats freed)                    │ cancel
     │ waitlist on)                    │  │                                                  ▼
     └──────────────► waitlisted ──────┼──┘                                            cancelled
                          │            │ hold_expires_at passed (cron)
                          │ cancel     ▼
                          └────► cancelled    expired
```

Rules:
- **Capacity invariant.** The sum of `seats` over `held` and `confirmed` is at most `departures.capacity`.
  - It is enforced by one conditional statement: `INSERT ... SELECT ... WHERE capacity - (SELECT SUM ...) >= ?`, and the same for UPDATE.
  - D1 runs each statement atomically, so two requests can never oversell.
  - The service returns `SEATS_UNAVAILABLE` (409) with `seatsLeft`.
- **Requests when full.** With the waitlist on, a request becomes `waitlisted` (position = max + 1). With it off, it gets 409.
- **Hold expiry** runs in the 5-minute per-agency cron job `departures.expire-holds` (period `tick`, `backend/src/cron/dispatch.ts`). It frees the seats and emits `seat_booking.expired`.
- **Freed seats** (cancel, expire, capacity raised, seats reduced) run the waitlist step:
  - `suggest`: an assistant suggestion "Offer N seats to X".
  - `auto_hold`: hold for the next fitting party, `hold_expires_at` = now + offerHoldHours. The party is told through the confirmation recipe's template.
- **Confirmation triggers:**
  - staff "Confirm" (button or bulk);
  - `auto_when_available` at request time;
  - `on_deposit`, on `payment.recorded` for the booking's invoice reaching the deposit amount;
  - quote acceptance with confirm mode `auto_when_available`.
- **The lead follows the booking:**
  - on create, `leads.departure_id` and `travel_date` are set;
  - on confirm, the lead moves to `won` if `markLeadWonOnConfirm` is on and the lead is earlier in the pipeline;
  - on cancelling the last active booking, a "mark lost?" suggestion appears.
- **Passengers:**
  - `seats` = count of active passengers once any passenger exists;
  - adding a passenger needs a free seat, or the booking stays as is and staff get 409;
  - cancelling a passenger frees one seat.
- **Statuses are terminal**: `cancelled` and `expired` never come back. A new request makes a new row.

### 5.2 Departure

`draft → open → closed → departed → completed`. Any state before `departed` can also go to `cancelled`.

- **open** accepts requests: from staff, from the booking page when `public_booking_enabled`, and from accepted quotes.
- **closed** happens automatically at `booking_cutoff_date` (local-day cron) or by hand. Staff can still add seats; the booking page shows "closed".
- **departed** is set automatically on `start_date` or by the first trip check-in.
- **completed** is set automatically the day after `end_date`. It feeds the post-trip recipes.
- **cancelled** asks for a reason. It does not cancel bookings by itself. It offers "cancel all bookings and notify" with a template, and suggests refunds.
- **"Full"** is computed (seats left = 0), not a status. The `departure.full` and `departure.seats_low` events fire on the transition.

### 5.3 Passenger on a trip

`pending → boarded` or `pending → no_show`, reversible until the trip is completed. Each tick carries an `opId`; a repeated `opId` is ignored, which is how offline retries stay safe.

`documents_checked` is independent of boarding.

The head count of a stop is boarded / expected at that stop. The trip head count is boarded / expected overall.

### 5.4 Extras

`selected → invoiced → paid`, or `cancelled`.

- Choices are editable until the extras cut-off.
- After that, only staff can change them.
- A refund is allowed until `refundable_until_hours`.
- Invoicing creates or updates one "extras" invoice per seat booking (section 8.4).

### 5.5 Quote acceptance

`sent or viewed → accepted`. It is idempotent: a second accept returns the first result.

The quote can no longer be accepted when:
- it has expired (validity date);
- it was revoked;
- its departure is full and the waitlist is off: the page then offers "Join the waitlist" or contact.

### 5.6 Number regulatory bundle (calling)

`none → submitted → platform_review → provider_review → approved`. A rejection at either review gives `rejected`, which goes back to `submitted` on resubmit.

- The super admin approves the documents first. That is the existing `number_documents` review.
- The platform then submits the provider bundle.
- The provider status comes from a signed status callback or an hourly poll.
- Number purchase is allowed only at `approved`.

## 6. APIs

All staff routes are dual-mounted (`/api/v1/...` and `/api/...`) through `routeMounts`. Permission checks use a new module `departures` in `backend/src/constants/permissions.ts`:

| Role | Permissions on `departures` |
|---|---|
| admin | ALL |
| sales_manager | ALL |
| salesperson | view, create, edit (holds and passengers) |
| operations | ALL |
| accountant | view, export |
| view_only | view |

The desktop mirror is updated wherever role checks are duplicated.

### 6.1 Staff routes (feature `group_departures`, mounted at `/tours`, `/departures`)

**Tours** (`/tours`):
- `GET`, `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id` (archive);
- `GET` / `PUT /:id/stops`, `/:id/prices`, `/:id/extras`.

**Departures** (`/departures`):
- `GET /departures` with filters: tour, status, date range, has seats, q; cursor pagination for infinite scroll. Each row carries a `seats` summary: `{capacity, held, confirmed, waitlisted, left}`.
- `POST /departures`: creates the departure and copies the tour's stops and prices.
- `POST /departures/bulk`: several dates of one tour.
- `GET /:id`, `PUT /:id`, `POST /:id/status`.
- Sub-resources: `/:id/vehicles`, `/:id/stops`, `/:id/prices`, `/:id/costs`.

**Seat bookings** (`/departures/:id/bookings`):
- `GET` and `POST`. The POST takes `{leadId | contact + lead fields, seats, passengers?, hold: true}`.
- `POST /seat-bookings/:id/confirm`, `/cancel`, `/offer`, `/move` (to another departure, atomically).
- `PUT /seat-bookings/:id/passengers`.
- `POST /seat-bookings/:id/invoice`: creates or refreshes the booking invoice.
- `POST /seat-bookings/:id/self-service-link`: creates the link and returns its URL. The URL is sent through `SendMessageDialog`, never directly.

**Manifest:**
- `GET /departures/:id/manifest?view=pickup|rooming|full&format=json|csv|pdf`;
- `GET /departures/:id/headcount`.

**On other entities:**
- `GET /leads/:id/seat-bookings`;
- `GET /itineraries/:id`, which gains `departure` and `seats`;
- `POST /leads/:id/hold-seats`, used by the lead page's "Hold seats" action.

**Departure messages** (`/departure-message-rules`): CRUD, plus `POST /departure-message-rules/:id/preview?departureId=` which renders per-person messages without sending.

### 6.2 Coach trips (feature `coach_trips`; R145)

Under `/fleet/trips/:id`:
- `GET` and `PUT /stops`;
- `GET /passengers`;
- `PUT /passengers/:pid` with `{boarding, documentsChecked, opId, at}`;
- `POST /stops/:sid/arrive` and `/depart`;
- `GET /headcount`.

`POST /departures/:id/trips` creates coach trips from a departure: one per vehicle, with stops and passengers copied.

### 6.3 Driver app routes (feature `coach_trips` plus `driver_app`; R145, used by R147)

- `GET /driver/trips/:id` gains `stops[]`, and `passengers[]` when the crew role or setting allows.
- `POST /driver/trips/:id/stops/:sid/arrive` and `/depart`.
- `PUT /driver/trips/:id/passengers/:pid` (same body as staff).
- `GET /driver/trips/:id/headcount`.
- The trip list includes trips where the driver is `driver_id` or `tour_leader_id`.

### 6.4 Public routes (sections 7 and 8)

| Route | Feature | Batch |
|---|---|---|
| `GET /public/departures/:token` | `public_booking` | R148 |
| `POST /public/departures/:token/bookings` | `public_booking` | R148 |
| `GET /public/booking/:token`, `PUT /public/booking/:token/passengers`, `PUT /public/booking/:token/extras`, `POST /public/booking/:token/pay` | `public_booking` | R150 |
| `POST /public/quotation/:token/accept` | `quote_acceptance` | R155 |
| `POST /public/chatbot/:widgetKey/contact` | `ai_chatbot` | R151 |
| `GET /webhooks/payments/mock-pay/:tenantKey/:linkRef` and `POST` (test mode only) | none | R142 |

## 7. Public pages and their security

**Pages.** The customer pages are served by the agency web app, like the existing `/q/[token]` quote page (`desktop/src/app/(public)/`):
- `/book/[token]`: the booking page of one departure;
- `/trip/[token]`: the self-service page of one seat booking, or of one passenger.

URL helpers in `backend/src/utils/app-urls.ts` are `bookingUrl(env, token)` and `tripUrl(env, token)`. They use `PUBLIC_PAGES_URL` when set, else `${appUrl}/book` and `/trip`, the same pattern as `quoteUrl`.

**Token table** (master 0031), `public_links`:

| Column | Notes |
|---|---|
| token | TEXT PK |
| tenant_id | |
| kind | `departure_booking`, `booking_self_service`, `passenger_self_service` |
| entity_id | |
| is_active | |
| expires_at | NULL allowed |
| created_at, last_used_at | |

Index on (tenant_id, kind, entity_id).

**Tokens are 128-bit random values** (base64url of `crypto.getRandomValues`), never UUIDv7. A UUIDv7 carries a timestamp prefix and is easier to guess.
- The existing quote links use `generateId()`.
- That is noted as a known weakness and left for a separate batch, because changing it would invalidate links already sent.

**Tenant resolution.** The tenant is found from `public_links` before any tenant database is opened. Unknown, revoked and wrong-kind tokens all answer the same 404 body; expired tokens answer 410. Nothing reveals which agencies or bookings exist.

**Gates on every request.** All three must hold, else 404:
- the feature `public_booking` for the resolved tenant (`requireFeature` called as in `public-chatbot.ts`);
- `group_tours.enabled`;
- the departure's `public_booking_enabled`, and status `open`.

**Rate limits** (`middleware/rate-limit.ts`, KV), per IP unless stated:

| Request | Limit |
|---|---|
| GET | 60/min |
| POST booking | 5 per 10 minutes, and 30 per hour per token |
| Self-service writes | 30/min per token |
| Pay | 5/min per token |
| Accept | 5 per 10 minutes |

**What the pages return.** The response is a fixed public projection:
- agency name, logo and colours (`tenant_branding`);
- tour title, dates, day plan (no internal notes, no cost prices — the same omissions as the quote page);
- prices by band, room supplements, seat surcharge, pickup points and times, extras, terms;
- seats left only as `showSeatsLeft` allows (`"few"` or a number or nothing).

It never includes other bookings, passenger names, staff names or ids other than the token.

**Self-service pages** show only the booking's own passengers. A saved document number is returned masked (last 3 characters).

**Abuse controls:**
- a honeypot field and a minimum fill time (3 s) on the booking form;
- optional Cloudflare Turnstile when `TURNSTILE_SECRET_KEY` is set, degrading gracefully (no key = honeypot only);
- an `Idempotency-Key` header stored in KV for 24 h, so a double submit creates one booking.

**Booking creation:**
- `findOrCreateContact` and `createLead` from `services/domain/*`, with source `website`, currency = tour or agency currency, and `travel_date` = departure start;
- a seat booking `held` with passengers;
- a consent record (`contact_consents`, source `form`) for the terms, and for marketing only when ticked;
- `lead.created` and `seat_booking.held` events, so the existing assignment and follow-up recipes run.

**Headers and embedding:**
- `X-Robots-Tag: noindex`;
- `Cache-Control: no-store` on token pages;
- embedding the booking page in the agency's own website is allowed through `frame-ancestors` built from the chatbot's `allowed_origins` list; otherwise the page sends `frame-ancestors 'self'`.

**Languages.** Public pages render in the agency's default language (`default_language` setting). The visitor can switch between the enabled languages; section 17 covers `nl`.

## 8. Payments

### 8.1 Local test gateway for agency payment links (R142)

**Gateway.** `AgencyGatewayId` gains `mock`. It is accepted only when `mockAllowed(env)` (`services/billing/gateway.ts`: TEST_MODE or BILLING_GATEWAY=mock, never production).

**Connecting.** Settings > Integrations shows a "Local test gateway" card only when `GET /integrations/payment-gateways` reports `mockAvailable: true`. Connecting it stores a `payment_gateway_accounts` row with gateway `mock` and no secrets.

**Creating a link.** `createPaymentLink` for `mock`:
- stores `{tenantId, invoiceId, amount, currency, linkId}` in KV `mockpay:<linkRef>` for 7 days;
- returns `${API_PUBLIC_URL}/api/v1/webhooks/payments/mock-pay/<tenantKey>/<linkRef>`.

**The mock pay page** is HTML served by the API, like `/billing/mock-checkout`. It shows:
- agency name and amount;
- payment methods by currency: EUR shows iDEAL, card and Bancontact; GBP shows card and Pay by bank; INR shows UPI and card; other currencies show card;
- Pay, Fail and Cancel buttons.

Pay builds the event, signs it with `mockSecret(env)` (`X-Mock-Signature`), and runs it through the same handler as `POST /webhooks/payments/:tenantKey/mock`. That records the payment once, through `recordInvoicePayment`. It then redirects to `return`, which must start with `APP_URL`, or to a plain "Payment received" page.

**Production.** In production the mock routes answer 404 and `mock` is rejected everywhere.

### 8.2 Deposit and balance

- `POST /invoices/:id/payment-link` accepts `{amount?, purpose?: 'deposit' | 'balance' | 'custom'}`.
- The amount defaults to the balance due. "Deposit" computes from `payment_defaults.deposit`, the tour's deposit or the booking's deposit.
- The amount must be > 0 and ≤ balance due.
- `payment_link_amount` and `payment_link_purpose` are stored.
- A webhook records the paid amount, which may be partial, so the invoice becomes `partially_paid`.
- One live link per invoice stays the rule: a balance link replaces the paid or expired deposit link.

### 8.3 Stripe methods (iDEAL)

**What the code does today.** `createPaymentLink` for Stripe sends no `payment_method_types`, so Stripe uses dynamic payment methods from the agency's dashboard. iDEAL appears on EUR links when the agency has enabled it.

**The batch:**
- keeps that default, with a test that asserts no `payment_method_types` is sent;
- adds the optional explicit list (section 4.3), with a test that EUR plus `ideal` sends `payment_method_types[0]=card&payment_method_types[1]=ideal`, and that `ideal` on a GBP invoice is refused with a readable message;
- adds a hint on the Stripe card: "Customers see the methods enabled in your Stripe dashboard; for euro invoices enable iDEAL there."

**Go-live check:** an EUR link from a Stripe test account with iDEAL enabled shows iDEAL.

### 8.4 Booking and extras invoices (R142 extracts, R148 and R150 use)

R142 moves invoice creation out of `routes/invoices.ts` into `services/domain/invoices.ts`:
- `createInvoice(env, tenantId, db, input, actor)`, which applies numbering, the tax engine, events and activity;
- the route calls it, so the behaviour is unchanged.

R148 adds `createBookingInvoice(seatBookingId)`:
- lines per age band × price, room supplements per passenger and the seat surcharge;
- the regime from settings, including the margin scheme once R152 lands;
- the invoice is linked as `seat_bookings.invoice_id` and to the lead.

R150 adds `invoiceExtras(seatBookingId)`: one "Extras" invoice per seat booking, with lines per passenger per extra. It is updated while unpaid; once paid, new choices create a further invoice.

### 8.5 Bank transfer fallback

When no gateway is connected:
- public pages and the accept flow show the agency's bank details (section 4.4) and the reference;
- the existing rule reader (`payments.from_message`) matches the transfer when the customer reports it.

## 9. Automations, events and cron

### 9.1 Events added (`emitEvent`, `services/automation/events.ts`)

| Area | Events |
|---|---|
| Departures | `departure.created`, `departure.status_changed`, `departure.cancelled`, `departure.full`, `departure.seats_low` |
| Seat bookings | `seat_booking.held`, `seat_booking.confirmed`, `seat_booking.waitlisted`, `seat_booking.cancelled`, `seat_booking.expired`, `waitlist.offered` |
| Self-service | `passenger.updated`, `extras.selected`, `extras.paid` |
| Quotes | `quote.accepted` |
| Trips | `trip.stop_arrived`, `trip.passenger_boarded`, `trip.passenger_no_show`, `trip.documents_checked`, `trip.headcount_complete` |
| Chatbot | `chatbot.contact_captured` |

Each carries the ids the recipes need. Payloads never hold document numbers.

### 9.2 Recipes added (`services/automation/recipes.ts`; `featureKey` set so they lock without the plan feature)

| Key | Trigger | Default mode | What |
|---|---|---|---|
| `departures.confirm_seats` | `seat_booking.held` | suggest | Confirm the seats and draft the "seats confirmed" message from the agency's template. `auto` only when the action is low risk (confirming within capacity is). Honours `confirmMode`. |
| `departures.waitlist_offer` | `seat_booking.cancelled`, `seat_booking.expired`, `departure.status_changed` | suggest | Offer freed seats to the next waitlisted party (section 5.1). |
| `departures.hold_expiring` | `schedule.tick` | suggest | Holds expiring within 24 h: a reminder draft to the customer, or a task for staff. |
| `departures.seats_low` | `departure.seats_low` | suggest | Notify the departure owner. With `public_booking`, suggest a campaign to the segment of past travellers of the tour. |
| `departures.collect_details` | `seat_booking.confirmed` | suggest | Send the self-service link (details, extras, pay) through the hub. |
| `departures.scheduled_messages` | cron job (9.3) | per rule | Departure-relative messages. |

`travellers.collect_details` and `payments.balance_before_travel` gain departure awareness: they use the departure start date when the lead has a seat booking.

### 9.3 Departure-relative messages (R154)

- **Rules.** Rules (`departure_message_rules`) are edited under Settings > Group tours > Scheduled messages, with an override per tour on the tour page.
- **Defaults.** Three inactive defaults are seeded when `group_tours` is switched on:
  - extras reminder, 7 days before;
  - pickup time, 2 days before;
  - review request, 2 days after the end, purpose `marketing`.
- **The cron job.** `departures.messages` runs at period `tick`. For each active rule and each open, departed or completed departure, it computes the anchor date + offset at `local_time` in the tenant zone. When the time has passed and the send is less than 48 h late, it processes the audience and writes `departure_message_sends` rows. The unique key makes a re-run harmless.
- **Variables.** `services/template-engine.ts` `resolveVariables` gains a departure context `{seatBookingId, passengerId?}` and these variables:

  | Group | Variables |
  |---|---|
  | Departure | `{{tour_name}}`, `{{departure_date}}`, `{{departure_code}}`, `{{return_date}}` |
  | Pickup | `{{pickup_point}}`, `{{pickup_time}}`, `{{pickup_address}}` |
  | Booking | `{{seat_count}}`, `{{passenger_names}}`, `{{room_type}}`, `{{balance_due}}` |
  | Links | `{{extras_link}}`, `{{details_link}}` |
  | Crew | `{{tour_leader_name}}`, `{{tour_leader_phone}}` |

  Values come from the passenger, else from the booking's first passenger. Money and dates go through the tenant locale helpers.
- **Sending** goes through the Communication Hub domain sender. R154 extracts it from `routes/communications.ts` into `services/messaging/hub.ts` as `sendHubMessage`, and the route keeps calling it, so caps and logging are shared:
  - **caps:** `tryMeter` and `AllowanceExhausted` give a `skipped_cap` row and one staff notification per run;
  - **consent:** `marketingBlockedReason` for purpose `marketing`;
  - **service messages** are skipped only for `email_undeliverable` or no address;
  - **WhatsApp** outside the 24-hour window needs an approved template; without one the rule's fallback channel is used.
- **Suggest mode** creates one assistant suggestion per departure, "Review and send N pickup messages", which opens a list with per-person previews.

### 9.4 Calendar

- Each departure keeps one `events` row:
  - type `trip_departure`, with `related_departure_id`;
  - title `t('departures.calendarTitle')` built from tour and code;
  - start and end from the departure, timezone from the tenant.
- The planner `GET /events` adds `departure: {code, seats: {capacity, confirmed, held, left}}` to those rows.
- The calendar shows a seats-left chip and opens the departure drawer.
- `planner.ts` line 144 stops defaulting to `Asia/Kolkata` (R138).

## 10. Reports and exports (R146)

**New reports** in `services/reports/` (category `tours`, roles admin, sales_manager, operations, accountant):
- `departure_seats`: per departure — capacity, held, confirmed, waitlisted, left, load %, revenue invoiced, collected. Filters: tour, date range, status.
- `tour_sales`: per tour — departures run, seats sold, average load, revenue.
- `extras_sales`: per extra — count, revenue (R150 adds the data; R146 adds the report reading it, empty until then).

**Exports** (CSV and PDF, with branding and the agency locale):
- **pickup list:** stops in order with time, then the passengers boarding there — name, seats, phone, documents flag;
- **rooming list:** room groups with names, gender, room type, sharing notes and meal;
- **full manifest:** every passenger field the agency collects. Document numbers appear only for roles with `travellers.export`.

The pipeline report (existing) is unchanged; the leads board (R153) is the visual view.

## 11. Driver app (R147; `packages/driver_app`, `packages/shared`)

- **Trip list:** coach trips show "N stops, M passengers" and the next stop.
- **Trip detail:**
  - an ordered stop timeline, with time, name, a documents-check badge and a status;
  - navigate and call buttons (existing helpers);
  - per-stop "Arrived" and "Depart" actions.
- **Stop screen** (shown to tour leaders, and to drivers when `driverSeesPassengers`):
  - the passengers boarding here, each with a Boarded / No-show tick and a "Documents checked" tick (shown when the stop has `documents_check`, available on any stop from the menu);
  - a head count bar (boarded / expected at this stop, and overall);
  - "Complete stop".
- **Offline:** ticks are applied locally and queued in Hive with an `opId`, then sent on reconnect. The server ignores repeats. The existing trip cache pattern is followed.
- **Roles:** the `crew_role` comes from `/driver/profile`. A tour leader may have no vehicle; their trips are those with `tour_leader_id`.
- **Office view:** the desktop trip drawer shows the same stop timeline and boarding ticks, live through the existing realtime broadcast. An operations user can tick there too.
- **Languages and phones:** intl ARB strings for every new label, in `en`, `hi`, `ar` and `nl` (`nl` from R136). Phone display uses the shared helpers.
- **Tests:** widget tests for the stop list, the passenger ticks, the head count and the offline queue replay. Flutter runs only through x86 PowerShell.

## 12. Margin-scheme invoices (R152)

**Engine.** `services/tax-calculator.ts`:
- `TaxRegime` gains `margin`;
- `computeInvoiceTax` for `margin` returns no visible tax lines and `total_tax = 0`, with the total equal to the price;
- `tax_notes` = the agency wording;
- `tax_breakdown` holds one hidden entry `{code:'MARGIN_VAT', base, amount, rate, hidden:true}` only when both the cost and the rate are known. Otherwise it holds `{code:'MARGIN_VAT', status:'inputs_missing', hidden:true}`.
- Credit notes freeze the regime of their invoice (existing `FrozenTaxRules`).

**Cost per invoice:**
- for a booking invoice: departure costs per seat × seats, plus `per_departure` costs divided by the departure's confirmed seats at invoice time;
- else the linked itinerary's `total_cost`;
- else manual (`margin_cost` entered on the invoice).

It is snapshotted with `margin_cost_source` and editable until the invoice is sent.

**Wording presets.** These are offered in the UI, never applied silently, and every one carries "check with your accountant":

| Preset | Text |
|---|---|
| EU generic | "Margin scheme — Travel agents" (the mention in Article 226(13) of the EU VAT Directive) |
| Netherlands | "Bijzondere regeling reisbureaus" |
| UK | "Tour Operators' Margin Scheme: VAT is included in the price and not shown separately" |

No rates are seeded or assumed.

**Invoice and PDF.**
- No VAT line, no VAT number of the buyer, and the wording printed under the totals.
- The tax system select on Invoice defaults gains "Margin scheme (travel agents)".
- A new invoice for a seat booking starts in margin mode when `defaultFor` says so; any invoice can be switched while it is a draft.

**Report** `margin_scheme_report` (financial category):
- one row per margin invoice in the period: total, cost, margin, VAT on margin;
- the VAT column is blank when the rate is not set, and the row is marked "Costs not recorded" when the cost is missing;
- totals cover only complete rows, with a count of incomplete rows;
- a banner says "For your accountant: figures are computed from the costs recorded in TravelCRM".

The existing `tax_report` excludes margin invoices from "taxes invoiced" and adds a line pointing to this report.

## 13. Smaller features

### 13.1 Chat widget asks for contact details (R151)

- **Config.** `chatbot_config.contact_capture`, section 4.8, edited on Settings > Chatbot.
- **Widget.** The script in `routes/public-chatbot.ts` renders a small form — name, email and phone with the country from the agency, plus the consent text — at the configured moment. It posts to `POST /public/chatbot/:widgetKey/contact`.
- **Validation.** The phone is normalised with `normalizePhone` and the tenant default country; the email by format. Limits are 10 per 10 minutes per IP.
- **Storage.** The conversation stores the visitor fields, and a consent row is written with source `chatbot`.
- **Lead creation.** The lead-from-conversation logic (`routes/chatbot.ts` ~400–470) moves to `services/domain/chatbot-leads.ts`, used by staff and by `autoCreateLead`.
- **The widget's own text** (labels, buttons) comes from the config so the agency can word it, with `t()` defaults per agency language.

### 13.2 Leads pipeline board (R153)

- **Backend.** `GET /leads/board` takes the same filters as the list. It returns `{columns: [{status, count, value, leads: first 20}]}`. A column loads more through `GET /leads?status=&cursor=`.
- **Desktop.** The Leads page gets a List / Board toggle, remembered in `localStorage`. The board:
  - uses the FilterBar;
  - has one column per configured status;
  - shows cards with title, contact, destination, travel date, value (locale money), owner, and a seats chip when a seat booking exists;
  - offers hover actions, skeleton columns and an empty column state;
  - supports HTML5 drag and drop, plus a "Move to…" menu on each card for keyboard and screen readers.
- **Moves** are optimistic with rollback and a toast. Dropping on Lost opens the lost-reason dialog; dropping on Won asks for confirmation and lets the automations run.
- `kanban-board.tsx` is extended, not copied.
- `docs/features.json` `leads.kanban` moves to `works` with the new e2e as evidence.

### 13.3 Accept or book on the shared quote page (R155)

`POST /public/quotation/:token/accept` takes `{name, termsAccepted}`. Within one request it:
1. checks the link, the validity date and the feature and settings;
2. marks the itinerary `approved` with `accepted_*`;
3. moves the lead to `won` (domain status change, source `quote_accept`);
4. holds or confirms seats through the seats service when `itineraries.departure_id` is set, using `seats_requested` or the lead pax;
5. creates the invoice per `createInvoice`;
6. creates a deposit link when a gateway is connected;
7. emits `quote.accepted`;
8. returns `{status, seats?, payment: {url} | bank: {...}}`.

The `/q/[token]` page shows the button, a confirm sheet with name and terms, and the result with "Pay deposit" or the bank details. Staff get a notification and a timeline entry. A full departure answers "join the waitlist" (`waitlisted`).

### 13.4 Customer email in the local outbox (R142; item 12)

**Checked on 2026-10-21: customer email does not reach the outbox today.**
- `sendMail` (`services/mail/provider.ts`) sends every `agency_transactional` and `agency_marketing` email through `sendgridProvider` whatever the mode.
- Only platform system mail (`services/mail/transactional.ts`) is written to the KV outbox in TEST_MODE.
- So in test mode a customer email either fails (no key) or would really be sent (a key in `.dev.vars`).

**The batch:**
- `sendMail` with an agency kind and `isTestMode(env)` writes to the same KV outbox (`OUTBOX_PREFIX`) an entry `{kind, tenantId, to, subject, html, text, attachmentNames, createdAt}`;
- it returns `{success: true, provider: 'outbox'}` and calls no provider;
- `GET /test/outbox` gains `?tenantId=&kind=agency|system` filters;
- outside test mode nothing changes, and a test proves it: with TEST_MODE off and a key set, SendGrid fetch is called.

## 14. Age-band pricing on templates and quotes (R149)

- **Shared resolver** `services/pricing/age-bands.ts`, mirrored in `desktop/src/lib/age-bands.ts`. Same tests on both sides:
  - `bandsFor(template | tour | agency)`;
  - `bandForAge(bands, age)`;
  - `ageOn(dob, date)`;
  - `fillQuantities(items, bands, ages, adults)`.
- **Template editor.** It gains an "Age bands" card: inherit the agency list, or a custom list. Item rows pick a band for `pax_type`.
- **Create-from-template.** `POST /itinerary-templates/create-from` copies `age_bands` onto the itinerary. It accepts `{adults?, ages?: number[]}` and fills the quantities:
  - lines with a band → the count in that band;
  - lines marked `per_person` → total pax;
  - other lines unchanged.
- **Refill an existing quote.** `POST /itineraries/:id/fill-quantities` takes `{source: 'ages' | 'travellers' | 'lead', ages?, travellerIds?}` and returns a preview `{lines: [{id, from, to}]}`. `?apply=1` applies it and recomputes the totals.
- **Sources of ages:**
  - explicit ages;
  - linked travellers' dates of birth on the travel date;
  - the lead's pax counts plus the message reader's `childAges` (`assistant_message_analysis.entities.childAges`, added by R140).
- **The assistant.** Its `create_itinerary_from_template` action passes `{adults, ages}` from the analysis, so a one-click quote has the right quantities.
- **Departure bookings** price the same way from `tour_prices` kind `age_band` (R148).

## 15. Amounts, banks and messages without India defaults (R138, R140; B1–B7)

**Rule.** Every currency default reads the agency locale (`loadLocaleContext(db).currency`, `utils/money.ts`). Every date format reads the agency locale and zone. No `'INR'`, `'en-IN'` or `'Asia/Kolkata'` literal remains outside fallbacks in `utils/money.ts`, `utils/tz.ts`, the tax engine's GST branch and tests. R138 adds a backend test that greps `src/` for those literals against an allow-list file, so new ones fail CI.

| Id | Where | Fix | Batch |
|---|---|---|---|
| B1 | `routes/itinerary-templates.ts:270` | `currency` = template currency, else agency currency | R138 |
| B2 | `services/domain/leads.ts:84`, `routes/leads.ts:42` (zod default), `routes/leads.ts:127` | Agency currency when absent | R138 |
| B3 | `routes/itineraries.ts:74, 309` and PDF lines 985–1035 | Agency currency; the PDF formats money with `formatMoney` in the agency locale | R138 |
| B4 | `desktop/src/app/(app)/ai/itinerary/page.tsx:164` | Label `t('ai.itinerary.budgetIn', {currency})` with the agency currency | R138 |
| B5 | `services/automation/message-analysis.ts` (money regex lines 86–88 and 192–197, AI prompt line 329) | Read €, EUR, euro, £, GBP, pound, $, USD, AED, dirham, ₹, Rs, INR and lakh/crore (lakh/crore only when the currency is INR or unstated); record `entities.currency` when found; a different currency from the agency's is kept and flagged, never silently converted; add `entities.childAges: number[]`; the prompt states the agency's currency and date order instead of India | R140 |
| B6 | `desktop/src/app/(app)/settings/invoice-defaults/page.tsx`, `backend/src/routes/settings.ts` invoice defaults | Bank details by country (section 4.4); invoice PDF prints the country's fields | R140 |
| B7 | `routes/credit-notes.ts:130, 427` | The credit note takes its invoice's currency, else the agency currency | R138 |

**Sweep found on 2026-10-21 (fixed in R138 unless marked):**

Backend:
- `routes/ai-assistant.ts:416, 576`;
- `routes/ai-extractions.ts:309, 379` (`'INR'` and `'gst'` in SQL);
- `services/ai-extraction.ts:75, 146` (prompt and default);
- `routes/fleet.ts:1258–1259` (`en-IN` dates) and `2200`;
- `routes/vouchers.ts:638–640` (`en-IN` dates in the PDF);
- `routes/payment-webhooks.ts:114`;
- `routes/planner.ts:144` (`Asia/Kolkata`);
- `routes/rate-cards.ts:29, 204` and `validators/rate-card.ts:11`;
- `validators/fleet.ts:95`;
- `routes/suppliers.ts:275`;
- `routes/settings.ts:337` (itinerary defaults currency);
- `routes/settings.ts` invoice-defaults fallbacks (`gst` / 18%): the regime and rate follow the agency country, as R201's engine does;
- `services/imports/import-validator.ts:57`, `row-inserter.ts:169, 183`, `template-generator.ts:46`;
- `services/trip-invoice-generator.ts:181`;
- `services/automation/custom-rules.ts:368` (`toLocaleString('en-IN')`).

Desktop:
- `settings/billing/page.tsx:192` fallback;
- payment method lists show UPI only for Indian agencies, and the IFSC field on the driver form only for India (R140);
- the shared method list gains `ideal` and `sepa_transfer` labels for EU agencies (R140).

Flutter:
- `packages/driver_app/lib/core/utils/money.dart:19` and `phone.dart:13` (`+91` default);
- `packages/shared` model defaults `'INR'` and `app_constants.defaultCurrency`.

The Flutter fixes are R136: they take the agency currency and country from the agency lookup, which the app already receives.

## 16. Calling in the Netherlands, ready to switch on (R137, R141)

This is general EU readiness; the Netherlands is the first country configured. Nothing is hard-coded for NL beyond seed rows and tests.

**Gating (R137):**
- `services/voip/country-gate.ts` `DEFAULT_CALLING_COUNTRIES` gains `NL`.
- `backend/scripts/gen-wrangler.mjs` default `VOIP_CALLING_COUNTRIES` becomes `US,NL`. This is open question Q1 in section 21: the alternative is to keep `US` and add NL at go-live.
- Fraud allow-list (`services/voip/fraud.ts`): an NL agency's own country is allowed automatically. `+31` maps to NL in `destinations.ts` already. Tests cover a call from an NL agency to `+31 6...`, `+31 20...` and a blocked premium prefix.

**Master 0029_calling_eu_nl.sql:**
- `call_country_policy`:
  - INSERT `NL` (`resell`, `twilio`, `kyc_required = 1`, notes "EU first market: regulatory bundle (business identity and address) needed for local numbers; requirements to be confirmed against Twilio's Regulations API at go-live");
  - ADD `recording_default` (`announce`, `off`, `on_request`; NL and DE `announce`, every other row its current behaviour);
  - ADD `kyc_requirements` TEXT (JSON list of the fields and documents the agency form asks for; the NL draft: business name, registration number, registered address in the country, representative name, registration extract file).
- `number_documents` ADD `provider_bundle_sid`, `provider_address_sid`, `provider_status`, `provider_status_at`, `provider_failure_reason`, `number_type`.
- Pricing:
  - activate the EU `call_minute` and `phone_number` unit-cost rows and the `call_minutes_500_eu` and `phone_number_eu` add-ons, which PRICING.md marks "inactive until the second wave" (`is_active = 1`);
  - insert **draft, inactive** NL rows: `phone_number` market `NL` and `call_minute` destination weight `NL`, with the provider text "DRAFT: enter Twilio's NL price before selling" and `is_active = 0`.

**Price lookup:**
- `services/voip/numbers.ts` looks for a phone-number product for the country first (market = ISO code), then for the market. An NL number therefore stays `PRICE_NOT_CONFIGURED` until the owner activates the NL row in the console. The EU (Germany-based) price is never used for an NL number by accident.
- Metering prices a minute by the destination weight row when one is active, else the market row (existing behaviour).

**Regulatory bundle:**
- The `VoipProvider` contract gains optional `submitRegulatoryBundle(input)` and `getRegulatoryBundleStatus(sid)`.
- The Twilio adapter uses Regulatory Compliance v2:
  - EndUser, SupportingDocument (uploaded file from R2), Address, Bundle and ItemAssignments;
  - submit (`Status=pending-review`);
  - `StatusCallback` pointed at a signed route `POST /voip/regulatory-callback/:tenantKey`, plus an hourly poll job as backup.
- The mock provider approves after `MOCK_BUNDLE_DELAY_SECONDS` (default 0).
- Purchase passes `BundleSid` and `AddressSid`.
- The flow is the state machine in section 5.6, and every status is shown to the agency (R141).
- Recorded HTTP fixtures only. The Twilio documentation is to be checked at go-live (GO-LIVE step).

**Recording consent:**
- When an agency has never set its consent mode, its default is the country policy's `recording_default`. For NL the default is `announce`, so callers are told.
- The announcement is spoken in the agency language.
- `services/voip/prompts.ts` holds every spoken prompt (now inline in `routes/voip-callbacks.ts` lines 698–980) in `en` and `nl`, with voices `Polly.Joanna` / `en-US` and `Polly.Lotte` / `nl-NL`.
- The agency can still write its own text.
- A privacy line in Settings > Calling says recordings need a lawful basis and a notice under the GDPR. That is advice, not legal text.

**Phones:**
- NL numbers in `backend/src/utils/phone.ts` tests (`0612345678`, `+31 6 1234 5678`, `085 208 0400`);
- the desktop `PhoneInput` tests (R141);
- the driver app login with an NL agency (R136).

**Docs** (R137):
- an ADR-001 addendum B "EU readiness, Netherlands first";
- PRICING.md, EU section: active, plus the NL draft rows;
- GO-LIVE.md phase 9: Twilio regulatory bundle check, entering NL prices, setting `VOIP_CALLING_COUNTRIES`, checking the Dutch announcement.

**Screens (R141):**
- **Settings > Phone numbers:** the agency's country requirements form, from `kyc_requirements`, with uploads, status chips for each state in 5.6 and a clear "Under review by the phone provider, usually 1–3 business days" pending state. The duration text is configurable in the policy notes, not claimed in code.
- **Settings > Calling:** the recording default explained, and the announcement preview per language.
- **Super admin, tenant calling panel:** review documents, submit to the provider, see the provider status, retry.
- **Super admin catalogue:** NL draft rows flagged "draft".

## 17. Dutch interface (R136 foundation, R156–R162 sweeps)

**Foundation (R136):**
- **Catalogue split.** `desktop/src/messages/<lang>.json` is split into `desktop/src/messages/<lang>/<area>.json`, one file per top-level namespace (`nav`, `common`, `leads`, `departures`, ...), merged by `desktop/src/messages/index.ts`.
  - Keys are unchanged.
  - R136 pre-creates and registers every namespace file the wave needs (`departures`, `booking`, `trip`, `extras`, `coachTrips`, `pipeline`, `margin`, `calling`, ...). Parallel batches then add keys in different files and never touch `index.ts` or one shared JSON file.
- **Languages.**
  - `LANGUAGES` gains `{ code: 'nl', label: 'Nederlands', dir: 'ltr', enabled: true }`, and `Locale` gains `nl`.
  - Formatting stays on `lib/locale.ts`: agency locales `nl-NL` and `en-NL` are offered in Regional settings if not already.
- **The check** (`desktop/scripts/i18n-check.mjs`):
  - reads the split files;
  - fails when an `nl` key is missing or its `{placeholders}` differ from English (`COMPLETE_LANGUAGES = ['en', 'nl']`); `hi` and `ar` stay partial with fallback;
  - takes its SCOPE from `desktop/scripts/i18n-scope/*.json` (one file per area), so each sweep adds its own file.
- **Translations.** Every existing key gets a machine translation into `nl`. They are listed for native review in `docs/i18n/NL-REVIEW.md`: which files, made by machine on which date, review status per area.
- **Backend documents** get a small catalogue, `backend/src/i18n/` (en, nl; hi and ar fall back to en), used by:
  - the voucher PDF labels (vouchers already carry `language`);
  - the system emails in `services/mail/templates.ts` — invitation, password reset, login code, two-factor, welcome — chosen by the recipient user's `language`, else the agency `default_language`;
  - the public pages' server texts (quote, booking, trip, unsubscribe page).
- **Message templates.** When `seed-tenant.ts` seeds system message templates, it seeds the agency language's version.
- **Driver app.** `lib/l10n/intl_nl.arb`, `nl` in `supportedLocales`, `flutter gen-l10n`. Tests render the trips screen in `nl`, and log in with an NL agency (`0612345678` → `+31612345678`).

**Sweeps (R156–R162).** These convert the remaining hard-coded page text to `t()`, area by area, with `en` and `nl` complete:

| Batch | Area | Strings |
|---|---|---|
| R156 | Leads, contacts, dashboard, calendar, tasks, follow-ups | ≈920 |
| R157 | Fleet, travellers, visa, documents, rate cards, suppliers | ≈1,270 |
| R158 | Itineraries, invoices, payments, credit and debit notes, vouchers | ≈1,090 |
| R159 | Marketing, campaigns, communication | ≈1,100 |
| R160 | Settings | ≈1,180 |
| R161 | AI, assistant, chatbot, reports | ≈1,100 |
| R162 | Shared domain components, import, onboarding, help, notifications, accounts, bookmarks, public pages and the rest | ≈900 |

The counts are from `scanFile` over `src/app` and `src/components` on 2026-10-21: about 7,560 findings in 244 files. After R162 the check's scope is all of `src/app` and `src/components`, so no English string can come back.

Each sweep:
- changes no behaviour;
- keeps existing e2e selectors working, because tests run in English;
- adds an `nl` smoke e2e for its area: switch to Nederlands, open each page, assert no missing-key warnings and no layout-probe overflow (Dutch runs longer).

**Every batch of the wave** that adds desktop text:
- adds `en` and `nl` keys in its own namespace files only, never in `messages/index.ts`;
- lists its files in its own `docs/i18n/nl-review/<batch>.md`, so two parallel batches never edit the same review file;
- adds its own `desktop/scripts/i18n-scope/<area>.json` for new folders.

## 18. Privacy registry additions (`backend/src/services/privacy/registry.ts`)

| Table | Registered as | Batch |
|---|---|---|
| `seat_bookings` | `contact_id = ? OR lead_id IN LEADS` | R139 |
| `seat_passengers` | `seat_booking_id IN (seat bookings of the contact) OR traveller_id IN TRAVELLERS` | R139 |
| `passenger_extras` | `seat_passenger_id IN (...)` | R139 |
| `departure_message_sends` | `contact_id = ?` | R139 |
| `trip_passengers` | `contact_id = ? OR trip_id IN TRIPS OR seat_passenger_id IN (...)` | R145 |
| `trip_stops` | PRIVACY_NOT_PERSONAL: "stop names and times, no people" | R145 |
| `tours`, `tour_stops`, `tour_prices`, `tour_extras`, `departures`, `departure_vehicles`, `departure_stops`, `departure_costs`, `departure_message_rules` | PRIVACY_NOT_PERSONAL with reasons (product data; staff ids only) | R139 |
| `public_links` (master) | PRIVACY_NOT_PERSONAL: "master table; erasure sets is_active = 0 for the contact's seat bookings" (erase-contact.ts step added) | R148 |

**Erasure of a contact:**
- anonymises passengers (names → "Erased", DOB, document fields and `extra_fields` cleared);
- keeps seat counts, so departure history and invoices stay consistent;
- deactivates the contact's public links.

`gdpr.test.ts` must stay green. It fails on any unregistered table with personal columns.

## 19. Coverage map

| Gap (prospect gap list, ranked) or bug | Covered by |
|---|---|
| Euro defaults B1–B4, B7 and the sweep | R138 |
| B5 message reader currencies, B6 bank details | R140 |
| 1. Departures with seats: departure record, seats held and sold, seats left on calendar, lead and quote, waitlist, seats sold report, manifest with pickup and rooming lists | R139 (model, API), R143 (seats engine, waitlist, confirmation), R144 (screens), R146 (seats everywhere, manifest, reports) |
| 2. Customer booking and add-on page: booking page per departure, self-service extras, traveller details and pay | R148 (booking page), R150 (extras, details, pay) |
| 3. Pay online shown working, iDEAL, deposit and balance | R142 |
| 4. Coach trips with ordered stops, passengers per stop, boarded / no-show, head count, documents checked, tour leader | R145 (backend, desktop), R147 (driver app) |
| 5. Messages scheduled from the departure date with per-person fields | R154 |
| 6. Margin-scheme invoices, configurable wording, tax report | R152 |
| 7. Age-band pricing on templates, quantities from ages | R149 (with child ages from R140) |
| 8. Chat widget asks for name and phone | R151 |
| 9. Pipeline board on the leads page | R153 |
| 10. Book these seats on the quote link | R155 |
| 11. Calling in the Netherlands | R137 (backend, pricing, bundles, docs), R141 (screens, console) |
| 12. Dutch interface | R136 (foundation, emails, vouchers, driver app), R156–R162 (page sweeps) |
| Customer email in the local outbox (item 12 of the brief) | R142 |

## 20. Batches, order and parallel pairs

| Step | Batch A | Batch B (parallel) | Why they do not collide |
|---|---|---|---|
| 1 | R136 Dutch interface foundation (L) | R137 Calling EU readiness, backend (L) | Desktop i18n, mail templates and the driver app, against `services/voip`, the master migration and docs. |
| 2 | R138 Non-INR defaults sweep (M) | R139 Departures model, features, API (L) | The sweep edits existing routes; R139 adds new routes, the tenant schema and the registry. |
| 3 | R140 Banks, methods, message reader (M) | R141 Calling screens and console (M) | Invoice defaults, payments and message analysis, against voip settings pages and super-admin. |
| 4 | R142 Outbox, test gateway, deposit links (M) | R143 Seat bookings engine (L) | Mail, payments and invoices, against the departures service and recipes. Only R142 adds a tenant migration. |
| 5 | R144 Departures screens (L) | R145 Coach trips backend and desktop (L) | Departures pages, against fleet routes and pages. Only R145 migrates. |
| 6 | R146 Seats everywhere, manifest, reports (M) | R147 Driver app stops and check-in (M) | Desktop and backend, against Flutter. |
| 7 | R148 Public booking page (L) | R149 Age-band pricing (M) | Public routes and the master migration, against itinerary routes and pages and the tenant migration. |
| 8 | R150 Extras and self-service page (L) | R151 Chat widget capture (S) | Booking public routes, against chatbot. Only R151 migrates. |
| 9 | R152 Margin scheme (M) | R153 Leads board (M) | Tax and invoices, against leads. Only R152 migrates. |
| 10 | R154 Departure messages (M) | R155 Quote accept (M) | Recipes and the hub, against the public quote route. Only R155 migrates. |
| 11 | R156 Sweep: leads, contacts, overview | R157 Sweep: operations | Disjoint folders and catalogue files. |
| 12 | R158 Sweep: itineraries and money | R159 Sweep: marketing and communication | Disjoint. |
| 13 | R160 Sweep: settings | R161 Sweep: AI and reports | Disjoint. |
| 14 | R162 Sweep: shared components and the rest; full scope | none | Touches shared components every page uses. |

Batch ids follow the run order. INDEX.json lists them in that order and carries a `step` field; batches with the same step may run together.

**Film-critical path** (what the next client film needs): steps 1–10. The sweeps (11–14) can run after the film is recorded if time is short, because the film is in English. The Dutch foundation (step 1) is needed first only because it sets the catalogue layout every later batch writes into.

**Rules every pair follows:**
- At most one batch of a pair adds a tenant migration. That batch alone regenerates `tenant-migrations.generated.ts`.
- No pair edits the same file.
- When a pair cannot finish together, the second waits; numbers do not change.

## 21. Risks and open questions

**Risks:**
1. **Scope and time.** 27 batches; steps 1–10 are 20 batches, about 2 weeks of serial agent time at two in parallel, before review and film re-planning. The film should be re-storyboarded only after step 10 merges.
2. **Overselling under load.** Prevented by the single-statement capacity check (5.1), with a concurrency test of 20 parallel holds on 10 seats.
3. **Public page abuse.** Rate limits, honeypot and optional Turnstile. Holds expire, so seats cannot be blocked for long; per-token caps limit one attacker. Booking spam is still possible without Turnstile keys; listed for go-live.
4. **Twilio NL requirements unverified.** The requirement list and bundle flow are built against recorded fixtures. Real requirements must be read from Twilio's Regulations API at go-live (GO-LIVE step), and the `kyc_requirements` JSON edited if they differ.
5. **Margin-scheme wording and the VAT computation.** These are presets and arithmetic, not tax advice. An accountant should confirm before an agency relies on the report. The UI says so.
6. **Machine translations.** Dutch strings are machine-made and need native review before a Dutch agency sees them (`docs/i18n/NL-REVIEW.md`).
7. **The sweeps touch every page.** Risk of regressions in e2e text selectors. Mitigation: English stays the default in tests, and each sweep runs its area's specs.
8. **`/communications/send` extraction (R154) and invoice creation extraction (R142).** These are refactors of busy routes. Behaviour must stay identical; the existing route tests are the guard.
9. **Offline ticks** in the driver app can arrive after the office changed a status. The rule is last write wins by `at` timestamp, with `opId` dedupe, and a test covers it.

**Open questions for the owner** (the specs assume the stated default):
- **Q1.** Production default for `VOIP_CALLING_COUNTRIES`: `US,NL` (assumed), or keep `US` and add NL at go-live?
- **Q2.** Plan placement: `group_departures` and `public_booking` on Pro and Enterprise only (assumed), or on Basic too? The founder Basic price is the likely entry point for a small tour operator.
- **Q3.** Existing quote share tokens are UUIDv7 (timestamp prefix). Rotate them to random tokens in a later batch, at the cost of invalidating links already sent?
- **Q4.** Should accepting a quote confirm seats at once, or hold them until the deposit? Assumed: follow `confirmMode`, so `on_deposit` holds until paid.

**Orchestrator decisions on Q1–Q4 (2026-10-21, owner said to complete everything; each can be changed later):**
- Q1: production default `US,NL`, because the owner wants the Netherlands ready for a possible first customer. The country stays off for an agency until its calling account and NL number bundle are approved.
- Q2: Pro and Enterprise (and trial), as assumed. The owner can move them to Basic per plan or per agency in the console Feature switches without a deploy.
- Q3: new share links (quotes, booking and self-service pages) use random 128-bit tokens from the start. Existing quote tokens keep working until they expire; no forced rotation.
- Q4: follow the agency's `confirmMode`, as assumed.
