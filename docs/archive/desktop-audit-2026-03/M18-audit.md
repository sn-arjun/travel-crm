# Milestone 18 Audit Report
Generated: 2026-03-09
Ticket File: product-requirment/jira-tickets-m18.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 8     |
| PARTIAL | 11    |
| MISSING | 1     |
| BUG     | 6     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `desktop/.env.local`, `AddressAutocomplete` component | Optional | Trip form uses plain `<Input>` for pickup/drop — no crash, but loses autocomplete |
| `FLEET_BUCKET` (R2 binding) | `backend/src/routes/fleet.ts` (photo/doc upload) | Required (backend) | Backend returns 500 on document/photo upload if missing |
| `PUSH_NOTIFICATION_QUEUE` | `backend/src/cron/fleet-alerts.ts` | Required (backend) | Fleet alert cron silently fails if queue binding not configured |
| `MESSAGING_QUEUE` | `backend/src/services/fleet-notification.ts` | Required (backend) | WhatsApp customer notification won't send on trip assignment |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `fleet/vehicles/page.tsx:78` | No infinite scroll — `limit: 100` hardcoded | Replace with `useInfiniteScroll` hook |
| `fleet/vehicles/page.tsx:107-123` | No FilterBar — uses raw `Select` + `Input` | Replace with `FilterBar` component |
| `fleet/vehicles/page.tsx:90-94` | Client-side search — filters after full load | Use API `search` param for server-side search |
| `fleet/drivers/page.tsx:74` | No infinite scroll — `limit: 100` hardcoded | Replace with `useInfiniteScroll` hook |
| `fleet/drivers/page.tsx:100-107` | No FilterBar — uses raw `Select` + `Input` | Replace with `FilterBar` component |
| `fleet/drivers/page.tsx:87-91` | Client-side search — filters after full load | Use API `search` param for server-side search |
| `fleet/trips/page.tsx:69` | No infinite scroll — `limit: 100` hardcoded | Replace with `useInfiniteScroll` hook |
| `fleet/trips/page.tsx:97-103` | No FilterBar — uses raw `Select` + `Input` | Replace with `FilterBar` component |
| `fleet/trips/page.tsx:47` | Raw vehicleId shown in Kanban cards instead of registration number | Show `trip.vehicleRegistration` or resolve from vehicles |
| `fleet/trips/page.tsx:124` | Raw vehicleId shown in table view | Show vehicle registration number |
| `fleet/trips/new/page.tsx:137-146` | Vehicle selector uses raw `Select` not searchable `Combobox` | Replace with searchable `Combobox` calling list API with search param |
| `fleet/trips/new/page.tsx:151-159` | Driver selector uses raw `Select` not searchable `Combobox` | Replace with searchable `Combobox` calling list API with search param |
| `fleet/trips/new/page.tsx:31-41` | Missing passenger fields — no passengerName, passengerPhone, leadId, specialInstructions | Add all required trip assignment fields per TICKET-316/325 |
| `fleet/trips/new/page.tsx:110-114` | Location uses plain `Input` — no `AddressAutocomplete` | Use `AddressAutocomplete` with env fallback to plain Input |
| `fleet/trips/[id]/page.tsx:124-151` | HARDCODED mock data — vehicle: 'Toyota Innova KA-01-AB-1234', driver: 'Driver Name', passenger: 'Passenger' | Fetch actual vehicle/driver data from API via trip.vehicleId/driverId |
| `fleet/trips/[id]/page.tsx:148-150` | Mock statusHistory — only one entry from trip.startTime | Fetch real timeline from `GET /fleet/trips/:id/timeline` |
| `fleet/vehicles/[id]/page.tsx:83` | Edit button not linked — missing `href` to edit page | Add `asChild` + `<Link href={...}>` |
| `fleet/vehicles/[id]/page.tsx:84` | Deactivate button is placeholder — no handler | Implement status change via `PUT /fleet/vehicles/:id/status` |
| `fleet/vehicles/[id]/page.tsx:27-29` | Trips fetched by loading ALL trips and client-side filtering by vehicleId | Use `fleetApi.trips.list({ vehicleId })` for server-side filter |
| `fleet/drivers/[id]/page.tsx:97` | Deactivate button is placeholder — no handler | Implement status change via `PUT /fleet/drivers/:id/status` |
| `fleet/drivers/[id]/page.tsx:31-32` | Trips fetched by loading ALL trips and client-side filtering by driverId | Use `fleetApi.trips.list({ driverId })` for server-side filter |
| `fleet/drivers/[id]/page.tsx:106` | Documents tab is empty — no content | Implement document list/upload calling `GET /fleet/drivers/:id/documents` |
| `fleet/vehicles/[id]/page.tsx:88-93` | Missing Documents, Maintenance, Availability tabs per TICKET-320 | Add tabs for documents (with expiry indicators), maintenance history, availability calendar |
| `fleet/page.tsx:52-64` | Dashboard makes 3 separate API calls instead of using `GET /fleet/dashboard` endpoint | Use dedicated dashboard endpoint |
| `fleet/page.tsx:53,58,63` | All 3 queries hardcoded `limit: 100` | Use dashboard API or paginated queries |
| `fleet/alerts/page.tsx:74-83` | Only tracks driver license expiry — missing vehicle document alerts (insurance, permit, pollution, RC) | Call `GET /fleet/documents/expiring` and `GET /fleet/documents/drivers/expiring` APIs |
| `fleet/alerts/page.tsx:44` | ExternalLink button has no handler — placeholder | Link to vehicle/driver detail page |
| `fleet/alerts/page.tsx:106-111` | Only one tab "All" — missing "Expiring Documents" and "Maintenance Due" tabs per TICKET-330 | Add tabs for vehicle docs, driver docs, and maintenance due |
| `fleet/rate-cards/page.tsx:64` | Status hardcoded as "Active" — not from API data | Use `rc.isActive` from API response |
| `fleet/rate-cards/page.tsx:65` | Edit dropdown item has no handler — no onClick or Link | Add `<Link href={...}>` to edit page |
| `fleet/rate-cards/new/page.tsx:104-106,140-148,161-162,167-168,175-177,182-184,200-202,209-211,218-220` | Multiple `// @ts-ignore-next-line` and `// @ts-expect-error` comments rendered as visible text in JSX | Remove comments or move outside JSX; add missing fields to form state |
| `fleet/rate-cards/new/page.tsx:26-34` | Form state missing tripType, minimumKm, minimumHours, extraKmRate, extraHourRate, nightCharge, driverAllowance, tollIncluded, parkingIncluded, isActive | Add all fields to form state and CreateFleetRateCardRequest interface |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `fleet/vehicles/page.tsx` | No vehicle type filter | Add vehicle type filter chips (Sedan, SUV, MUV, etc.) | Medium |
| `fleet/vehicles/page.tsx` | Grid cards lack document expiry badges | Show insurance/permit/pollution expiry indicators per TICKET-320 | High |
| `fleet/vehicles/page.tsx` | No empty state when filtered results are zero | Add EmptyState component with call-to-action | Low |
| `fleet/drivers/page.tsx` | No rating display in grid/table | Add star rating display from `driver.rating` field | Medium |
| `fleet/drivers/page.tsx:58-61` | License badge always shows "License valid" regardless of actual expiry | Calculate from `driver.licenseExpiry` like `DocumentExpiryBadge` | High |
| `fleet/trips/page.tsx` | Kanban view is read-only | Add drag-and-drop status transitions | Low |
| `fleet/trips/page.tsx` | No date range filter | Add date range filter for trips (today, this week, this month) | Medium |
| `fleet/trips/new/page.tsx` | No availability-aware vehicle/driver selection | Filter vehicles/drivers by selected date range availability | High |
| `fleet/trips/new/page.tsx` | No lead selector | Add lead search dropdown that auto-fills passenger name/phone | High |
| `fleet/trips/new/page.tsx` | No special instructions field | Add textarea for special instructions | Medium |
| `fleet/page.tsx` | Dashboard uses client-side computed stats | Use dedicated `GET /fleet/dashboard` API for server-computed stats | Medium |
| `fleet/page.tsx:90` | Top drivers sorted by experience, not rating | Sort by `driver.rating` per TICKET-319 | Medium |
| `fleet/page.tsx` | No alerts/expiring documents section | Add alerts banner with count linking to fleet/alerts | High |
| `fleet/vehicles/[id]/page.tsx` | No photo display | Show vehicle photo from `photoUrl` field | Medium |
| `fleet/drivers/[id]/page.tsx` | No emergency contact info displayed | Show emergency contact name/phone from API | Medium |
| `fleet/rate-cards/page.tsx` | No vehicle type or trip type filter | Add filter dropdowns for vehicle type and trip type | Medium |
| `fleet/rate-cards/page.tsx` | No delete action | Add delete dropdown item with confirmation | Medium |
| `fleet/rate-cards/page.tsx` | Row click does nothing | Navigate to detail or open edit form | Low |
| `fleet/reports/fleet/page.tsx` | Export button shows toast only | Implement actual file download for export | Medium |
| All fleet list pages | No keyboard shortcuts | Add Ctrl+N for new, Ctrl+F for search focus | Low |
| All fleet list pages | No bulk operations | Add checkbox selection + bulk status change/delete | Low |

