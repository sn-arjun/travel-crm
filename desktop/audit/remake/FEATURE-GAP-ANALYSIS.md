# TravelCRM Pro — Feature Gap Analysis (Remake Phase 0)

Generated: 2026-08-06T23:18:27.103Z
Source of truth: `backend/src/index.ts` → the `routeMounts` array (57 mounts) plus the pre-auth mounts.

---

## Biggest surprises

1. **266 of 562 endpoints (47.3%) have no API client function at all.** The backend is roughly twice the size of the UI that reaches it. This is the dominant fact of the remake.

2. **`whatsapp-campaigns` is a complete, feature-gated, 10-endpoint product with zero frontend.** No page, no client module, no sidebar entry, no spec. Full CRUD plus send / pause / cancel / recipients / analytics — all built, all unreachable.

3. **`ai/extractions` is a 9-endpoint human-in-the-loop review queue with zero frontend.** It even exposes `GET /ai/extractions/pending-count`, an endpoint that exists solely to drive a sidebar badge that was never built.

4. **All 10 `super-admin/*` pages are dead.** They call `API_ENDPOINTS.admin.*` — `/admin/tenants`, `/admin/plans`, `/admin/billing`, `/admin/system`, `/admin/config`, `/admin/audit-logs`. **None of these routes exist in `backend/src/index.ts`.** Every one 404s. The real super-admin is the standalone `super-admin/` Next.js app.

5. **`/accounts` is sidebar-linked but is a re-skin of `suppliersApi.list`.** There is no accounts backend and no accounts model. It reads as a finished CRM feature and is a facade.

6. **Mock data survives in exactly two components, both in Fleet** — `availability-picker.tsx` and `driver-schedule-calendar.tsx` import `@/lib/fleet-mock-data`, while the real `GET /fleet/vehicles/availability` and `GET /fleet/drivers/schedule` endpoints sit unused.

7. **Every route is mounted twice** (`/api/v1/<path>` and `/api/<path>`), and `follow-ups`/`followups` plus `message-templates`/`templates` are each mounted under two names. This inventory canonicalises on `/api/v1/` and the primary alias.

8. **The AI surface is 79 endpoints across five gates** (`ai_assistant`, `ai_extraction`, `ai_intelligence`, `ai_chatbot`, plus the `ai_actions_per_day` usage cap) — larger than Contacts, Leads, Invoices and Itineraries combined.

---

## Totals

| Classification | Count | Share | Meaning |
|---|---|---|---|
| `wired` | 228 | 40.6% | client fn + reachable UI + a spec exists for the slice |
| `client-only` | 38 | 6.8% | client fn exists, no UI reaches it |
| `orphaned` | 266 | 47.3% | no API client function at all |
| `mocked` | 10 | 1.8% | UI exists but reads mock data instead of the API |
| `stale` | 20 | 3.6% | client references a backend endpoint that does not exist |
| **Total** | **562** | | 543 real backend registrations + 19 phantom `/admin/*` references |

### Feature gates in play

| Gate | Guards | Endpoints |
|---|---|---|
| `voip_calling` | `/voip/*`, `/calls/*` | 29 |
| `ai_extraction` | `/ai/extractions/*` | 9 |
| `ai_intelligence` | `/ai/intelligence/*` | 27 |
| `ai_chatbot` | `/chatbot/*` | 13 |
| `whatsapp_campaigns` | `/whatsapp-campaigns/*` | 10 |
| `ai_assistant` (+ `ai_actions_per_day` cap) | `/ai/*` | 43 |

Every gated slice must degrade to a disabled or upsell state — never crash — when the gate is off or the provider is unconfigured.

### Infrastructure not in `routeMounts`

- **WebSocket:** `GET /api/v1/ws` → the `RealtimeRoom` Durable Object, keyed by tenant. Consumed by `realtime-store.ts`.
- **Cron (`scheduled()`):** follow-up reminders, birthday & anniversary, invoice reminders, visa & passport expiry, missing visa documents, trip reminders, overdue tasks, fleet alerts, campaign scheduler, and daily / monthly usage-cap resets.
- **Queue (`queue()`):** import and export job processing.
- **Pre-auth mounts:** `webhooks`, lead-capture `webhook`, `voip` callbacks, `test`, `driver`, `public`.

---

## Slices (50)

| # | Slice | Status | Endpoints | Gates | Pages | New pages | Target spec |
|---|---|---|---|---|---|---|---|
| 1 | `auth-shell` | existing | 25 | — | 7 | 1 | `desktop/e2e/auth-shell.spec.ts` |
| 2 | `dashboard` | existing | 10 | — | 3 | 0 | `desktop/e2e/dashboard.spec.ts` |
| 3 | `contacts` | existing | 21 | — | 6 | 1 | `desktop/e2e/contacts.spec.ts` |
| 4 | `leads` | existing | 19 | — | 4 | 1 | `desktop/e2e/leads.spec.ts` |
| 5 | `accounts` | existing | 1 | — | 1 | 0 | `desktop/e2e/accounts.spec.ts` |
| 6 | `itineraries` | existing | 12 | — | 5 | 0 | `desktop/e2e/itineraries.spec.ts` |
| 7 | `itinerary-templates` | existing | 6 | — | 1 | 0 | `desktop/e2e/itinerary-templates.spec.ts` |
| 8 | `rate-cards` | existing | 6 | — | 3 | 0 | `desktop/e2e/rate-cards.spec.ts` |
| 9 | `suppliers` | existing | 13 | — | 5 | 0 | `desktop/e2e/suppliers.spec.ts` |
| 10 | `invoices` | existing | 11 | — | 4 | 0 | `desktop/e2e/invoices.spec.ts` |
| 11 | `payments` | existing | 5 | — | 2 | 1 | `desktop/e2e/payments.spec.ts` |
| 12 | `credit-debit-notes` | existing | 6 | — | 2 | 2 | `desktop/e2e/credit-debit-notes.spec.ts` |
| 13 | `vouchers` | existing | 11 | — | 4 | 0 | `desktop/e2e/vouchers.spec.ts` |
| 14 | `travellers` | existing | 7 | — | 3 | 1 | `desktop/e2e/travellers.spec.ts` |
| 15 | `visa` | existing | 14 | — | 4 | 0 | `desktop/e2e/visa.spec.ts` |
| 16 | `fleet-vehicles` | existing | 20 | — | 4 | 0 | `desktop/e2e/fleet-vehicles.spec.ts` |
| 17 | `fleet-drivers` | existing | 15 | — | 4 | 0 | `desktop/e2e/fleet-drivers.spec.ts` |
| 18 | `fleet-trips` | existing | 15 | — | 4 | 0 | `desktop/e2e/fleet-trips.spec.ts` |
| 19 | `fleet-rate-cards` | existing | 7 | — | 2 | 1 | `desktop/e2e/fleet-rate-cards.spec.ts` |
| 20 | `fleet-dashboard` | existing | 1 | — | 2 | 0 | `desktop/e2e/fleet-dashboard.spec.ts` |
| 21 | `tasks` | existing | 13 | — | 2 | 0 | `desktop/e2e/tasks.spec.ts` |
| 22 | `calendar` | existing | 6 | — | 1 | 0 | `desktop/e2e/calendar.spec.ts` |
| 23 | `follow-ups` | existing | 5 | — | 1 | 0 | `desktop/e2e/follow-ups.spec.ts` |
| 24 | `documents` | existing | 6 | — | 1 | 0 | `desktop/e2e/documents.spec.ts` |
| 25 | `communication-inbox` | existing | 7 | — | 4 | 0 | `desktop/e2e/communication-inbox.spec.ts` |
| 26 | `message-templates` | existing | 5 | — | 3 | 0 | `desktop/e2e/message-templates.spec.ts` |
| 27 | `calls` | existing | 14 | voip_calling | 5 | 0 | `desktop/e2e/calls.spec.ts` |
| 28 | `voip-settings` | existing | 18 | voip_calling | 2 | 0 | `desktop/e2e/voip-settings.spec.ts` |
| 29 | `chatbot` | existing | 13 | ai_chatbot | 4 | 0 | `desktop/e2e/chatbot.spec.ts` |
| 30 | `campaigns` | existing | 9 | — | 3 | 0 | `desktop/e2e/campaigns.spec.ts` |
| 31 | `marketing-campaigns` | existing | 9 | — | 2 | 2 | `desktop/e2e/marketing-campaigns.spec.ts` |
| 32 | `marketing-segments` | existing | 7 | — | 3 | 0 | `desktop/e2e/marketing-segments.spec.ts` |
| 33 | `marketing-flyers` | existing | 19 | — | 2 | 1 | `desktop/e2e/marketing-flyers.spec.ts` |
| 34 | `marketing-social` | existing | 10 | ai_assistant | 2 | 0 | `desktop/e2e/marketing-social.spec.ts` |
| 35 | `marketing-opt-out` | existing | 3 | — | 1 | 0 | `desktop/e2e/marketing-opt-out.spec.ts` |
| 36 | `whatsapp-campaigns` | new | 10 | whatsapp_campaigns | 0 | 3 | `desktop/e2e/whatsapp-campaigns.spec.ts` |
| 37 | `ai-assistant` | existing | 18 | ai_assistant | 5 | 0 | `desktop/e2e/ai-assistant.spec.ts` |
| 38 | `ai-extractions` | new | 9 | ai_extraction | 0 | 2 | `desktop/e2e/ai-extractions.spec.ts` |
| 39 | `ai-intelligence` | existing | 27 | ai_intelligence | 5 | 1 | `desktop/e2e/ai-intelligence.spec.ts` |
| 40 | `ai-business-intelligence` | existing | 20 | ai_assistant | 6 | 1 | `desktop/e2e/ai-business-intelligence.spec.ts` |
| 41 | `ai-settings` | existing | 5 | ai_assistant | 2 | 0 | `desktop/e2e/ai-settings.spec.ts` |
| 42 | `reports` | existing | 7 | — | 12 | 0 | `desktop/e2e/reports.spec.ts` |
| 43 | `import-export` | existing | 14 | — | 3 | 0 | `desktop/e2e/import-export.spec.ts` |
| 44 | `notifications` | existing | 14 | — | 3 | 0 | `desktop/e2e/notifications.spec.ts` |
| 45 | `settings-company` | existing | 17 | — | 5 | 3 | `desktop/e2e/settings-company.spec.ts` |
| 46 | `settings-team` | existing | 11 | — | 5 | 0 | `desktop/e2e/settings-team.spec.ts` |
| 47 | `super-admin` | existing | 19 | — | 10 | 0 | `desktop/e2e/super-admin.spec.ts` |
| 48 | `webhooks-integrations` | new | 3 | — | 0 | 1 | `desktop/e2e/webhooks-integrations.spec.ts` |
| 49 | `driver-app-api` | existing | 18 | — | 0 | 0 | `desktop/e2e/driver-app-api.spec.ts` |
| 50 | `test-harness` | existing | 1 | — | 0 | 0 | `desktop/e2e/test-harness.spec.ts` |

