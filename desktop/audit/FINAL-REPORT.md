# TravelCRM Pro — Full Audit Report
Generated: 2026-03-09

## Executive Summary
- **Total milestones audited:** 13 (M6–M18)
- **Total tickets:** 299
- **Done:** 82 | **Partial:** 133 | **Missing:** 44 | **Bug:** 50
- **Overall completion:** 27% Done, 45% Partial, 15% Missing, 13% Bug
- **Effective completion (Done + Partial):** 72%

> **Note:** M1–M4 were covered by user-confirmed desktop implementation. M5 has no ticket file. M19+ not yet audited.

---

## Milestone Status Matrix

| Milestone | Description | Tickets | Done | Partial | Missing | Bug | Completion % |
|-----------|-------------|---------|------|---------|---------|-----|-------------|
| M6 | Itineraries & Rate Cards | 25 | 14 | 7 | 1 | 3 | 84% |
| M7 | Invoices & Payments | 27 | 14 | 8 | 2 | 3 | 81% |
| M8 | Communication Hub | 26 | 4 | 11 | 5 | 6 | 58% |
| M9 | Campaigns & Email | 17 | 4 | 8 | 2 | 3 | 71% |
| M10 | Notifications | 17 | 7 | 5 | 2 | 3 | 71% |
| M11 | Vouchers | 22 | 3 | 8 | 6 | 5 | 50% |
| M12 | Supplier Management | 20 | 4 | 8 | 5 | 3 | 60% |
| M13 | Travellers & Visa | 26 | 3 | 12 | 8 | 3 | 58% |
| M14 | Tasks & Calendar | 24 | 8 | 10 | 2 | 4 | 75% |
| M15 | Reports & Analytics | 30 | 6 | 17 | 4 | 3 | 77% |
| M16 | Import & Export | 19 | 5 | 8 | 1 | 5 | 68% |
| M17 | Marketing & Promotions | 20 | 2 | 10 | 5 | 3 | 60% |
| M18 | Fleet Management | 26 | 8 | 11 | 1 | 6 | 73% |
| **TOTAL** | | **299** | **82** | **133** | **44** | **50** | **68%** |

*Completion % = (Done + 0.5×Partial) / (Total - Flutter-only N/A tickets) × 100*

---

## All Environment Variables

