# TravelCRM Pro — UX Improvements Master List
Generated: 2026-03-09

Ranked by priority, deduplicated across all 13 milestones (M6–M18).

---

## P0 — Broken (users can't complete tasks)

| # | Area | Issue | Files | Milestone |
|---|------|-------|-------|-----------|
| 1 | Vouchers | **Entire frontend uses wrong data model** — renders `voucherNumber`, `issueDate`, `items[]` that don't exist in backend. List/detail/forms all broken. | `desktop/src/lib/api/vouchers.ts`, `vouchers/page.tsx`, `vouchers/[id]/page.tsx`, `vouchers/new/page.tsx`, `vouchers/[id]/edit/page.tsx` | M11 |
| 2 | Suppliers | **All API calls fail** — routes query `is_active` column but schema has `is_deleted` | `backend/src/routes/suppliers.ts:35,56,88,108,125,201,237` | M12 |
| 3 | Import Queue | **Imports data into wrong database** — uses `MASTER_DB` instead of tenant DB | `backend/src/queues/import-queue.ts:28` | M16 |
| 4 | Export Queue | **Exports from wrong database** — uses `MASTER_DB` instead of tenant DB | `backend/src/queues/export-queue.ts:29` | M16 |
| 5 | Communication | **Mock messages everywhere** — inbox shows hardcoded chat, templates use local data, bulk-send has fake segments | `communication/page.tsx`, `templates/page.tsx`, `templates/new/`, `templates/[id]/edit/`, `bulk-send/` | M8 |
| 6 | Templates | **No API client exists** — entire template CRUD uses hardcoded data instead of backend | Missing `desktop/src/lib/api/templates.ts` in config | M8 |
| 7 | API Contracts | **15+ type mismatches** — frontend sends wrong shapes to backend Zod validators, causing runtime errors | `communications.ts`, `itineraries.ts`, `vouchers.ts`, `suppliers.ts`, `exports.ts`, `events.ts`, `notifications prefs` | M8,M6,M11 |
| 8 | Webhook | **Tenant DB resolution broken** — `c.get('tenantDb')` on public route where no auth sets tenant context | `backend/src/routes/webhooks.ts:34` | M8 |
| 9 | Webhook | **No Twilio signature verification** — security vulnerability allowing spoofed status updates | `backend/src/routes/webhooks.ts:14` | M8 |
| 10 | Visa Cron | **Wrong column names** — queries `va.country`, `va.expiry_date`, `t.passport_expiry` but schema has different names | `backend/src/cron/auto-reminders.ts:350,355,382` | M13 |
| 11 | Campaign Scheduler | **Wrong table name** — queries `email_campaigns` instead of `marketingCampaigns`; campaigns never auto-fire | `backend/src/cron/campaign-scheduler.ts:27` | M17 |
| 12 | Reports | **Fallback data silently replaces real data** — users see fake numbers without knowing | All 12 report pages | M15 |
| 13 | Reports Hub | **Fetches 500 leads + 500 invoices** to compute KPIs client-side; backend dashboard endpoint exists | `reports/page.tsx:174-175` | M15 |
| 14 | Excel Export | **USD currency format** — uses `$` instead of `₹` for Indian travel CRM | `backend/src/services/exports/excel-export.ts:35` | M15 |
| 15 | Dashboard | **Links to `/planner`** which doesn't exist — should be `/calendar` | `desktop/src/app/(app)/page.tsx:111` | M14 |
| 16 | Events API | **POST for reschedule** — backend expects PATCH, client sends POST | `desktop/src/lib/api/events.ts:96` | M14 |
| 17 | Exports API | **POST for contacts export** — backend route is GET, client sends POST | `desktop/src/lib/api/exports.ts:40` | M16 |
| 18 | Payments | **View/Delete buttons do nothing** — no onClick handlers | `payments/page.tsx:188-189` | M7 |
| 19 | Payments | **Overdue count hardcoded to 0** | `payments/page.tsx:69` | M7 |
| 20 | Suppliers Compare | **POST to GET-only endpoint** — rate comparison always fails | `suppliers.ts:129-130` | M12 |
| 21 | Rate Cards Import | **Raw supplier name used as FK ID** — inserts fail with FK violation | `backend/src/services/imports/row-inserter.ts:123` | M16 |
| 22 | Fleet Trip Detail | **Hardcoded mock data** — vehicle, driver, passenger are fake strings | `fleet/trips/[id]/page.tsx:124-151` | M18 |
| 23 | Notification Prefs | **Data format mismatch** — frontend sends channel-first, backend expects type-first | `settings/notifications/page.tsx:26-56` | M10 |
| 24 | Quiet Hours | **String times vs integer hours** — PUT saves wrong format | `settings/notifications/page.tsx:135-142` | M10 |
| 25 | Contacts Opt-Out | **Missing columns** — opt-out route references columns that don't exist in contacts table | `backend/src/db/tenant-schema.ts` contacts table | M17 |
| 26 | Supplier Detail | **Field name mismatches** — uses `.name`, `.balance`, `.debit`, `.credit` but backend returns `company_name`, `runningBalance`, `debitAmount`, `creditAmount` | `suppliers/[id]/page.tsx:78,129,134,392-399` | M12 |
| 27 | Notification Badge | **Hardcoded `badge: 7`** in sidebar instead of dynamic count | `sidebar.tsx:117` | M10 |