---

## `orphaned` — 266 endpoints with no API client

These are the build targets. This project has decided to build UI for all of them.

| Endpoint | Slice | Gate | Kind |
|---|---|---|---|
| `DELETE /api/v1/ai/conversations/:id` | ai-assistant | ai_assistant | delete |
| `GET /api/v1/ai/conversations/:id` | ai-assistant | ai_assistant | read |
| `POST /api/v1/ai/enrich-itinerary` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/generate-invoice` | ai-assistant | ai_assistant | action |
| `GET /api/v1/ai/generated` | ai-assistant | ai_assistant | list |
| `GET /api/v1/ai/generated/:id` | ai-assistant | ai_assistant | read |
| `POST /api/v1/ai/generated/:id/accept` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/generated/:id/feedback` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/generated/:id/reject` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/parse-bulk-leads` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/parse-email` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/parse-whatsapp` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/scan-business-card` | ai-assistant | ai_assistant | action |
| `GET /api/v1/ai/bi/briefings/:id` | ai-business-intelligence | ai_assistant | read |
| `POST /api/v1/ai/bi/briefings/generate` | ai-business-intelligence | ai_assistant | action |
| `POST /api/v1/ai/bi/customer-ltv/:contactId` | ai-business-intelligence | ai_assistant | action |
| `GET /api/v1/ai/bi/customer-segments` | ai-business-intelligence | ai_assistant | list |
| `POST /api/v1/ai/bi/customer-segments/calculate` | ai-business-intelligence | ai_assistant | action |
| `POST /api/v1/ai/bi/health-score/calculate` | ai-business-intelligence | ai_assistant | action |
| `GET /api/v1/ai/bi/health-score/history` | ai-business-intelligence | ai_assistant | list |
| `POST /api/v1/ai/bi/recommendations/generate` | ai-business-intelligence | ai_assistant | action |
| `GET /api/v1/ai/bi/usage` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/workload-analysis` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/extractions` | ai-extractions | ai_extraction | list |
| `GET /api/v1/ai/extractions/:id` | ai-extractions | ai_extraction | read |
| `POST /api/v1/ai/extractions/:id/confirm` | ai-extractions | ai_extraction | action |
| `POST /api/v1/ai/extractions/:id/create-invoice` | ai-extractions | ai_extraction | action |
| `POST /api/v1/ai/extractions/:id/create-itinerary` | ai-extractions | ai_extraction | action |
| `POST /api/v1/ai/extractions/:id/reject` | ai-extractions | ai_extraction | action |
| `POST /api/v1/ai/extractions/:id/schedule-followup` | ai-extractions | ai_extraction | action |
| `GET /api/v1/ai/extractions/pending-count` | ai-extractions | ai_extraction | list |
| `GET /api/v1/ai/extractions/usage/summary` | ai-extractions | ai_extraction | list |
| `GET /api/v1/ai/intelligence/document-scans` | ai-intelligence | ai_intelligence | list |
| `GET /api/v1/ai/intelligence/document-scans/:id` | ai-intelligence | ai_intelligence | read |
| `POST /api/v1/ai/intelligence/document-scans/:id/apply` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/document-scans/:id/reject` | ai-intelligence | ai_intelligence | action |
| `GET /api/v1/ai/intelligence/insights/:id` | ai-intelligence | ai_intelligence | read |
| `POST /api/v1/ai/intelligence/insights/:id/action` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/insights/:id/dismiss` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/insights/customer/:contactId` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/insights/predictions` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/insights/trends` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/lead-score/:leadId` | ai-intelligence | ai_intelligence | action |
| `GET /api/v1/ai/intelligence/lead-score/:leadId/history` | ai-intelligence | ai_intelligence | list |
| `POST /api/v1/ai/intelligence/lead-scores/bulk` | ai-intelligence | ai_intelligence | action |
| `GET /api/v1/ai/intelligence/nl-queries` | ai-intelligence | ai_intelligence | list |
| `POST /api/v1/ai/intelligence/recommendations/:id/act` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/recommendations/:id/dismiss` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/smart-followup/:leadId` | ai-intelligence | ai_intelligence | action |
| `GET /api/v1/ai/intelligence/smart-followups` | ai-intelligence | ai_intelligence | list |
| `POST /api/v1/ai/intelligence/smart-followups/:id/dismiss` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/smart-followups/:id/send` | ai-intelligence | ai_intelligence | action |
| `DELETE /api/v1/auth/sessions` | auth-shell | — | delete |
| `DELETE /api/v1/auth/sessions/:id` | auth-shell | — | delete |
| `POST /api/v1/auth/setup-account` | auth-shell | — | action |
| `GET /api/v1/exchange-rates` | auth-shell | — | list |
| `DELETE /api/v1/files/*` | auth-shell | — | delete |
| `GET /api/v1/files/*` | auth-shell | — | read |
| `POST /api/v1/files/upload` | auth-shell | — | action |
| `GET /api/v1/public/quotation/:token` | auth-shell | — | read |
| `PUT /api/v1/users/me` | auth-shell | — | update |
| `POST /api/v1/users/me/avatar` | auth-shell | — | action |
| `GET /api/v1/users/me/login-history` | auth-shell | — | list |
| `GET /api/v1/users/me/signature` | auth-shell | — | list |
| `PUT /api/v1/users/me/signature` | auth-shell | — | update |
| `DELETE /api/v1/calls/:id` | calls | voip_calling | delete |
| `PUT /api/v1/calls/:id` | calls | voip_calling | update |
| `GET /api/v1/calls/:id/actions` | calls | voip_calling | list |
| `POST /api/v1/calls/:id/end` | calls | voip_calling | action |
| `POST /api/v1/calls/:id/transfer` | calls | voip_calling | action |
| `POST /api/v1/calls/missed/:id/mark-returned` | calls | voip_calling | action |
| `GET /api/v1/transcripts/:callLogId` | calls | — | read |
| `PUT /api/v1/transcripts/:callLogId` | calls | — | update |
| `POST /api/v1/chatbot/conversations/:id/close` | chatbot | ai_chatbot | action |
| `POST /api/v1/chatbot/conversations/:id/create-lead` | chatbot | ai_chatbot | action |
| `POST /api/v1/chatbot/webhook/:channel` | chatbot | ai_chatbot | action |
| `POST /api/v1/chatbot/whatsapp/incoming` | chatbot | ai_chatbot | action |
| `GET /api/v1/chatbot/widget.js` | chatbot | ai_chatbot | list |
| `GET /api/v1/communications/bulk-send/:batchId/status` | communication-inbox | — | list |
| `POST /api/v1/contacts/bulk-tag` | contacts | — | action |
| `POST /api/v1/contacts/custom-fields` | contacts | — | action |
| `DELETE /api/v1/contacts/custom-fields/:id` | contacts | — | delete |
| `PUT /api/v1/contacts/custom-fields/:id` | contacts | — | update |
| `POST /api/v1/contacts/import` | contacts | — | action |
| `POST /api/v1/contacts/merge/preview` | contacts | — | action |
| `GET /api/v1/contacts/shared-with-me` | contacts | — | list |
| `GET /api/v1/bookmarks/check` | dashboard | — | list |
| `GET /api/v1/reports/dashboard` | dashboard | — | list |
| `POST /api/v1/driver/login` | driver-app-api | — | action |
| `POST /api/v1/driver/login/verify` | driver-app-api | — | action |
| `POST /api/v1/driver/logout` | driver-app-api | — | action |
| `GET /api/v1/driver/profile` | driver-app-api | — | list |
| `PUT /api/v1/driver/profile` | driver-app-api | — | update |
| `GET /api/v1/driver/profile/documents` | driver-app-api | — | list |
| `POST /api/v1/driver/profile/documents` | driver-app-api | — | action |
| `POST /api/v1/driver/profile/photo` | driver-app-api | — | action |
| `POST /api/v1/driver/push-tokens` | driver-app-api | — | action |
| `DELETE /api/v1/driver/push-tokens/:token` | driver-app-api | — | delete |
| `POST /api/v1/driver/refresh` | driver-app-api | — | action |
| `GET /api/v1/driver/trips` | driver-app-api | — | list |
| `GET /api/v1/driver/trips/:id` | driver-app-api | — | read |
| `POST /api/v1/driver/trips/:id/accept` | driver-app-api | — | action |
| `POST /api/v1/driver/trips/:id/check-in` | driver-app-api | — | action |
| `POST /api/v1/driver/trips/:id/check-out` | driver-app-api | — | action |
| `POST /api/v1/driver/trips/:id/reject` | driver-app-api | — | action |
| `POST /api/v1/driver/trips/:id/status` | driver-app-api | — | action |
| `GET /api/v1/fleet/dashboard` | fleet-dashboard | — | list |
| `GET /api/v1/fleet/documents/drivers/expiring` | fleet-drivers | — | list |
| `DELETE /api/v1/fleet/drivers/:driverId/documents/:docId` | fleet-drivers | — | delete |
| `GET /api/v1/fleet/drivers/:driverId/documents/:docId/download` | fleet-drivers | — | list |
| `GET /api/v1/fleet/drivers/:id/documents` | fleet-drivers | — | list |
| `POST /api/v1/fleet/drivers/:id/documents` | fleet-drivers | — | action |
| `POST /api/v1/fleet/drivers/:id/rate` | fleet-drivers | — | action |
| `PUT /api/v1/fleet/drivers/:id/status` | fleet-drivers | — | update |
| `GET /api/v1/fleet/drivers/:id/trips` | fleet-drivers | — | list |
| `GET /api/v1/fleet/vehicle-rate-cards` | fleet-rate-cards | — | list |
| `POST /api/v1/fleet/vehicle-rate-cards` | fleet-rate-cards | — | action |
| `DELETE /api/v1/fleet/vehicle-rate-cards/:id` | fleet-rate-cards | — | delete |
| `GET /api/v1/fleet/vehicle-rate-cards/:id` | fleet-rate-cards | — | read |
| `PUT /api/v1/fleet/vehicle-rate-cards/:id` | fleet-rate-cards | — | update |
| `POST /api/v1/fleet/vehicle-rate-cards/estimate` | fleet-rate-cards | — | action |
| `GET /api/v1/fleet/vehicle-rate-cards/lookup` | fleet-rate-cards | — | list |
| `POST /api/v1/fleet/calculate-distance` | fleet-trips | — | action |
| `GET /api/v1/fleet/costs/report` | fleet-trips | — | list |
| `GET /api/v1/fleet/trips/:id/costs` | fleet-trips | — | list |
| `POST /api/v1/fleet/trips/:id/costs` | fleet-trips | — | action |
| `GET /api/v1/fleet/trips/:id/costs/summary` | fleet-trips | — | list |
| `POST /api/v1/fleet/trips/:id/generate-invoice` | fleet-trips | — | action |
| `POST /api/v1/fleet/trips/:id/generate-voucher` | fleet-trips | — | action |
| `PUT /api/v1/fleet/trips/:id/status` | fleet-trips | — | update |
| `GET /api/v1/fleet/trips/:id/timeline` | fleet-trips | — | list |
| `DELETE /api/v1/fleet/trips/:tripId/costs/:costId` | fleet-trips | — | delete |
| `GET /api/v1/fleet/documents/expiring` | fleet-vehicles | — | list |
| `GET /api/v1/fleet/maintenance/due` | fleet-vehicles | — | list |
| `GET /api/v1/fleet/vehicles/:id/documents` | fleet-vehicles | — | list |
| `POST /api/v1/fleet/vehicles/:id/documents` | fleet-vehicles | — | action |
| `GET /api/v1/fleet/vehicles/:id/maintenance` | fleet-vehicles | — | list |
| `POST /api/v1/fleet/vehicles/:id/maintenance` | fleet-vehicles | — | action |
| `PUT /api/v1/fleet/vehicles/:id/odometer` | fleet-vehicles | — | update |
| `GET /api/v1/fleet/vehicles/:id/photo` | fleet-vehicles | — | list |
| `POST /api/v1/fleet/vehicles/:id/photo` | fleet-vehicles | — | action |
| `PUT /api/v1/fleet/vehicles/:id/status` | fleet-vehicles | — | update |
| `GET /api/v1/fleet/vehicles/:id/trips` | fleet-vehicles | — | list |
| `DELETE /api/v1/fleet/vehicles/:vehicleId/documents/:docId` | fleet-vehicles | — | delete |
| `GET /api/v1/fleet/vehicles/:vehicleId/documents/:docId/download` | fleet-vehicles | — | list |
| `GET /api/v1/itineraries/:id/pdf` | itineraries | — | list |
| `GET /api/v1/itinerary-templates` | itinerary-templates | — | list |
| `POST /api/v1/itinerary-templates` | itinerary-templates | — | create |
| `DELETE /api/v1/itinerary-templates/:id` | itinerary-templates | — | delete |
| `GET /api/v1/itinerary-templates/:id` | itinerary-templates | — | read |
| `POST /api/v1/itinerary-templates/create-from` | itinerary-templates | — | action |
| `POST /api/v1/itinerary-templates/from-itinerary` | itinerary-templates | — | action |
| `POST /api/v1/leads/:id/activities` | leads | — | action |
| `DELETE /api/v1/leads/:id/notes/:noteId` | leads | — | delete |
| `PUT /api/v1/leads/:id/notes/:noteId` | leads | — | update |
| `GET /api/v1/marketing/campaigns` | marketing-campaigns | — | list |
| `POST /api/v1/marketing/campaigns` | marketing-campaigns | — | create |
| `DELETE /api/v1/marketing/campaigns/:id` | marketing-campaigns | — | delete |
| `GET /api/v1/marketing/campaigns/:id` | marketing-campaigns | — | read |
| `PUT /api/v1/marketing/campaigns/:id` | marketing-campaigns | — | update |
| `GET /api/v1/marketing/campaigns/:id/analytics` | marketing-campaigns | — | list |
| `POST /api/v1/marketing/campaigns/:id/cancel` | marketing-campaigns | — | action |
| `GET /api/v1/marketing/campaigns/:id/recipients` | marketing-campaigns | — | list |
| `POST /api/v1/marketing/campaigns/:id/send` | marketing-campaigns | — | action |
| `POST /api/v1/marketing/flyer-templates` | marketing-flyers | — | create |
| `DELETE /api/v1/marketing/flyer-templates/:id` | marketing-flyers | — | delete |
| `GET /api/v1/marketing/flyer-templates/:id` | marketing-flyers | — | read |
| `PUT /api/v1/marketing/flyer-templates/:id` | marketing-flyers | — | update |
| `POST /api/v1/marketing/flyer-templates/:id/assets` | marketing-flyers | — | action |
| `DELETE /api/v1/marketing/flyer-templates/:templateId/assets/:assetId` | marketing-flyers | — | delete |
| `DELETE /api/v1/marketing/flyers/:id` | marketing-flyers | — | delete |
| `GET /api/v1/marketing/flyers/:id` | marketing-flyers | — | read |
| `POST /api/v1/marketing/flyers/:id/upload` | marketing-flyers | — | action |
| `POST /api/v1/marketing/flyers/share` | marketing-flyers | — | action |
| `DELETE /api/v1/marketing/images/:id` | marketing-flyers | — | delete |
| `POST /api/v1/marketing/images/upload` | marketing-flyers | — | action |
| `POST /api/v1/marketing/images/upload-logo` | marketing-flyers | — | action |
| `GET /api/v1/marketing/opt-out` | marketing-opt-out | — | list |
| `POST /api/v1/marketing/opt-out/:contactId` | marketing-opt-out | — | action |
| `POST /api/v1/marketing/opt-out/:contactId/opt-in` | marketing-opt-out | — | action |
| `DELETE /api/v1/marketing/segments/:id` | marketing-segments | — | delete |
| `GET /api/v1/marketing/segments/:id` | marketing-segments | — | read |
| `PUT /api/v1/marketing/segments/:id` | marketing-segments | — | update |
| `GET /api/v1/marketing/segments/:id/contacts` | marketing-segments | — | list |
| `POST /api/v1/marketing/segments/:id/refresh-count` | marketing-segments | — | action |
| `DELETE /api/v1/marketing/social-content/:id` | marketing-social | — | delete |
| `GET /api/v1/marketing/social-content/:id` | marketing-social | — | read |
| `PUT /api/v1/marketing/social-content/:id` | marketing-social | — | update |
| `POST /api/v1/marketing/social-content/generate` | marketing-social | — | action |
| `POST /api/v1/marketing/social-content/generate-batch` | marketing-social | — | action |
| `GET /api/v1/marketing/suggestions` | marketing-social | — | list |
| `PUT /api/v1/marketing/suggestions/:id/accept` | marketing-social | — | update |
| `PUT /api/v1/marketing/suggestions/:id/dismiss` | marketing-social | — | update |
| `POST /api/v1/marketing/suggestions/generate` | marketing-social | — | action |
| `GET /api/v1/message-templates` | message-templates | — | list |
| `POST /api/v1/message-templates` | message-templates | — | create |
| `DELETE /api/v1/message-templates/:id` | message-templates | — | delete |
| `GET /api/v1/message-templates/:id` | message-templates | — | read |
| `PUT /api/v1/message-templates/:id` | message-templates | — | update |
| `GET /api/v1/notification-preferences/me` | notifications | — | list |
| `PUT /api/v1/notification-preferences/me` | notifications | — | update |
| `GET /api/v1/notification-preferences/me/quiet-hours` | notifications | — | list |
| `PUT /api/v1/notification-preferences/me/quiet-hours` | notifications | — | update |
| `GET /api/v1/push-tokens` | notifications | — | list |
| `POST /api/v1/push-tokens` | notifications | — | create |
| `DELETE /api/v1/push-tokens/:token` | notifications | — | delete |
| `DELETE /api/v1/push-tokens/token/:fcmToken` | notifications | — | delete |
| `GET /api/v1/rate-cards` | rate-cards | — | list |
| `POST /api/v1/rate-cards` | rate-cards | — | create |
| `DELETE /api/v1/rate-cards/:id` | rate-cards | — | delete |
| `GET /api/v1/rate-cards/:id` | rate-cards | — | read |
| `PUT /api/v1/rate-cards/:id` | rate-cards | — | update |
| `GET /api/v1/rate-cards/lookup` | rate-cards | — | list |
| `DELETE /api/v1/reports/:id/cache` | reports | — | delete |
| `DELETE /api/v1/reports/cache` | reports | — | delete |
| `DELETE /api/v1/settings/follow-up-sequences/:id` | settings-company | — | delete |
| `PUT /api/v1/settings/follow-up-sequences/:id` | settings-company | — | update |
| `GET /api/v1/settings/itinerary-defaults` | settings-company | — | list |
| `PUT /api/v1/settings/itinerary-defaults` | settings-company | — | update |
| `GET /api/v1/activity-logs` | settings-team | — | list |
| `GET /api/v1/activity-logs/entity/:type/:id` | settings-team | — | read |
| `GET /api/v1/activity-logs/user/:id` | settings-team | — | read |
| `POST /api/v1/users` | settings-team | — | create |
| `PUT /api/v1/users/:id/activate` | settings-team | — | update |
| `PUT /api/v1/users/:id/deactivate` | settings-team | — | update |
| `GET /api/v1/users/:id/login-history` | settings-team | — | list |
| `POST /api/v1/users/:id/unlock` | settings-team | — | action |
| `POST /api/v1/suppliers/:id/rate-cards` | suppliers | — | action |
| `DELETE /api/v1/tasks/:taskId/comments/:commentId` | tasks | — | delete |
| `PUT /api/v1/tasks/:taskId/comments/:commentId` | tasks | — | update |
| `POST /api/v1/test/reset` | test-harness | — | action |
| `PUT /api/v1/travellers/:id/link-contact` | travellers | — | update |
| `PUT /api/v1/travellers/:id/unlink-contact` | travellers | — | update |
| `PUT /api/v1/visa/:id/checklist/:itemId` | visa | — | update |
| `POST /api/v1/visa/:id/notes` | visa | — | action |
| `PUT /api/v1/visa/:id/status` | visa | — | update |
| `GET /api/v1/visa/dashboard` | visa | — | list |
| `GET /api/v1/visa/missing-documents` | visa | — | list |
| `GET /api/v1/voip/caller-info` | voip-settings | voip_calling | list |
| `DELETE /api/v1/voip/numbers/:id` | voip-settings | voip_calling | delete |
| `PUT /api/v1/voip/numbers/:id` | voip-settings | voip_calling | update |
| `POST /api/v1/voip/numbers/purchase` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/numbers/search` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/recording-callback` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/status-callback` | voip-settings | voip_calling | action |
| `GET /api/v1/voip/test-connection` | voip-settings | voip_calling | list |
| `POST /api/v1/voip/token` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/twiml/dial-status` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/twiml/inbound` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/twiml/ivr-handler` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/twiml/outbound` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/voicemail-callback` | voip-settings | voip_calling | action |
| `POST /api/v1/voip/voicemail-complete` | voip-settings | voip_calling | action |
| `POST /api/v1/leads/webhook` | webhooks-integrations | — | action |
| `POST /api/v1/webhooks/sendgrid/events` | webhooks-integrations | — | action |
| `POST /api/v1/webhooks/twilio/status` | webhooks-integrations | — | action |
| `GET /api/v1/whatsapp-campaigns` | whatsapp-campaigns | whatsapp_campaigns | list |
| `POST /api/v1/whatsapp-campaigns` | whatsapp-campaigns | whatsapp_campaigns | create |
| `DELETE /api/v1/whatsapp-campaigns/:id` | whatsapp-campaigns | whatsapp_campaigns | delete |
| `GET /api/v1/whatsapp-campaigns/:id` | whatsapp-campaigns | whatsapp_campaigns | read |
| `PUT /api/v1/whatsapp-campaigns/:id` | whatsapp-campaigns | whatsapp_campaigns | update |
| `GET /api/v1/whatsapp-campaigns/:id/analytics` | whatsapp-campaigns | whatsapp_campaigns | list |
| `POST /api/v1/whatsapp-campaigns/:id/cancel` | whatsapp-campaigns | whatsapp_campaigns | action |
| `POST /api/v1/whatsapp-campaigns/:id/pause` | whatsapp-campaigns | whatsapp_campaigns | action |
| `GET /api/v1/whatsapp-campaigns/:id/recipients` | whatsapp-campaigns | whatsapp_campaigns | list |
| `POST /api/v1/whatsapp-campaigns/:id/send` | whatsapp-campaigns | whatsapp_campaigns | action |