## Ticket Details

### TICKET-306: Drizzle Schema — Vehicles, Drivers & Trip Assignments Tables — DONE
**Backend:** DONE — All tables exist in `backend/src/db/tenant-schema.ts`:
- `vehicles` (lines 1385-1415) — all fields present including status enum, document expiry dates, odometer
- `vehicle_documents` (lines 1417-1434) — type enum (rc/insurance/permit/pollution), expiry tracking
- `drivers` (lines 1459-1486) — all fields including rating, totalTrips, emergency contacts
- `driver_documents` (lines 1488-1505) — type enum (license/id_proof/police_verification)
- `trip_assignments` (lines 1524-1589) — all fields including status transitions, timestamps, M19/M20 extensions
- `trip_costs` (lines 1591-1603) — cost types, receipt URL
- `trip_timeline` (lines 1605-1618) — status tracking with GPS coords
- `vehicle_maintenance` (lines 1436-1453) — service types, costs, next service tracking
- `driver_ratings` (lines 1507-1518) — 1-5 rating with trip link
- `reminder_log` (lines 1706-1716) — duplicate prevention for alerts
- All tables have proper indexes
**Frontend:** N/A (schema-only ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None

---

### TICKET-307: Vehicle CRUD API — DONE
**Backend:** DONE — `backend/src/routes/fleet.ts` contains all required endpoints:
- `POST /vehicles` — create with unique registration validation
- `GET /vehicles` — list with filters (status, type, search, availability date range, pagination, sorting)
- `GET /vehicles/:id` — detail with documents, upcoming trips, active trip
- `PUT /vehicles/:id` — update
- `DELETE /vehicles/:id` — soft delete with active trip check
- `PUT /vehicles/:id/status` — status change with validation
- `GET /vehicles/:id/trips` — paginated trip history
- Availability check via date range filtering
**Frontend:** N/A (backend-only ticket)
**API Client:** DONE — `desktop/src/lib/api/fleet.ts:219-241` has vehicles CRUD methods
**UX Issues:** None
**Fix Required:** None

---

### TICKET-308: Vehicle Photo Upload to R2 — DONE
**Backend:** DONE — `backend/src/routes/fleet.ts` has:
- `POST /vehicles/:id/photo` — upload with 5MB limit, JPEG/PNG/WebP validation
- `GET /vehicles/:id/photo` — signed URL retrieval
- R2 storage path: `{tenant_id}/fleet/vehicles/{vehicle_id}/photo.{ext}`
**Frontend:** PARTIAL — Vehicle detail page doesn't display photo, vehicle form doesn't have photo upload
**API Client:** PARTIAL — No photo upload method in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/vehicles/[id]/page.tsx` — No photo display anywhere
- `fleet/vehicles/new/page.tsx` — No photo upload UI
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `vehicles.uploadPhoto(id, file)` and `vehicles.getPhotoUrl(id)` methods
2. `desktop/src/app/(app)/fleet/vehicles/new/page.tsx` — Add photo upload area
3. `desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx` — Display vehicle photo in header

---

### TICKET-309: Vehicle Document Upload & Expiry Tracking — PARTIAL
**Backend:** DONE — `backend/src/routes/fleet.ts` has all document endpoints:
- `POST /vehicles/:id/documents` — upload with type validation, deactivation of previous
- `GET /vehicles/:id/documents` — list active documents
- `GET /vehicles/:vehicleId/documents/:docId/download` — signed download URL
- `DELETE /vehicles/:vehicleId/documents/:docId` — soft delete
- `GET /documents/expiring` — expiring docs across fleet with computed `is_expired`, `days_until_expiry`
**Frontend:** MISSING — No document management UI on vehicle detail page
**API Client:** MISSING — No document methods in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/vehicles/[id]/page.tsx:88-93` — Only Overview and Trip History tabs; missing Documents tab with expiry indicators
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `vehicles.listDocuments(id)`, `vehicles.uploadDocument(id, formData)`, `vehicles.downloadDocument(vehicleId, docId)`, `vehicles.deleteDocument(vehicleId, docId)`, `vehicles.getExpiringDocuments(days)` methods
2. `desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx` — Add Documents tab with upload form, list, expiry color indicators (green >30d, yellow 7-30d, red <7d or expired)

---

### TICKET-310: Vehicle Maintenance Schedule Tracking — PARTIAL
**Backend:** DONE — `backend/src/routes/fleet.ts` has:
- `POST /vehicles/:id/maintenance` — record service, auto-updates vehicle fields
- `GET /vehicles/:id/maintenance` — maintenance history
- `GET /maintenance/due` — vehicles with maintenance due within N days
- `PUT /vehicles/:id/odometer` — update odometer
**Frontend:** MISSING — No maintenance UI
**API Client:** MISSING — No maintenance methods in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/vehicles/[id]/page.tsx` — No Maintenance tab per TICKET-320
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `vehicles.recordMaintenance(id, data)`, `vehicles.getMaintenanceHistory(id)`, `vehicles.getMaintenanceDue(days)`, `vehicles.updateOdometer(id, km)` methods
2. `desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx` — Add Maintenance tab showing service history and add maintenance form

---

### TICKET-311: Document & Maintenance Expiry Alert Cron — DONE
**Backend:** DONE — `backend/src/cron/fleet-alerts.ts` (171 lines):
- Daily check for vehicle/driver documents expiring at 30/15/7/1 day windows
- Daily check for expired documents (daily reminder)
- Maintenance due alerts for vehicles within 7 days
- Duplicate prevention via `reminder_log` table
- Push notifications via `PUSH_NOTIFICATION_QUEUE`
- Registered in `backend/src/index.ts` cron handler
**Frontend:** N/A (backend cron)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None

---

### TICKET-312: Vehicle Availability Calendar API — DONE
**Backend:** DONE — `backend/src/routes/fleet.ts` has:
- `GET /vehicles/availability?from=&to=&type=` — fleet-wide availability grid
- `GET /vehicles/:id/availability?from=&to=` — single vehicle availability with trip details
- Date range overlap check, excludes completed/cancelled trips
**Frontend:** MISSING — No availability calendar widget in desktop
**API Client:** MISSING — No availability methods in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/vehicles/[id]/page.tsx` — No Availability tab per TICKET-320/326
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `vehicles.getAvailability(params)` and `vehicles.getSingleAvailability(id, params)` methods
2. `desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx` — Add Availability tab with calendar visualization

---

### TICKET-313: Driver CRUD API — DONE
**Backend:** DONE — `backend/src/routes/fleet.ts` has all driver endpoints:
- `POST /drivers` — create with unique phone validation
- `GET /drivers` — list with filters (status, search, availability dates)
- `GET /drivers/:id` — detail with documents, trips, ratings
- `PUT /drivers/:id` — update
- `DELETE /drivers/:id` — soft delete with active trip check
- `PUT /drivers/:id/status` — status change
- `POST /drivers/:id/rate` — rating 1-5 with rolling average update
- `GET /drivers/:id/trips` — paginated trip history
- `driver_ratings` table with trip link
**Frontend:** N/A (backend-only ticket)
**API Client:** DONE — `desktop/src/lib/api/fleet.ts:243-265` has drivers CRUD methods
**UX Issues:** None
**Fix Required:** None

---

### TICKET-314: Driver Document Upload & Expiry Tracking — PARTIAL
**Backend:** DONE — `backend/src/routes/fleet.ts` has:
- `POST /drivers/:id/documents` — upload with type validation
- `GET /drivers/:id/documents` — list active documents
- `GET /drivers/:driverId/documents/:docId/download` — signed download URL
- `DELETE /drivers/:driverId/documents/:docId` — soft delete
- `GET /documents/drivers/expiring` — expiring driver docs
**Frontend:** MISSING — Driver detail has empty Documents tab
**API Client:** MISSING — No driver document methods in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/drivers/[id]/page.tsx:106` — Documents tab exists but has no content
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `drivers.listDocuments(id)`, `drivers.uploadDocument(id, formData)`, `drivers.downloadDocument(driverId, docId)`, `drivers.deleteDocument(driverId, docId)` methods
2. `desktop/src/app/(app)/fleet/drivers/[id]/page.tsx:106` — Implement Documents tab content with upload form, list, expiry indicators

---

### TICKET-315: Driver Schedule Calendar API — DONE
**Backend:** DONE — `backend/src/routes/fleet.ts` has:
- `GET /drivers/schedule?from=&to=` — fleet-wide driver schedule grid
- `GET /drivers/:id/schedule?from=&to=` — single driver schedule with trip details
**Frontend:** PARTIAL — `desktop/src/components/domain/fleet/driver-schedule-calendar.tsx` exists as component
**API Client:** MISSING — No schedule methods in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- Driver detail page doesn't use the schedule calendar component
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `drivers.getSchedule(params)` and `drivers.getSingleSchedule(id, params)` methods
2. `desktop/src/app/(app)/fleet/drivers/[id]/page.tsx` — Add Schedule tab using `DriverScheduleCalendar` component

---

### TICKET-316: Trip Assignment CRUD API — DONE
**Backend:** DONE — `backend/src/routes/fleet.ts` has all trip endpoints:
- `POST /trips` — create with vehicle/driver availability validation, auto-fills passenger from lead
- `GET /trips` — list with filters (status, driverId, vehicleId, leadId, date range)
- `GET /trips/:id` — detail with vehicle, driver, passenger, timeline
- `PUT /trips/:id` — update (only if status is 'assigned')
- `DELETE /trips/:id` — soft delete
- `PUT /trips/:id/status` — status transitions with validation (assigned→accepted→en_route→started→completed, assigned|accepted→cancelled)
- Timeline recording on each status change
- Vehicle/driver status auto-update on started/completed/cancelled
**Frontend:** N/A (backend-only ticket)
**API Client:** DONE — `desktop/src/lib/api/fleet.ts:267-299` has trips CRUD methods with field mapping
**UX Issues:** None
**Fix Required:** None

---

### TICKET-317: Trip Cost Tracking API — PARTIAL
**Backend:** DONE — `backend/src/routes/fleet.ts` has:
- `POST /trips/:id/costs` — add cost with receipt upload
- `GET /trips/:id/costs` — list costs with total
- `DELETE /trips/:tripId/costs/:costId` — delete cost
- `GET /trips/:id/costs/summary` — breakdown by cost type
- `GET /trips/:id/costs/report` — aggregate cost report across date range
**Frontend:** PARTIAL — Trip detail Costs tab exists but only shows estimated/actual cost, no cost entry management
**API Client:** MISSING — No trip cost methods in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/trips/[id]/page.tsx:315-360` — Costs tab shows estimated cost and invoice generation link but doesn't list individual cost entries (fuel, toll, etc.)
- No "Add Cost" button or cost entry form
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `trips.addCost(tripId, data)`, `trips.listCosts(tripId)`, `trips.deleteCost(tripId, costId)`, `trips.getCostSummary(tripId)` methods
2. `desktop/src/app/(app)/fleet/trips/[id]/page.tsx` — Add cost entry list, "Add Cost" form, cost summary breakdown by type

---

### TICKET-318: Customer Notification on Driver Assignment — PARTIAL
**Backend:** DONE — `backend/src/services/fleet-notification.ts` exists with WhatsApp notification logic. Called from trip creation/update in fleet routes.
**Frontend:** PARTIAL — Trip creation form doesn't capture `passengerPhone` which is needed for notification to fire
**API Client:** PARTIAL — Trip create request doesn't send `passengerName`/`passengerPhone` fields
**UX Issues:**
- `fleet/trips/new/page.tsx:31-41` — Form state has no `passengerName`, `passengerPhone`, `leadId`, `specialInstructions` fields
- `desktop/src/lib/api/fleet.ts:106-117` — `CreateTripRequest` interface missing `passengerName`, `passengerPhone`, `leadId`, `specialInstructions`
- `desktop/src/lib/api/fleet.ts:282-292` — Trip create body doesn't send passenger fields to backend
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts:106-117` — Add `passengerName`, `passengerPhone`, `leadId`, `specialInstructions` to `CreateTripRequest`
2. `desktop/src/lib/api/fleet.ts:282-292` — Include passenger fields in create body
3. `desktop/src/app/(app)/fleet/trips/new/page.tsx` — Add passenger section with lead search, auto-populate name/phone from lead contact

---

### TICKET-319: Fleet Dashboard API — PARTIAL
**Backend:** DONE — `backend/src/routes/fleet.ts` has `GET /dashboard` endpoint returning vehicle/driver summaries, active trips, upcoming trips, expiring documents count, maintenance due, recent completed, top drivers by rating.
**Frontend:** PARTIAL — Dashboard page exists but doesn't use the dedicated dashboard endpoint
**API Client:** MISSING — No `dashboard()` method in `desktop/src/lib/api/fleet.ts`
**UX Issues:**
- `fleet/page.tsx:52-64` — Makes 3 separate API calls (`vehicles.list`, `drivers.list`, `trips.list`) all with `limit: 100` instead of single `GET /fleet/dashboard`
- `fleet/page.tsx:90` — Top drivers sorted by `experience` instead of `rating` (spec says by rating)
- `fleet/page.tsx` — No alerts/expiring documents section per spec
- `fleet/page.tsx` — No recent completed trips with cost summary per spec
**Fix Required:**
1. `desktop/src/lib/api/fleet.ts` — Add `dashboard()` method calling `GET /fleet/dashboard`
2. `desktop/src/app/(app)/fleet/page.tsx` — Replace 3 API calls with single dashboard call; add alerts section; sort top drivers by rating; add recent completed trips section

---

### TICKET-320: Flutter — Vehicle List & Detail Screens — PARTIAL (Desktop Equivalent)
**Note:** This ticket targets Flutter but desktop equivalents exist. Auditing desktop implementation against spec.
**Backend:** N/A (frontend ticket)
**Frontend:** PARTIAL — Desktop pages exist but missing key spec requirements:
- Vehicle list (`fleet/vehicles/page.tsx`): Has grid/table views, search, status filter ✓ but missing infinite scroll, FilterBar, vehicle type filter chips, document expiry badges in grid
- Vehicle detail (`fleet/vehicles/[id]/page.tsx`): Has Overview + Trips tabs ✓ but missing Documents tab (with expiry indicators), Maintenance tab, Availability calendar tab per spec
**UX Issues:**
- `fleet/vehicles/page.tsx:78` — No infinite scroll (`limit: 100`)
- `fleet/vehicles/[id]/page.tsx:88-93` — Only 2 tabs vs 4 required (Documents, Maintenance, Availability missing)
- `fleet/vehicles/[id]/page.tsx:83` — Edit button not linked (no href)
- `fleet/vehicles/[id]/page.tsx:84` — Deactivate button is placeholder
- No document expiry indicators (green/yellow/red) per spec
**Fix Required:**
1. `fleet/vehicles/page.tsx` — Add `useInfiniteScroll`, `FilterBar`, vehicle type filter
2. `fleet/vehicles/[id]/page.tsx` — Add Documents, Maintenance, Availability tabs; link Edit button; implement Deactivate

---

### TICKET-321: Flutter — Vehicle Create/Edit Form — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — `fleet/vehicles/new/page.tsx` and `fleet/vehicles/[id]/edit/page.tsx` exist
- Create form has basic fields ✓
- Missing: photo upload, document upload section per spec
- Edit form has `@ts-ignore` comments
**UX Issues:**
- No photo upload area per spec
- No document upload section (RC, Insurance, Permit, Pollution)
- No unsaved changes warning on back navigation
**Fix Required:**
1. Add photo upload area to create/edit forms
2. Add expandable document upload section

---

### TICKET-322: Flutter — Driver List & Detail Screens — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — Desktop pages exist but missing features:
- Driver list (`fleet/drivers/page.tsx`): Has grid/table, search, status filter ✓ but missing infinite scroll, FilterBar, rating display, trip count
- Driver detail (`fleet/drivers/[id]/page.tsx`): Has Overview, Documents (empty), Trips, Performance tabs ✓ but Documents tab empty, no emergency contact, no Schedule tab, no rating history
**UX Issues:**
- `fleet/drivers/page.tsx:74` — No infinite scroll (`limit: 100`)
- `fleet/drivers/page.tsx:58-61` — License badge always "License valid" — doesn't check actual expiry
- `fleet/drivers/[id]/page.tsx:106` — Empty Documents tab
- No Schedule/Calendar tab
- No emergency contact display
- No driver rating/stars display in detail
**Fix Required:**
1. `fleet/drivers/page.tsx` — Add `useInfiniteScroll`, `FilterBar`, rating stars, proper license expiry badge
2. `fleet/drivers/[id]/page.tsx` — Populate Documents tab, add Schedule tab, add emergency contact, add rating display

---

### TICKET-323: Flutter — Driver Create/Edit Form — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — `fleet/drivers/new/page.tsx` and `fleet/drivers/[id]/edit/page.tsx` exist
- Has name, phone, email, license fields ✓
- Missing: photo upload, document upload section, PhoneInput component usage
- Edit form has `@ts-ignore` comments, doesn't use PhoneInput
**UX Issues:**
- Uses plain `<Input>` for phone instead of `PhoneInput` component
- No photo upload area
- No document upload section (License, ID Proof, Police Verification)
**Fix Required:**
1. Replace phone `<Input>` with `PhoneInput` component
2. Add photo upload area
3. Add document upload section per spec

---

### TICKET-324: Flutter — Trip Assignment List & Detail Screens — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — Desktop pages exist but with critical mock data bugs:
- Trip list (`fleet/trips/page.tsx`): Has Kanban + table views, search, status filter ✓ but missing infinite scroll, FilterBar, shows raw IDs
- Trip detail (`fleet/trips/[id]/page.tsx`): Has Info, Timeline, Costs tabs ✓ but **vehicle/driver/passenger data is HARDCODED mock data** (lines 124-151)
**UX Issues:**
- `fleet/trips/[id]/page.tsx:124-151` — **BUG**: Hardcoded mock: vehicle = 'Toyota Innova KA-01-AB-1234', driver = 'Driver Name', passenger = 'Passenger'
- `fleet/trips/[id]/page.tsx:148-150` — **BUG**: Mock statusHistory with single entry
- `fleet/trips/page.tsx:47,124` — Raw vehicleId displayed instead of registration number
- `fleet/trips/page.tsx:69` — No infinite scroll
**Fix Required:**
1. `fleet/trips/[id]/page.tsx:124-151` — Fetch real vehicle/driver data using trip.vehicleId/driverId
2. `fleet/trips/[id]/page.tsx:148-150` — Fetch real timeline from `GET /fleet/trips/:id/timeline`
3. `fleet/trips/page.tsx` — Add `useInfiniteScroll`, `FilterBar`, resolve vehicleId→registration

---

### TICKET-325: Flutter — Trip Assignment Create/Edit Form — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — `fleet/trips/new/page.tsx` exists but missing critical fields:
- Has vehicle/driver selects, location inputs, date/time pickers, distance/fare ✓
- Missing: lead search dropdown, passenger fields, special instructions, availability-aware filtering
**UX Issues:**
- `fleet/trips/new/page.tsx:137-159` — Uses raw `Select` instead of searchable `Combobox` for vehicle/driver
- `fleet/trips/new/page.tsx:31-41` — Missing `leadId`, `passengerName`, `passengerPhone`, `specialInstructions`
- `fleet/trips/new/page.tsx:110-114` — Plain `Input` for locations (should use `AddressAutocomplete`)
- No availability-aware filtering — lists all vehicles/drivers regardless of selected dates
- No auto-populate passenger from lead contact
**Fix Required:**
1. Add lead searchable Combobox that auto-fills passenger name/phone
2. Replace Select with searchable Combobox for vehicle/driver
3. Add passenger name, phone, special instructions fields
4. Use AddressAutocomplete for locations with env fallback
5. Filter vehicles/drivers by availability for selected date range

---

### TICKET-326: Flutter — Vehicle Availability Calendar Widget — MISSING (Desktop)
**Frontend:** MISSING — No vehicle availability calendar component in desktop
**API Client:** MISSING — No availability API methods
**UX Issues:**
- Per spec, should show month view with color-coded day cells
- Should be used in vehicle detail and fleet dashboard
**Fix Required:**
1. Create `desktop/src/components/domain/fleet/vehicle-availability-calendar.tsx`
2. Add `vehicles.getAvailability()` to API client
3. Integrate into vehicle detail Availability tab

---

### TICKET-327: Flutter — Driver Schedule Calendar Widget — PARTIAL (Desktop)
**Frontend:** PARTIAL — `desktop/src/components/domain/fleet/driver-schedule-calendar.tsx` exists but not integrated into driver detail page
**API Client:** MISSING — No schedule API methods in fleet.ts
**UX Issues:**
- Component exists but not used in any page
**Fix Required:**
1. Add `drivers.getSchedule()` to API client
2. Add Schedule tab to driver detail page using existing component

---

### TICKET-328: Flutter — Fleet Dashboard Screen — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — `fleet/page.tsx` exists with stats, active trips, upcoming trips, top drivers, fleet status
- Missing: alerts section, expiring documents count, maintenance due count, recent completed trips with cost
- Uses 3 separate API calls instead of dashboard endpoint
- Top drivers sorted by experience instead of rating
**UX Issues:** See TICKET-319 issues above
**Fix Required:** See TICKET-319 fix required above

---

### TICKET-329: Fleet Module Routes & Navigation — DONE
**Backend:** N/A
**Frontend:** DONE — All fleet routes exist in Next.js App Router:
- `/fleet` → FleetDashboardPage ✓
- `/fleet/vehicles` → VehiclesPage ✓
- `/fleet/vehicles/new` → NewVehiclePage ✓
- `/fleet/vehicles/:id` → VehicleDetailPage ✓
- `/fleet/vehicles/:id/edit` → EditVehiclePage ✓
- `/fleet/drivers`, `/fleet/drivers/new`, `/fleet/drivers/:id`, `/fleet/drivers/:id/edit` ✓
- `/fleet/trips`, `/fleet/trips/new`, `/fleet/trips/:id`, `/fleet/trips/:id/edit` ✓
- `/fleet/rate-cards`, `/fleet/rate-cards/new` ✓
- `/fleet/alerts` ✓
**Sidebar:** DONE — `desktop/src/components/layout/sidebar.tsx:85` has Fleet entry under Operations
**UX Issues:** None
**Fix Required:** None

---

### TICKET-330: Flutter — Fleet Alerts Screen — PARTIAL (Desktop Equivalent)
**Frontend:** PARTIAL — `fleet/alerts/page.tsx` exists but very limited:
- Only shows driver license expiry alerts
- Missing: vehicle document alerts (insurance, permit, pollution, RC)
- Missing: maintenance due tab
- Only one "All" tab instead of "Expiring Documents" + "Maintenance Due"
- ExternalLink button is placeholder
**UX Issues:**
- `fleet/alerts/page.tsx:74-83` — Only processes driver license expiry, ignores vehicle documents
- `fleet/alerts/page.tsx:106-111` — Single "All" tab vs required "Expiring Documents" + "Maintenance Due"
- `fleet/alerts/page.tsx:44` — ExternalLink button has no onClick handler
**Fix Required:**
1. Call backend APIs: `GET /fleet/documents/expiring`, `GET /fleet/documents/drivers/expiring`, `GET /fleet/maintenance/due`
2. Add "Expiring Documents" tab (vehicle + driver docs grouped by urgency) and "Maintenance Due" tab
3. Link ExternalLink button to relevant vehicle/driver detail page
4. Add filter toggle: Vehicle Documents / Driver Documents