| Variable | Description | Used By | Required? | Default/Fallback |
|----------|-------------|---------|-----------|------------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `desktop/src/lib/api/config.ts` | Yes | `http://localhost:8787/api/v1` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Places address autocomplete | `desktop/src/components/ui/address-autocomplete.tsx` | No | Falls back to plain text input |
| `SENDGRID_API_KEY` | Email sending via SendGrid | `backend/src/services/sendgrid.ts`, email queue | Yes (email) | Email sending fails gracefully |
| `SENDGRID_FROM_EMAIL` | Sender email for transactional emails | `backend/src/services/sendgrid.ts` | No | Hardcoded `noreply@travelcrm.pro` |
| `SENDGRID_FROM_NAME` | Sender display name | `backend/src/services/sendgrid.ts` | No | Hardcoded `TravelCRM Pro` |
| `SENDGRID_UNSUBSCRIBE_GROUP_ID` | Unsubscribe group for CAN-SPAM compliance | Marketing campaigns (M17) | Yes (marketing) | Not implemented |
| `TWILIO_ACCOUNT_SID` | Twilio account for SMS/WhatsApp | `backend/src/services/twilio-messaging.ts` | Yes (SMS/WA) | Send fails with error |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `backend/src/services/twilio-messaging.ts`, webhook middleware | Yes (SMS/WA) | Send fails; webhook validation fails |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify for OTP | `backend/src/services/twilio.ts` | Yes (OTP) | OTP sending fails |
| `TWILIO_SMS_FROM_NUMBER` | Twilio SMS sender number | `backend/src/services/twilio-messaging.ts` | Yes (SMS) | SMS sending fails |
| `TWILIO_WHATSAPP_FROM_NUMBER` | Twilio WhatsApp sender number | `backend/src/services/twilio-messaging.ts` | Yes (WA) | WhatsApp sending fails |
| `FCM_SERVER_KEY` | Firebase Cloud Messaging for push | `backend/src/services/fcm.ts` | Yes (push) | Push notifications silently fail |
| `JWT_SECRET` | JWT token signing (unsubscribe tokens) | Not yet implemented | Would be required | N/A |
| `UNSUB_SECRET` | HMAC for unsubscribe tokens | Marketing (M17) | Yes (marketing) | Unsubscribe links can be forged |
| `API_BASE_URL` | External API base for webhooks | `backend/src/types.ts` | No | Webhook callback URLs may be incorrect |
| `FILE_STORAGE` | R2 bucket binding for file uploads | `backend/src/routes/files.ts`, imports, exports | Yes | Upload/serve fails with 500 |
| `FLEET_BUCKET` | R2 bucket for fleet photos/docs | `backend/src/routes/fleet.ts` | Yes (fleet) | Photo/doc upload returns 500 |
| `R2_BUCKET` | R2 bucket for marketing images | `backend/src/routes/marketing/images.ts` | Yes (marketing) | Image upload fails |
| `R2_PUBLIC_URL` | Public URL prefix for R2 | Marketing routes | Yes (marketing) | Cannot generate public URLs |
| `EMAIL_QUEUE` | Cloudflare Queue for email jobs | Invoice reminders, campaigns, visa alerts | Yes | Email queuing fails |
| `SMS_QUEUE` | Cloudflare Queue for SMS/WhatsApp | Communication hub, itinerary sends | Yes | Message queuing fails |
| `PUSH_NOTIFICATION_QUEUE` | Queue for push notifications | `backend/src/services/notification-service.ts`, cron jobs | Yes | Crashes if missing (no null-check) |
| `NOTIFICATION_QUEUE` | Queue for general notifications | AI extraction, missed calls | No | Guarded with `if` check — safe |
| `CAMPAIGN_QUEUE` | Queue for marketing campaigns | `backend/src/routes/marketing/campaigns.ts` | Yes (campaigns) | Campaign send fails |
| `IMPORT_QUEUE` | Queue for import processing | `backend/src/routes/imports.ts` | Yes (import) | Import execution fails |
| `EXPORT_QUEUE` | Queue for bulk export | `backend/src/routes/exports.ts` | Yes (export) | Bulk PDF/full export fails |
| `MASTER_DB` | D1 binding for tenant registry | Share links, cron tenant iteration, import/export queues | Yes | Operations crash |
| `KV` | KV binding for exchange rates | `backend/src/services/exchange-rate.ts` | No | Falls back to hardcoded rates |
| `CACHE` | KV binding for follow-up dedup | `backend/src/services/follow-up-reminders.ts` | Yes (follow-ups) | Crashes if undefined |
| `REPORT_CACHE` | KV binding for report caching | `backend/src/services/report-cache.ts` | No | Reports work without cache |
| `MESSAGING_QUEUE` | Queue for fleet notifications | `backend/src/services/fleet-notification.ts` | Yes (fleet) | Customer WA notification won't send |

---

## UX Anti-Patterns (consolidated, deduplicated)

| Pattern | Occurrences | Pages Affected | Fix Status |
|---------|------------|----------------|------------|
| No `useInfiniteScroll` — loads all records (limit: 100) | 25+ | invoices, payments, vouchers, suppliers, travellers, visa, tasks, calendar, notifications, campaigns, segments, communication, templates, reports, fleet vehicles/drivers/trips, rate-cards, marketing campaigns, alerts | Unfixed |
| No `FilterBar` component — uses raw `<Select>` + `<Input>` | 22+ | invoices, payments, vouchers, suppliers, travellers, visa, tasks, notifications, campaigns, communication, itineraries, rate-cards, fleet vehicles/drivers/trips, marketing campaigns/segments | Unfixed |
| Raw ID display instead of resolved names | 15+ | tasks (leadId, assignedTo), calendar (leadId), invoices (leadId), vouchers (leadId), fleet trips (vehicleId, driverId), payments | Unfixed |
| No searchable `Combobox` for relation fields — uses plain `<Select>` or raw `<Input>` | 20+ | invoices (contact, lead, HSN), vouchers (lead, supplier), itineraries (lead, supplier), payments (lead, invoice), visa (traveller, country), tasks (assignee, lead), fleet trips (vehicle, driver), communication compose (recipient), campaigns (template) | Unfixed |
| Hardcoded mock/sample data instead of API calls | 12+ | communication page (mock messages), templates (hardcoded), bulk-send (mock segments/templates), campaigns detail (mock recipients), reports (fallback data), fleet trip detail (mock vehicle/driver), import wizard (sample data) | Unfixed |
| No loading skeletons — uses spinner | 20+ | All list pages, all report pages, notification, calendar, fleet pages, marketing pages | Unfixed |
| No detail drawer on list pages | 18+ | invoices, payments, vouchers, suppliers, travellers, visa, notifications, campaigns, itineraries, rate-cards, fleet vehicles/drivers/trips, marketing campaigns/segments, communication, credit/debit notes | Unfixed |
| No hover actions on table/list rows | 15+ | invoices, payments, vouchers, travellers, visa, notifications, fleet pages, marketing pages | Unfixed |
| Custom send dialog instead of `SendMessageDialog` | 5 | invoices detail, vouchers detail, reminders, bulk-send, marketing flyers | Unfixed |
| No empty state component | 10+ | invoices, vouchers, suppliers, travellers, visa, fleet pages, templates | Unfixed |
| No auto-populate from URL params | 10+ | invoices/new, vouchers/new, visa/new, travellers/new, tasks/new, communication/compose, campaigns/new, fleet/trips/new | Unfixed |
| API contract mismatches (frontend ≠ backend types) | 15+ | itineraries (Send/Clone/Update), communications (Send/Template/Document/Bulk), vouchers (all types), suppliers (compare), exports (contacts), events (reschedule), notification preferences, quiet hours | Unfixed |
| Placeholder/no-op action buttons | 8 | invoices (Download PDF), payments (View/Delete), rate-cards (Delete), vouchers (status), fleet vehicles (Deactivate/Edit), fleet drivers (Deactivate), fleet rate-cards (Edit), fleet alerts (ExternalLink) | Unfixed |
| Phone inputs use plain `<Input>` instead of `PhoneInput` | 4 | suppliers/new, fleet drivers/new, fleet drivers/edit, travellers/new | Unfixed |
| Address uses plain `<Input>` instead of `AddressAutocomplete` | 3 | suppliers/new, fleet trips/new, travellers/new | Unfixed |