---

## P1 — Poor UX (users confused, raw IDs, no feedback)

| # | Area | Issue | Files | Milestone |
|---|------|-------|-------|-----------|
| 28 | All List Pages | No `useInfiniteScroll` — loads 100 records at once | 25+ pages across all milestones | All |
| 29 | All List Pages | No `FilterBar` component — uses raw `<Select>` inline | 22+ pages across all milestones | All |
| 30 | All List Pages | No loading skeletons — shows spinner | 20+ pages across all milestones | All |
| 31 | All Form Pages | No searchable `Combobox` for relation fields | 20+ form pages | All |
| 32 | All Form Pages | No auto-populate from URL params | 10+ create pages | All |
| 33 | Tasks | Raw `leadId` and `assignedTo` displayed as text | `tasks/page.tsx:99,108,263,271` | M14 |
| 34 | Calendar | Raw `leadId` displayed | `calendar/page.tsx:345` | M14 |
| 35 | Fleet Trips | Raw `vehicleId` displayed instead of registration | `fleet/trips/page.tsx:47,124` | M18 |
| 36 | Invoices | No GST/Tax breakdown on detail page | `invoices/[id]/page.tsx:623-656` | M7 |
| 37 | Invoices | Contact picker uses `<Select>` not Combobox | `invoices/new/page.tsx:188` | M7 |
| 38 | Invoices | Lead reference is raw text input | `invoices/new/page.tsx:199` | M7 |
| 39 | Invoices | Custom send dialog instead of SendMessageDialog | `invoices/[id]/page.tsx:399-416` | M7 |
| 40 | Invoices | Download PDF button is placeholder | `invoices/page.tsx:229` | M7 |
| 41 | Invoices PDF | Missing branded header, QR, bank details, amount in words | `invoices/[id]/page.tsx:93-194` | M7 |
| 42 | Itineraries | Lead picker uses custom dropdown, not Combobox | `itineraries/new/page.tsx` | M6 |
| 43 | Rate Cards | No infinite scroll, no FilterBar, delete not wired | `rate-cards/page.tsx` | M6 |
| 44 | Rate Cards | Supplier picker is plain `<Select>` | `rate-cards/new/page.tsx`, `[id]/edit/page.tsx` | M6 |
| 45 | Vouchers | Custom send dialog instead of SendMessageDialog | `vouchers/[id]/page.tsx` | M11 |
| 46 | Suppliers | Phone uses plain Input, not PhoneInput | `suppliers/new/page.tsx:128` | M12 |
| 47 | Suppliers | Address uses plain Input, not AddressAutocomplete | `suppliers/new/page.tsx:151-171` | M12 |
| 48 | Suppliers | Category enum mismatch with backend | `suppliers/page.tsx`, `suppliers/new/page.tsx` | M12 |
| 49 | Suppliers | Fields collected but not sent to API | `suppliers/new/page.tsx:57-68` | M12 |
| 50 | Travellers | Edit form not pre-filled with existing data | `travellers/[id]/page.tsx:45` | M13 |
| 51 | Travellers | Delete not implemented | `travellers/page.tsx:143` | M13 |
| 52 | Visa Create | Default status hardcoded to 'applied' (should be 'not_started') | `visa/new/page.tsx:66` | M13 |
| 53 | Visa Create | Raw Input for traveller and destination country | `visa/new/page.tsx` | M13 |
| 54 | Tasks | Create form missing assignedTo, category, leadId fields | `tasks/page.tsx:531-571` | M14 |
| 55 | Tasks | No dedicated detail page — only inline Sheet panel | `tasks/page.tsx:197-278` | M14 |
| 56 | Tasks | Task status enum mismatch (pending/completed vs todo/done) | `desktop/src/lib/api/tasks.ts:10` | M14 |
| 57 | Calendar | Only 4 event types instead of 7 | `calendar/page.tsx:27-47` | M14 |
| 58 | Calendar | Create form missing location, recurrence, all_day, color, lead | `calendar/page.tsx:380-428` | M14 |
| 59 | Calendar | No event editing — can only create and delete | `calendar/page.tsx` | M14 |
| 60 | Communication | Contact info is hardcoded mock data | `communication/[contactId]/page.tsx:79-83` | M8 |
| 61 | Communication | API contracts mismatch (Send, Template, Document, Bulk) | `desktop/src/lib/api/communications.ts` | M8 |
| 62 | Compose Page | Raw email input, no contact Combobox | `communication/compose/page.tsx:92` | M9 |
| 63 | Compose Page | Attachment upload simulated (fake toast) | `communication/compose/page.tsx:130-134` | M9 |
| 64 | Campaign Detail | Mock recipients (hardcoded 8 entries) | `campaigns/[id]/page.tsx` | M9 |
| 65 | Notifications | No deep linking — click only marks read | `notifications/page.tsx:50-52` | M10 |
| 66 | Notifications | Missing notification types alignment with backend | `settings/notifications/page.tsx:90-97` | M10 |
| 67 | Import Wizard | Hardcoded sample data for column mapping and preview | `import/page.tsx:39-47` | M16 |
| 68 | Fleet Vehicles | Edit button not linked, Deactivate is placeholder | `fleet/vehicles/[id]/page.tsx:83-84` | M18 |
| 69 | Fleet Vehicles | Missing Documents, Maintenance, Availability tabs | `fleet/vehicles/[id]/page.tsx:88-93` | M18 |
| 70 | Fleet Drivers | Documents tab is empty | `fleet/drivers/[id]/page.tsx:106` | M18 |
| 71 | Fleet Drivers | License badge always "valid" regardless of expiry | `fleet/drivers/page.tsx:58-61` | M18 |
| 72 | Fleet Trips | Vehicle/Driver selects not searchable Combobox | `fleet/trips/new/page.tsx:137-159` | M18 |
| 73 | Fleet Trips | Missing passenger, lead, special instructions fields | `fleet/trips/new/page.tsx:31-41` | M18 |
| 74 | Fleet Alerts | Only tracks driver license — missing vehicle docs and maintenance | `fleet/alerts/page.tsx:74-83` | M18 |
| 75 | Fleet Rate Cards | `@ts-ignore` comments rendered as visible text in JSX | `fleet/rate-cards/new/page.tsx` | M18 |
| 76 | Fleet Dashboard | 3 API calls instead of dashboard endpoint; wrong sort order | `fleet/page.tsx:52-64,90` | M18 |
| 77 | Marketing Flyers | Not a true canvas editor — no drag-and-drop, resize, layers | `marketing/flyers/page.tsx` | M17 |
| 78 | Marketing Campaigns | No infinite scroll, skeletons, FilterBar on list/recipients | `marketing/campaigns/page.tsx`, `campaigns/[id]/page.tsx` | M17 |
| 79 | Debit Notes | Imports `CreditNote` type instead of `DebitNote` | `debit-notes/page.tsx:15` | M13 |