---

## `client-only` — 38 endpoints callable but unreachable

A client function exists; no page reaches it, or the slice has no proven coverage.

| Endpoint | Slice | Gate | Kind |
|---|---|---|---|
| `GET /api/v1/ai/bi/briefings` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/cash-flow-forecast` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/destination-profitability` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/health-score` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/lead-source-roi` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/lost-deal-analysis` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/revenue-pulse` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/seasonal-demand` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/team-performance` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/bi/trending-destinations` | ai-business-intelligence | ai_assistant | list |
| `GET /api/v1/ai/settings` | ai-settings | ai_assistant | list |
| `PUT /api/v1/ai/settings/features` | ai-settings | ai_assistant | update |
| `GET /api/v1/ai/settings/features/check/:featureKey` | ai-settings | ai_assistant | read |
| `GET /api/v1/ai/settings/provider` | ai-settings | ai_assistant | list |
| `GET /api/v1/ai/settings/usage` | ai-settings | ai_assistant | list |
| `GET /api/v1/calls` | calls | voip_calling | list |
| `GET /api/v1/calls/:id` | calls | voip_calling | read |
| `GET /api/v1/calls/analytics` | calls | voip_calling | list |
| `GET /api/v1/calls/missed` | calls | voip_calling | list |
| `POST /api/v1/calls/outbound` | calls | voip_calling | action |
| `GET /api/v1/transcripts` | calls | — | list |
| `GET /api/v1/chatbot/analytics` | chatbot | ai_chatbot | list |
| `GET /api/v1/chatbot/config` | chatbot | ai_chatbot | list |
| `GET /api/v1/chatbot/config/:channel` | chatbot | ai_chatbot | read |
| `PUT /api/v1/chatbot/config/:channel` | chatbot | ai_chatbot | update |
| `GET /api/v1/chatbot/conversations` | chatbot | ai_chatbot | list |
| `GET /api/v1/chatbot/conversations/:id` | chatbot | ai_chatbot | read |
| `POST /api/v1/chatbot/conversations/:id/handoff` | chatbot | ai_chatbot | action |
| `POST /api/v1/chatbot/conversations/:id/reply` | chatbot | ai_chatbot | action |
| `GET /api/v1/follow-ups` | follow-ups | — | list |
| `POST /api/v1/follow-ups` | follow-ups | — | create |
| `DELETE /api/v1/follow-ups/:id` | follow-ups | — | delete |
| `PUT /api/v1/follow-ups/:id` | follow-ups | — | update |
| `PUT /api/v1/follow-ups/:id/complete` | follow-ups | — | update |
| `GET /api/v1/marketing/social-content` | marketing-social | — | list |
| `GET /api/v1/voip/numbers` | voip-settings | voip_calling | list |
| `GET /api/v1/voip/settings` | voip-settings | voip_calling | list |
| `PUT /api/v1/voip/settings` | voip-settings | voip_calling | update |

---

## `mocked` — 10 endpoints shadowed by mock data

UI exists and looks finished, but reads `@/lib/mock-data` or `@/lib/fleet-mock-data` instead of the API.

| Endpoint | Slice | Gate | Kind |
|---|---|---|---|
| `GET /api/v1/campaigns/:id/recipients` | campaigns | — | list |
| `POST /api/v1/communications/bulk-send` | communication-inbox | — | action |
| `GET /api/v1/communications/history` | communication-inbox | — | list |
| `GET /api/v1/communications/log` | communication-inbox | — | list |
| `GET /api/v1/fleet/drivers/:id/schedule` | fleet-drivers | — | list |
| `GET /api/v1/fleet/drivers/schedule` | fleet-drivers | — | list |
| `GET /api/v1/fleet/trips/:id` | fleet-trips | — | read |
| `GET /api/v1/fleet/vehicles/:id/availability` | fleet-vehicles | — | list |
| `GET /api/v1/fleet/vehicles/availability` | fleet-vehicles | — | list |
| `GET /api/v1/imports/:id/progress` | import-export | — | list |

---

## `stale` — 20 client references to endpoints that do not exist

**Every one of these 404s today.** `API_ENDPOINTS.admin.*` in `desktop/src/lib/api/config.ts` describes a super-admin API this backend does not serve.

| Endpoint | Slice | Gate | Kind |
|---|---|---|---|
| `GET /api/v1/suppliers/categories/summary` | accounts | — | list |
| `GET /api/v1/admin/audit-logs` | super-admin | — | list |
| `GET /api/v1/admin/billing` | super-admin | — | list |
| `GET /api/v1/admin/billing/invoices` | super-admin | — | list |
| `GET /api/v1/admin/billing/payments` | super-admin | — | list |
| `GET /api/v1/admin/billing/revenue` | super-admin | — | list |
| `GET /api/v1/admin/billing/stats` | super-admin | — | list |
| `GET /api/v1/admin/config` | super-admin | — | list |
| `GET /api/v1/admin/dashboard` | super-admin | — | list |
| `GET /api/v1/admin/plans` | super-admin | — | list |
| `GET /api/v1/admin/plans/:p` | super-admin | — | read |
| `GET /api/v1/admin/platform/health` | super-admin | — | list |
| `GET /api/v1/admin/stats` | super-admin | — | list |
| `GET /api/v1/admin/system/health` | super-admin | — | list |
| `GET /api/v1/admin/system/logs` | super-admin | — | list |
| `GET /api/v1/admin/system/metrics` | super-admin | — | list |
| `GET /api/v1/admin/tenants` | super-admin | — | list |
| `GET /api/v1/admin/tenants/:p` | super-admin | — | read |
| `GET /api/v1/admin/users` | super-admin | — | list |
| `GET /api/v1/admin/users/:p` | super-admin | — | read |

**Disposition:** delete the `desktop/src/app/(app)/super-admin/**` pages and the `admin` block from `config.ts`, or repoint them at the standalone `super-admin/` app. The `super-admin` slice job must not build against phantom endpoints.

---

## `wired` — 228 endpoints with client, UI and slice-level coverage

<details><summary>Expand full list</summary>

| Endpoint | Slice | Gate | Kind |
|---|---|---|---|
| `POST /api/v1/ai/compose-message` | ai-assistant | ai_assistant | action |
| `GET /api/v1/ai/conversations` | ai-assistant | ai_assistant | list |
| `POST /api/v1/ai/extract-lead` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/generate-itinerary` | ai-assistant | ai_assistant | action |
| `POST /api/v1/ai/suggest-replies` | ai-assistant | ai_assistant | action |
| `GET /api/v1/ai/intelligence/insights` | ai-intelligence | ai_intelligence | list |
| `GET /api/v1/ai/intelligence/lead-score/:leadId` | ai-intelligence | ai_intelligence | read |
| `POST /api/v1/ai/intelligence/nl-query` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/ocr/passport` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/ocr/supplier-invoice` | ai-intelligence | ai_intelligence | action |
| `POST /api/v1/ai/intelligence/ocr/visa-classify` | ai-intelligence | ai_intelligence | action |
| `GET /api/v1/ai/intelligence/recommendations` | ai-intelligence | ai_intelligence | list |
| `POST /api/v1/auth/forgot-password` | auth-shell | — | action |
| `POST /api/v1/auth/login` | auth-shell | — | action |
| `POST /api/v1/auth/logout` | auth-shell | — | action |
| `POST /api/v1/auth/refresh-token` | auth-shell | — | action |
| `POST /api/v1/auth/reset-password` | auth-shell | — | action |
| `POST /api/v1/auth/resolve-tenant` | auth-shell | — | action |
| `POST /api/v1/auth/send-otp` | auth-shell | — | action |
| `GET /api/v1/auth/sessions` | auth-shell | — | list |
| `POST /api/v1/auth/verify-otp` | auth-shell | — | action |
| `GET /api/v1/hsn-codes` | auth-shell | — | list |
| `POST /api/v1/hsn-codes` | auth-shell | — | create |
| `GET /api/v1/users/me` | auth-shell | — | list |
| `GET /api/v1/events` | calendar | — | list |
| `POST /api/v1/events` | calendar | — | create |
| `DELETE /api/v1/events/:id` | calendar | — | delete |
| `GET /api/v1/events/:id` | calendar | — | read |
| `PUT /api/v1/events/:id` | calendar | — | update |
| `PATCH /api/v1/events/:id/reschedule` | calendar | — | update |
| `GET /api/v1/campaigns` | campaigns | — | list |
| `POST /api/v1/campaigns` | campaigns | — | create |
| `DELETE /api/v1/campaigns/:id` | campaigns | — | delete |
| `GET /api/v1/campaigns/:id` | campaigns | — | read |
| `PUT /api/v1/campaigns/:id` | campaigns | — | update |
| `POST /api/v1/campaigns/:id/cancel` | campaigns | — | action |
| `POST /api/v1/campaigns/:id/schedule` | campaigns | — | action |
| `POST /api/v1/campaigns/:id/send` | campaigns | — | action |
| `POST /api/v1/communications/send` | communication-inbox | — | action |
| `POST /api/v1/communications/send-document` | communication-inbox | — | action |
| `POST /api/v1/communications/send-template` | communication-inbox | — | action |
| `GET /api/v1/contacts` | contacts | — | list |
| `POST /api/v1/contacts` | contacts | — | create |
| `DELETE /api/v1/contacts/:id` | contacts | — | delete |
| `GET /api/v1/contacts/:id` | contacts | — | read |
| `PUT /api/v1/contacts/:id` | contacts | — | update |
| `POST /api/v1/contacts/:id/share` | contacts | — | action |
| `GET /api/v1/contacts/:id/timeline` | contacts | — | list |
| `POST /api/v1/contacts/check-duplicate` | contacts | — | action |
| `GET /api/v1/contacts/custom-fields` | contacts | — | list |
| `GET /api/v1/contacts/export` | contacts | — | list |
| `GET /api/v1/contacts/filter-options` | contacts | — | list |
| `POST /api/v1/contacts/merge` | contacts | — | action |
| `GET /api/v1/contacts/tags` | contacts | — | list |
| `GET /api/v1/contacts/upcoming-occasions` | contacts | — | list |
| `GET /api/v1/credit-notes` | credit-debit-notes | — | list |
| `POST /api/v1/credit-notes` | credit-debit-notes | — | create |
| `POST /api/v1/credit-notes/:id/apply` | credit-debit-notes | — | action |
| `GET /api/v1/debit-notes` | credit-debit-notes | — | list |
| `POST /api/v1/debit-notes` | credit-debit-notes | — | create |
| `POST /api/v1/debit-notes/:id/apply` | credit-debit-notes | — | action |
| `GET /api/v1/bookmarks` | dashboard | — | list |
| `POST /api/v1/bookmarks` | dashboard | — | create |
| `DELETE /api/v1/bookmarks/:id` | dashboard | — | delete |
| `GET /api/v1/notifications/badge-counts` | dashboard | — | list |
| `GET /api/v1/sticky-notes` | dashboard | — | list |
| `POST /api/v1/sticky-notes` | dashboard | — | create |
| `DELETE /api/v1/sticky-notes/:id` | dashboard | — | delete |
| `PUT /api/v1/sticky-notes/:id` | dashboard | — | update |
| `GET /api/v1/documents` | documents | — | list |
| `DELETE /api/v1/documents/:id` | documents | — | delete |
| `GET /api/v1/documents/:id` | documents | — | read |
| `PUT /api/v1/documents/:id` | documents | — | update |
| `GET /api/v1/documents/:id/download` | documents | — | list |
| `POST /api/v1/documents/upload` | documents | — | action |
| `GET /api/v1/fleet/drivers` | fleet-drivers | — | list |
| `POST /api/v1/fleet/drivers` | fleet-drivers | — | action |
| `DELETE /api/v1/fleet/drivers/:id` | fleet-drivers | — | delete |
| `GET /api/v1/fleet/drivers/:id` | fleet-drivers | — | read |
| `PUT /api/v1/fleet/drivers/:id` | fleet-drivers | — | update |
| `GET /api/v1/fleet/trips` | fleet-trips | — | list |
| `POST /api/v1/fleet/trips` | fleet-trips | — | action |
| `DELETE /api/v1/fleet/trips/:id` | fleet-trips | — | delete |
| `PUT /api/v1/fleet/trips/:id` | fleet-trips | — | update |
| `GET /api/v1/fleet/vehicles` | fleet-vehicles | — | list |
| `POST /api/v1/fleet/vehicles` | fleet-vehicles | — | action |
| `DELETE /api/v1/fleet/vehicles/:id` | fleet-vehicles | — | delete |
| `GET /api/v1/fleet/vehicles/:id` | fleet-vehicles | — | read |
| `PUT /api/v1/fleet/vehicles/:id` | fleet-vehicles | — | update |
| `GET /api/v1/exports/contacts` | import-export | — | list |
| `POST /api/v1/exports/full` | import-export | — | action |
| `POST /api/v1/exports/invoices/bulk-pdf` | import-export | — | action |
| `GET /api/v1/exports/jobs/:id` | import-export | — | read |
| `GET /api/v1/exports/jobs/:id/download` | import-export | — | list |
| `GET /api/v1/exports/leads` | import-export | — | list |
| `GET /api/v1/imports` | import-export | — | list |
| `POST /api/v1/imports/:id/cancel` | import-export | — | action |
| `GET /api/v1/imports/:id/errors` | import-export | — | list |
| `GET /api/v1/imports/:id/errors/download` | import-export | — | list |
| `POST /api/v1/imports/:id/execute` | import-export | — | action |
| `GET /api/v1/imports/templates/:type` | import-export | — | read |
| `POST /api/v1/imports/upload` | import-export | — | action |
| `GET /api/v1/invoices` | invoices | — | list |
| `POST /api/v1/invoices` | invoices | — | create |
| `DELETE /api/v1/invoices/:id` | invoices | — | delete |
| `GET /api/v1/invoices/:id` | invoices | — | read |
| `PUT /api/v1/invoices/:id` | invoices | — | update |
| `POST /api/v1/invoices/:id/duplicate` | invoices | — | action |
| `GET /api/v1/invoices/:id/payments` | invoices | — | list |
| `POST /api/v1/invoices/:id/send` | invoices | — | action |
| `POST /api/v1/invoices/:id/void` | invoices | — | action |
| `POST /api/v1/invoices/from-itinerary` | invoices | — | action |
| `GET /api/v1/invoices/summary` | invoices | — | list |
| `GET /api/v1/itineraries` | itineraries | — | list |
| `POST /api/v1/itineraries` | itineraries | — | create |
| `DELETE /api/v1/itineraries/:id` | itineraries | — | delete |
| `GET /api/v1/itineraries/:id` | itineraries | — | read |
| `PUT /api/v1/itineraries/:id` | itineraries | — | update |
| `POST /api/v1/itineraries/:id/clone` | itineraries | — | action |
| `POST /api/v1/itineraries/:id/new-version` | itineraries | — | action |
| `POST /api/v1/itineraries/:id/send` | itineraries | — | action |
| `DELETE /api/v1/itineraries/:id/share-link` | itineraries | — | delete |
| `POST /api/v1/itineraries/:id/share-link` | itineraries | — | action |
| `GET /api/v1/itineraries/:id/versions` | itineraries | — | list |
| `GET /api/v1/leads` | leads | — | list |
| `POST /api/v1/leads` | leads | — | create |
| `DELETE /api/v1/leads/:id` | leads | — | delete |
| `GET /api/v1/leads/:id` | leads | — | read |
| `PUT /api/v1/leads/:id` | leads | — | update |
| `GET /api/v1/leads/:id/activities` | leads | — | list |
| `POST /api/v1/leads/:id/assign` | leads | — | action |
| `GET /api/v1/leads/:id/follow-ups` | leads | — | list |
| `GET /api/v1/leads/:id/notes` | leads | — | list |
| `POST /api/v1/leads/:id/notes` | leads | — | action |
| `PUT /api/v1/leads/:id/status` | leads | — | update |
| `POST /api/v1/leads/bulk-assign` | leads | — | action |
| `POST /api/v1/leads/bulk-delete` | leads | — | action |
| `POST /api/v1/leads/bulk-status` | leads | — | action |
| `GET /api/v1/leads/filter-options` | leads | — | list |
| `GET /api/v1/leads/unassigned` | leads | — | list |
| `GET /api/v1/marketing/branding` | marketing-flyers | — | list |
| `PUT /api/v1/marketing/branding` | marketing-flyers | — | update |
| `GET /api/v1/marketing/flyer-templates` | marketing-flyers | — | list |
| `GET /api/v1/marketing/flyers` | marketing-flyers | — | list |
| `POST /api/v1/marketing/flyers` | marketing-flyers | — | create |
| `GET /api/v1/marketing/images` | marketing-flyers | — | list |
| `GET /api/v1/marketing/segments` | marketing-segments | — | list |
| `POST /api/v1/marketing/segments` | marketing-segments | — | create |
| `GET /api/v1/notifications` | notifications | — | list |
| `DELETE /api/v1/notifications/:id` | notifications | — | delete |
| `POST /api/v1/notifications/:id/read` | notifications | — | action |
| `POST /api/v1/notifications/announce` | notifications | — | action |
| `POST /api/v1/notifications/read-all` | notifications | — | action |
| `GET /api/v1/notifications/unread-count` | notifications | — | list |
| `GET /api/v1/payments` | payments | — | list |
| `POST /api/v1/payments` | payments | — | create |
| `DELETE /api/v1/payments/:id` | payments | — | delete |
| `GET /api/v1/payments/:id` | payments | — | read |
| `POST /api/v1/payments/:id/link-invoice` | payments | — | action |
| `GET /api/v1/reports` | reports | — | list |
| `GET /api/v1/reports/:id` | reports | — | read |
| `GET /api/v1/reports/:id/export` | reports | — | list |
| `GET /api/v1/reports/ageing` | reports | — | list |
| `GET /api/v1/reports/outstanding` | reports | — | list |
| `GET /api/v1/settings/assignment-rules` | settings-company | — | list |
| `PUT /api/v1/settings/assignment-rules` | settings-company | — | update |
| `GET /api/v1/settings/company` | settings-company | — | list |
| `PUT /api/v1/settings/company` | settings-company | — | update |
| `GET /api/v1/settings/follow-up-sequences` | settings-company | — | list |
| `POST /api/v1/settings/follow-up-sequences` | settings-company | — | action |
| `GET /api/v1/settings/invoice-defaults` | settings-company | — | list |
| `PUT /api/v1/settings/invoice-defaults` | settings-company | — | update |
| `POST /api/v1/settings/logo` | settings-company | — | action |
| `GET /api/v1/settings/numbering` | settings-company | — | list |
| `PUT /api/v1/settings/numbering` | settings-company | — | update |
| `GET /api/v1/settings/routing-rules` | settings-company | — | list |
| `PUT /api/v1/settings/routing-rules` | settings-company | — | update |
| `GET /api/v1/users` | settings-team | — | list |
| `GET /api/v1/users/:id` | settings-team | — | read |
| `PUT /api/v1/users/:id` | settings-team | — | update |
| `GET /api/v1/suppliers` | suppliers | — | list |
| `POST /api/v1/suppliers` | suppliers | — | create |
| `DELETE /api/v1/suppliers/:id` | suppliers | — | delete |
| `GET /api/v1/suppliers/:id` | suppliers | — | read |
| `PUT /api/v1/suppliers/:id` | suppliers | — | update |
| `GET /api/v1/suppliers/:id/ledger` | suppliers | — | list |
| `GET /api/v1/suppliers/:id/payments` | suppliers | — | list |
| `POST /api/v1/suppliers/:id/payments` | suppliers | — | action |
| `POST /api/v1/suppliers/:id/rate` | suppliers | — | action |
| `GET /api/v1/suppliers/:id/rate-cards` | suppliers | — | list |
| `POST /api/v1/suppliers/:id/toggle-preferred` | suppliers | — | action |
| `GET /api/v1/suppliers/compare-rates` | suppliers | — | list |
| `GET /api/v1/tasks` | tasks | — | list |
| `POST /api/v1/tasks` | tasks | — | create |
| `DELETE /api/v1/tasks/:id` | tasks | — | delete |
| `GET /api/v1/tasks/:id` | tasks | — | read |
| `PUT /api/v1/tasks/:id` | tasks | — | update |
| `PATCH /api/v1/tasks/:id/status` | tasks | — | update |
| `GET /api/v1/tasks/:id/subtasks` | tasks | — | list |
| `GET /api/v1/tasks/:taskId/comments` | tasks | — | list |
| `POST /api/v1/tasks/:taskId/comments` | tasks | — | action |
| `GET /api/v1/tasks/dashboard/summary` | tasks | — | list |
| `GET /api/v1/tasks/leads/:leadId/tasks` | tasks | — | list |
| `GET /api/v1/travellers` | travellers | — | list |
| `POST /api/v1/travellers` | travellers | — | create |
| `DELETE /api/v1/travellers/:id` | travellers | — | delete |
| `GET /api/v1/travellers/:id` | travellers | — | read |
| `PUT /api/v1/travellers/:id` | travellers | — | update |
| `GET /api/v1/visa` | visa | — | list |
| `POST /api/v1/visa` | visa | — | create |
| `DELETE /api/v1/visa/:id` | visa | — | delete |
| `GET /api/v1/visa/:id` | visa | — | read |
| `PUT /api/v1/visa/:id` | visa | — | update |
| `GET /api/v1/visa/:id/documents` | visa | — | list |
| `POST /api/v1/visa/:id/documents` | visa | — | action |
| `DELETE /api/v1/visa/:id/documents/:docId` | visa | — | delete |
| `GET /api/v1/visa/:id/documents/:docId/download` | visa | — | list |
| `GET /api/v1/vouchers` | vouchers | — | list |
| `POST /api/v1/vouchers` | vouchers | — | create |
| `DELETE /api/v1/vouchers/:id` | vouchers | — | delete |
| `GET /api/v1/vouchers/:id` | vouchers | — | read |
| `PUT /api/v1/vouchers/:id` | vouchers | — | update |
| `GET /api/v1/vouchers/:id/pdf` | vouchers | — | list |
| `POST /api/v1/vouchers/:id/send` | vouchers | — | action |
| `PATCH /api/v1/vouchers/:id/status` | vouchers | — | update |
| `POST /api/v1/vouchers/bulk-send` | vouchers | — | action |
| `GET /api/v1/vouchers/by-lead/:leadId` | vouchers | — | read |
| `POST /api/v1/vouchers/from-itinerary-item` | vouchers | — | action |

</details>

---

## Reconciliation with the existing M6–M18 audits

Every unresolved item in `desktop/audit/IMPROVEMENTS.md` carries a disposition below. Item numbers match that file.

### P0 — carried into slice work

| # | Area | Disposition | Slice |
|---|---|---|---|
| 1 | Vouchers use a data model the backend does not have | **Blocking rebuild.** The voucher UI must be regenerated against the real schema before any polish. | `vouchers` |
| 2 | Suppliers query `is_active` vs schema `is_deleted` | Backend fix; verify all supplier endpoints return 200 before UI work. | `suppliers` |
| 3, 4 | Import/export queues use `MASTER_DB` not the tenant DB | **Cross-tenant data risk.** Must be confirmed fixed; the slice job verifies with a two-tenant E2E. | `import-export` |
| 5, 6 | Communication inbox and templates use mock data | `templates.ts` now exists and is wired — #6 is resolved. #5 stands: inbox and bulk-send still mock. | `communication-inbox`, `message-templates` |
| 7 | 15+ frontend/backend type mismatches | Each slice job re-derives request shapes from the route Zod schema rather than trusting the client. | multiple |
| 8, 9 | Lead webhook has no tenant context; no Twilio signature check | Backend security fix; surfaced in the new integrations settings page. | `webhooks-integrations` |
| 10, 11 | Visa cron and campaign scheduler query wrong columns/tables | Cron correctness — verified by the slice seeded-reminder assertions. | `visa`, `marketing-campaigns` |
| 12, 13 | Reports show silent fallback data; hub computes KPIs client-side | **Highest-visibility lie in the product.** Remove fallbacks; call `GET /reports/dashboard`. | `reports` |
| 14 | Excel export uses `$` not `₹` | Folded into the `themedExport` UX contract item. | `reports`, `import-export` |
| 15 | Dashboard links to `/planner`, which does not exist | One-line fix to `/calendar`. | `dashboard` |
| 16, 17, 20 | Wrong HTTP verbs (events reschedule, contacts export, supplier compare) | Verb corrections confirmed against the route table in this inventory. | `calendar`, `import-export`, `suppliers` |
| 18, 19 | Payments buttons inert; overdue hardcoded to 0 | Rebuilt with a real detail page — `GET /payments/:id` exists and is unused. | `payments` |
| 21 | Rate card import uses supplier name as a foreign key | Import row-inserter fix. | `import-export` |
| 22 | Fleet trip detail renders fake vehicle/driver/passenger | Rebuild against the real trip relations. | `fleet-trips` |
| 23, 24, 27 | Notification prefs format mismatch; quiet hours; hardcoded badge `7` | The badge wires to `GET /notifications/badge-counts`, which already exists. | `notifications`, `auth-shell` |
| 25 | Opt-out route references non-existent contact columns | Schema fix precedes UI. | `marketing-opt-out` |
| 26 | Supplier detail field-name mismatches | Rebuild the detail page against the actual response keys. | `suppliers` |

### P1 / P2 — absorbed into the UX contract

Items **28–32** (no infinite scroll, no FilterBar, no skeletons, no relation Combobox, no URL prefill) and **80–85** (detail drawer, hover actions, empty states, keyboard shortcuts, bulk selection, unsaved-changes guard) are not tracked individually. They are encoded as the `uxContract` booleans on every slice file: `false` means the slice job must implement it. That converts roughly 40 audit rows into a mechanically checkable per-slice checklist.

Remaining P1 items **33–79** are recorded verbatim in the `notes` field of their owning slice, so each slice job sees its own defects without reading the audits.

P2 items **86–120** are polish. They are carried in slice `notes` where cheap (report date pickers, calendar week view, visa Kanban, task subtask bars) and otherwise deferred — they do not gate a slice completion.

### Audit items now resolved

- **#6** — `desktop/src/lib/api/templates.ts` exists and is wired to `/message-templates`.
- **#28–31 (partial)** — `FilterBar`, `useInfiniteScroll` and skeletons have since landed on roughly 22 list pages (contacts, leads, itineraries, invoices, payments, tasks, visa, travellers, vouchers, campaigns, segments, fleet lists, credit/debit notes, notifications). The remaining gaps are per-slice and recorded in each `uxContract`.

---

## How downstream jobs consume this

- `inventory.json` — the endpoint table. Every later job filters it by `slice` rather than re-scanning the repo.
- `slices/<slice>.json` — the per-slice contract. `fileAllowlist` bounds what the slice job may edit; the `uxContract` booleans are its acceptance checklist; `targetSpec` is the literal path the pipeline gates on.
- `showcaseOrder` — narrative order for the final walkthrough video: auth/shell → dashboard → core CRM → operations → communication → marketing → AI → reports → settings → admin.