---

## UX Improvements Master List

| # | Page | Improvement | Priority | Milestone | Effort |
|---|------|-------------|----------|-----------|--------|
| 1 | All list pages | Add `useInfiniteScroll` hook | P1 | All | Low (per page) |
| 2 | All list pages | Replace inline filters with `FilterBar` | P1 | All | Low (per page) |
| 3 | All list pages | Add loading skeleton components | P1 | All | Low (per page) |
| 4 | All list pages | Add detail drawer for quick preview | P2 | All | Medium (per page) |
| 5 | All list pages | Add hover action icons (Eye, Edit, Trash) | P2 | All | Low (per page) |
| 6 | All list pages | Add empty state with CTA | P2 | All | Low (per page) |
| 7 | All form pages | Replace raw `<Select>` with searchable `Combobox` | P1 | All | Medium (per page) |
| 8 | All form pages | Auto-populate from URL params | P1 | All | Low (per page) |
| 9 | All report pages | Replace fallback data with API calls | P0 | M15 | High |
| 10 | All report pages | Add period comparison toggle | P2 | M15 | Medium |
| 11 | All report pages | Add custom date range picker | P2 | M15 | Medium |
| 12 | invoices/new | Invoice type selector (Tax/Proforma) | P1 | M7 | Low |
| 13 | invoices/[id] | GST/Tax breakdown (CGST/SGST/IGST) | P1 | M7 | Medium |
| 14 | invoices/[id] | Use `SendMessageDialog` for sending | P1 | M7 | Low |
| 15 | invoices PDF | Branded header, QR, bank details, amount in words | P1 | M7 | High |
| 16 | payments/page | Wire View details and Delete handlers | P0 | M7 | Low |
| 17 | payments/page | Fix hardcoded `overdueCount = 0` | P0 | M7 | Low |
| 18 | vouchers (all) | Complete rewrite — wrong data model | P0 | M11 | High |
| 19 | suppliers routes | Fix `is_active` → `is_deleted` SQL bug | P0 | M12 | Low |
| 20 | suppliers/compare | Fix POST→GET method mismatch | P0 | M12 | Low |
| 21 | suppliers detail | Fix field name mismatches (balance, debit, credit) | P0 | M12 | Low |
| 22 | communication | Replace mock messages with API data | P0 | M8 | High |
| 23 | templates CRUD | Wire to backend API (currently hardcoded) | P0 | M8 | High |
| 24 | API contracts | Fix all 15+ frontend-backend type mismatches | P0 | M8,M11 | High |
| 25 | visa cron | Fix wrong column names (country, expiry_date, passport_expiry) | P0 | M13 | Low |
| 26 | campaign scheduler | Fix wrong table name (`email_campaigns` → `marketingCampaigns`) | P0 | M17 | Low |
| 27 | import queue | Fix MASTER_DB → tenant DB usage | P0 | M16 | Medium |
| 28 | export queue | Fix MASTER_DB → tenant DB usage | P0 | M16 | Medium |
| 29 | sidebar | Fix hardcoded `badge: 7` to dynamic unread count | P1 | M10 | Low |
| 30 | dashboard | Fix `/planner` link → `/calendar` | P0 | M14 | Low |
| 31 | events API | Fix POST→PATCH for reschedule | P0 | M14 | Low |
| 32 | exports API | Fix POST→GET for contacts export | P0 | M16 | Low |
| 33 | fleet trip detail | Replace hardcoded mock data with API calls | P0 | M18 | Medium |
| 34 | fleet alerts | Add vehicle document and maintenance due alerts | P1 | M18 | Medium |
| 35 | fleet dashboard | Use dedicated dashboard endpoint | P1 | M18 | Low |
| 36 | calendar | Add week/day views | P2 | M14 | High |
| 37 | calendar | Add drag-and-drop rescheduling | P2 | M14 | High |
| 38 | calendar | Add team/my calendar toggle | P2 | M14 | Low |
| 39 | tasks | Add list view alongside Kanban | P2 | M14 | Medium |
| 40 | tasks | Create dedicated detail page with subtasks + comments | P1 | M14 | High |
| 41 | Webhook | Fix tenant DB resolution on Twilio status webhook | P0 | M8 | Medium |
| 42 | Webhook | Add Twilio signature verification | P0 | M8 | Low |
| 43 | Excel export | Fix USD → INR currency format | P0 | M15 | Low |
| 44 | Reports hub | Use `reportsApi.getDashboard()` instead of raw entity fetch | P0 | M15 | Low |
| 45 | notification prefs | Fix data format mismatch (channel-first → type-first) | P0 | M10 | Medium |
| 46 | quiet hours | Fix string→integer time format mismatch | P0 | M10 | Low |