---

## P2 — Nice to have (polish, animations, shortcuts)

| # | Area | Issue | Milestone |
|---|------|-------|-----------|
| 80 | All List Pages | Add detail drawer for quick preview | All |
| 81 | All List Pages | Add hover action icons (Eye, Edit, Trash) | All |
| 82 | All List Pages | Add empty state with illustration and CTA | All |
| 83 | All List Pages | Add keyboard shortcuts (Ctrl+N, /, Enter) | All |
| 84 | All List Pages | Add bulk selection + operations | All |
| 85 | All Form Pages | Add unsaved changes confirmation on navigate away | All |
| 86 | All Report Pages | Add period comparison toggle with % change arrows | M15 |
| 87 | All Report Pages | Add custom date range picker | M15 |
| 88 | All Report Pages | Add loading skeletons for charts/tables | M15 |
| 89 | Reports Hub | Add search, favorites/pinned, recently viewed | M15 |
| 90 | Reports | Create shared `ReportPageTemplate` to reduce duplication | M15 |
| 91 | Reports | Create shared `ReportDataTable` with sort/pagination | M15 |
| 92 | Calendar | Add week/day views with hourly timeline | M14 |
| 93 | Calendar | Add drag-and-drop rescheduling | M14 |
| 94 | Calendar | Add team/my calendar toggle | M14 |
| 95 | Calendar | Add "Today" button | M14 |
| 96 | Tasks | Add list view alongside Kanban | M14 |
| 97 | Tasks | Add subtask progress bars on task cards | M14 |
| 98 | Tasks | Add comments thread with user avatars | M14 |
| 99 | Tasks | Add overdue red background tint + badge | M14 |
| 100 | Itineraries | Auto-save draft every 30 seconds | M6 |
| 101 | Itineraries | Real-time pricing engine (group/child discounts) | M6 |
| 102 | Invoices | Auto-populate from URL params (?leadId, ?contactId) | M7 |
| 103 | Invoices | Invoice type selector (Tax/Proforma) | M7 |
| 104 | Invoices | Bank details section from settings | M7 |
| 105 | Communication | Rich HTML editor for email compose | M9 |
| 106 | Communication | Draft auto-save | M9 |
| 107 | Communication | Keyboard shortcuts (Ctrl+Enter to send) | M8 |
| 108 | Notifications | Real-time polling / WebSocket for badge updates | M10 |
| 109 | Notifications | Notification dropdown from bell icon | M10 |
| 110 | Suppliers | Interactive star rating widget | M12 |
| 111 | Suppliers | Reconciliation checkboxes and tools | M12 |
| 112 | Visa | Kanban view for applications | M13 |
| 113 | Visa | Status pipeline stepper widget | M13 |
| 114 | Marketing | Template gallery categories and filters | M17 |
| 115 | Marketing | "My Flyers" gallery | M17 |
| 116 | Marketing | Real-time segment contact count preview | M17 |
| 117 | Fleet | Vehicle type filter chips | M18 |
| 118 | Fleet | Availability-aware vehicle/driver selection | M18 |
| 119 | Fleet | Drag-and-drop trip status transitions in Kanban | M18 |
| 120 | Sidebar | Dynamic badges on Leads, Tasks, Invoices items | M10 |