---

## Missing Features (not yet implemented)

| Feature | Milestone | Ticket(s) | Backend | Frontend | Effort |
|---------|-----------|-----------|---------|----------|--------|
| Multilingual PDF Generation | M6 | TICKET-101 | Missing | Missing | High |
| Payment Receipt PDF | M7 | TICKET-115 | Missing | Missing | Medium |
| Credit/Debit Notes standalone pages | M7 | TICKET-116 | Done | Partial (pages exist) | Medium |
| Invoice from Lead Detail integration | M7 | TICKET-123 | N/A | Missing | Medium |
| Invoice Contact 360° integration | M7 | TICKET-125 | N/A | Missing | Medium |
| WhatsApp Quick Replies | M8 | TICKET-140 | Missing | Missing | Medium |
| WhatsApp Click-to-Chat | M8 | TICKET-141 | N/A | Missing | Low |
| Multilingual Templates | M8 | TICKET-142 | Partial | Missing | Medium |
| SMS Delivery DND Compliance | M8 | TICKET-145 | Missing | Missing | Medium |
| Multi-Channel Template Adaptation | M8 | TICKET-146 | Missing | Missing | High |
| Unsubscribe Management (GDPR) | M9 | TICKET-155 | Missing | Missing | High |
| Email Signature Settings | M9 | TICKET-158 | Missing | Missing | Medium |
| Campaign Scheduler Cron | M9 | TICKET-160 | Partial (wrong table) | Partial | Medium |
| Notification — Payment/Invoice Events | M10 | TICKET-166 | Missing | N/A | Low |
| Custom Admin Announcements UI | M10 | TICKET-173 | Done | Missing | Medium |
| Notification Deep Linking | M10 | TICKET-174 | Done | Missing | Low |
| Voucher PDF Generation (all types) | M11 | TICKET-185,186 | Missing | Missing | High |
| Voucher from Itinerary UI | M11 | TICKET-187 | Done | Missing | Medium |
| Voucher Bulk Send UI | M11 | TICKET-192 | Done | Missing | Medium |
| Supplier Document Upload | M12 | TICKET-204 | Missing | Missing | High |
| Supplier Email Communication | M12 | TICKET-205 | Missing | Missing | Medium |
| Supplier FTS5 Search | M12 | TICKET-206 | Missing | Missing | Medium |
| Supplier Import/Export | M12 | TICKET-207 | Missing | Missing | High |
| Supplier Dashboard Widget | M12 | TICKET-209 | Missing | Missing | Medium |
| Traveller-to-Contact Linking | M13 | TICKET-216 | Missing | Missing | Medium |
| Visa Document Upload to R2 | M13 | TICKET-225 | Missing | Missing | High |
| Send Visa Docs via WhatsApp/Email | M13 | TICKET-226 | Missing | Missing | Medium |
| Missing Document Alerts | M13 | TICKET-224 | Missing | Missing | Medium |
| Visa Status Pipeline & History | M13 | TICKET-232 | Missing | Missing | High |
| Calendar Week/Day Views | M14 | TICKET-234 | N/A | Missing | High |
| Calendar Drag-and-Drop | M14 | TICKET-237 | Done | Missing | Medium |
| Team Calendar Toggle | M14 | TICKET-238 | Done | Missing | Low |
| Report Dashboard Widgets | M15 | TICKET-255 | Missing | Missing | High |
| Report Drill-Down | M15 | TICKET-256 | Partial | Missing | High |
| 34+ Missing Report Definitions | M15 | Multiple | Missing | N/A | High |
| Festival Offers Campaigns | M17 | TICKET-306 | Missing | Missing | High |
| Quick Create Flyer Flow | M17 | TICKET-296 | Partial | Missing | Medium |
| Opted-Out Contacts Management | M17 | TICKET-305 | Partial | Missing | Medium |
| Marketing Dashboard | M17 | TICKET-304 | Partial | Missing | Medium |
| Vehicle Availability Calendar Widget | M18 | TICKET-326 | Done | Missing | Medium |
| Vehicle Documents UI | M18 | TICKET-309 | Done | Missing | Medium |
| Vehicle Maintenance UI | M18 | TICKET-310 | Done | Missing | Medium |
| Fleet Trip Cost Management UI | M18 | TICKET-317 | Done | Missing | Medium |

---

## Architecture Recommendations

### Component Consolidation Opportunities
- **3 import pages** (`/import`, `/contacts/import`, `/settings/import`) should be consolidated into one wizard at `/import`
- **2 campaign systems** (`/campaigns` from M9 and `/marketing/campaigns` from M17) should be unified
- **Report pages** share identical layout — extract `ReportPageTemplate` component to reduce ~2000 lines of duplication
- **Send dialogs** — 5 pages use custom send dialogs instead of the shared `SendMessageDialog`

### State Management Improvements
- Sidebar badge counts should use a global polling provider (every 60-120s) calling `getBadgeCounts()`
- Report date range selection should be persisted in localStorage per report
- Form dirty-state tracking should be added globally for navigation guards

### Performance Optimizations
- Reports Hub fetches 500 leads + 500 invoices client-side — use `/reports/dashboard` endpoint
- Fleet dashboard makes 3 separate API calls — use dedicated `/fleet/dashboard` endpoint
- Report KV caching exists but is NOT wired into the route handler
- Multiple pages load ALL records (limit: 100-500) instead of paginating

### API Standardization
- 15+ API contract mismatches between frontend types and backend Zod schemas
- HTTP method mismatches: contacts export (POST→GET), event reschedule (POST→PATCH)
- Variable template syntax inconsistency: `{{name}}` vs `{customer_name}` across pages
- Status enum mismatches: vouchers (`issued/used/expired` vs `draft/sent/confirmed`), tasks (`pending/completed` vs `todo/done`)

---

## Future Enhancements (beyond current tickets)
- Keyboard navigation / Cmd+K command palette for power users
- Offline support with service worker caching for Electron
- Real-time collaboration via WebSocket for shared leads/itineraries
- Advanced analytics with custom report builder (drag-and-drop columns)
- Mobile responsive web fallback for on-the-go access
- AI-powered features: smart lead scoring, auto-reply suggestions, sentiment analysis
- Multi-language UI localization (Hindi, Arabic, etc.)
- Audit trail / activity log viewer across all entities
- Role-based dashboard customization
- Webhook integrations (Zapier, n8n) for third-party connectivity

---

## E2E Test Coverage

| Area | Tests | Pass | Fail | Coverage |
|------|-------|------|------|----------|
| M6 — Itineraries & Rate Cards | 1 spec | Written | Not validated | Basic |
| M7 — Invoices & Payments | 1 spec | Written | Not validated | Basic |
| M8 — Communication Hub | 1 spec | Written | Not validated | Basic |
| M9 — Campaigns & Email | 1 spec | Written | Not validated | Basic |
| M10 — Notifications | 1 spec | Written | Not validated | Basic |
| M11 — Vouchers | 1 spec | Written | Not validated | Basic |
| M12 — Suppliers | 1 spec | Written | Not validated | Basic |
| M13 — Travellers & Visa | 1 spec | Written | Not validated | Basic |
| M14 — Tasks & Calendar | 1 spec | Written | Not validated | Basic |
| M15 — Reports & Analytics | 1 spec | Written | Not validated | Basic |
| M16 — Import & Export | 1 spec | Written | Not validated | Basic |
| M17 — Marketing Campaigns | 1 spec | Written | Not validated | Basic |
| M18 — Fleet Management | 1 spec | Written | Not validated | Basic |

> **Note:** E2E tests exist as spec files at `desktop/e2e/` but most have not been run against a live backend. Full validation requires running backend + frontend together.
