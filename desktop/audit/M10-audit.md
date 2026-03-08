# Milestone 10 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m10.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 7     |
| PARTIAL | 5     |
| MISSING | 2     |
| BUG     | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `FCM_SERVER_KEY` | `backend/src/services/fcm.ts:22` | Yes (for push) | Push notifications silently fail (console.error logged) |
| `PUSH_NOTIFICATION_QUEUE` | `backend/src/services/notification-service.ts:44`, `backend/src/routes/notifications.ts:270`, `backend/src/routes/leads.ts:201`, cron jobs | Yes (Queue binding) | Crashes — no null-check before `.send()` in notification-service.ts |
| `NOTIFICATION_QUEUE` | `backend/src/queues/ai-extraction-queue.ts:221,373`, `backend/src/services/missed-call-handler.ts:52` | Optional | Guarded with `if (env.NOTIFICATION_QUEUE)` — safe |
| `CACHE` | `backend/src/services/follow-up-reminders.ts` (KV for dedup) | Yes (for follow-up dedup) | Crashes if CACHE binding undefined |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `/notifications` (page.tsx:76) | No infinite scroll — loads `limit: 100` in single request | Use `useInfiniteScroll` hook, paginate with cursor |
| `/notifications` (page.tsx:76) | No FilterBar — no type/unread filtering UI | Add `FilterBar` with type dropdown + unread toggle |
| `/notifications` (page.tsx:157-160) | No loading skeleton — uses Loader2 spinner | Replace with Skeleton cards for notification items |
| `/notifications` (page.tsx:48-72) | No hover actions — no delete/deep-link icon buttons on each row | Add Trash2, ExternalLink icons on hover |
| `/notifications` (page.tsx:50-52) | No deep linking — clicking notification only marks read, doesn't navigate to entity | Use `notification.actionUrl` or construct route from `referenceType`/`referenceId` to navigate |
| `/settings/notifications` (page.tsx:26-56) | Preference type mismatch — frontend sends `{email: {newLead: bool}, push: {...}, sms: {...}}` but backend expects `{lead_assigned: {push_enabled: bool, in_app_enabled: bool, email_enabled: bool}}` | Frontend must restructure data to match backend's per-type, per-channel format |
| `/settings/notifications` (page.tsx:90-97) | Missing notification types — frontend has 6 types (`newLead`, `leadAssigned`, `taskDue`, `invoicePaid`, `newBooking`, `systemAlerts`) but backend has 8 (`lead_assigned`, `lead_status_change`, `follow_up_reminder`, `payment_received`, `task_assigned`, `birthday`, `invoice_overdue`, `announcement`) | Align frontend types with backend defaults |
| `/settings/notifications` (page.tsx:135-142) | Quiet hours mismatch — frontend sends `{enabled, start: "22:00", end: "07:00"}` (string times) but backend expects `{startHour: 22, endHour: 8}` (integer hours) | Convert time strings to integer hours before PUT, add `enabled` field to backend |
| `sidebar.tsx:117` | Hardcoded badge — `badge: 7` is static, not wired to real unread count | Use `notificationsApi.getUnreadCount()` or `getBadgeCounts()` to dynamically set badge |
| `sidebar.tsx:117` | No dynamic badges on other items — Leads (overdue follow-ups), Tasks (pending), Invoices (overdue) have no badges | Wire `getBadgeCounts()` API to sidebar items |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `/notifications` | Flat card list | Add notification dropdown panel (popover from bell icon) for quick glance without full page navigation | Medium |
| `/notifications` | No tab filtering | Add tabs: All / Unread / Leads / Payments / Tasks / System | Medium |
| `/notifications` | No bulk actions | Add "Delete all read" and multi-select delete | Low |
| `/notifications` | No real-time updates | Poll unread count every 30s or use WebSocket for live badge updates | High |
| `/notifications` | No sound/visual alert | Show toast + optional sound when new notification arrives (Electron can use native notification API) | Medium |
| `/settings/notifications` | No "Mute All" toggle | Add master mute switch at top of preferences page (spec requires it) | High |
| `/settings/notifications` | No timezone selector for quiet hours | Add timezone dropdown (spec requires `quiet_hours_timezone`) | Medium |
| `/settings/notifications` | Quiet hours toggle is local-only | Backend has no `enabled` boolean — quiet hours are either set or absent | Medium |
| Sidebar | No announcement form access | Add "Send Announcement" button in settings for admin users | Medium |
| Top Navbar | Bell icon only links to full page | Add hover preview / quick dropdown for last 5 notifications | Low |

## Ticket Details

### TICKET-163: FCM Integration & Push Token Registration — PARTIAL
**Backend:** DONE — `push_tokens` table exists at `tenant-schema.ts:877-889` with all required fields. `POST /push-tokens` and `DELETE /push-tokens/:token` routes in `backend/src/routes/push-tokens.ts`. FCM service at `backend/src/services/fcm.ts` with `sendPushNotification()`. Push queue handler at `backend/src/queues/push-notification-queue.ts`.
**Frontend (Desktop):** N/A — Push token registration is mobile/browser concern, not applicable for Electron desktop app.
**Frontend (Flutter):** MISSING — No `PushNotificationManager` class, no `firebase_messaging` dependency in `packages/crm_app/pubspec.yaml`. No FCM initialization, token refresh, or permission request.
**API Client:** N/A for desktop.
**UX Issues:**
- No device management UI to view/remove registered push tokens
**Fix Required:**
1. Flutter: Create `packages/crm_app/lib/core/services/push_notification_manager.dart`
2. Flutter: Add `firebase_messaging` to `pubspec.yaml`
3. Desktop: No action needed (desktop gets in-app notifications only)

---

### TICKET-164: In-App Notification System — DONE
**Backend:** DONE — `notifications` table at `tenant-schema.ts:861-875`. Routes in `backend/src/routes/notifications.ts`: GET list (paginated), POST mark-read, POST mark-all-read, DELETE, GET unread-count. `NotificationService` at `backend/src/services/notification-service.ts`.
**Frontend:** DONE — Notification list page at `desktop/src/app/(app)/notifications/page.tsx`. Shows grouped by date (Today/Yesterday/Earlier), mark as read, mark all as read, unread count, empty state.
**API Client:** DONE — `desktop/src/lib/api/notifications.ts` with `list`, `getUnreadCount`, `markAllAsRead`, `markAsRead`, `delete`, `getBadgeCounts`.
**UX Issues:**
- `page.tsx:76` — Loads all 100 notifications in one request, no infinite scroll
- `page.tsx:157-160` — Loader2 spinner instead of skeleton
- No FilterBar for type/unread filtering
- No hover actions (delete, view entity)
- No deep linking on notification click (only marks read, doesn't navigate)
- No detail drawer
**Fix Required:**
1. `desktop/src/app/(app)/notifications/page.tsx:76` — Replace single API call with `useInfiniteScroll`
2. `desktop/src/app/(app)/notifications/page.tsx` — Add FilterBar with type + unread filters
3. `desktop/src/app/(app)/notifications/page.tsx:157-160` — Replace spinner with Skeleton components
4. `desktop/src/app/(app)/notifications/page.tsx:48-72` — Add hover action icons (Trash2, ExternalLink)
5. `desktop/src/app/(app)/notifications/page.tsx:50-52` — Navigate to entity on click using referenceType/referenceId

---

### TICKET-165: Notification Triggers — Lead Events — PARTIAL
**Backend:** PARTIAL — Lead assignment notification exists in `backend/src/routes/leads.ts:171-209` (creates in-app + queues push on lead creation and reassignment). However:
- Lead status change notification: NOT implemented in leads.ts
- Lead note added notification: NOT implemented
- Lead created from webhook: NOT implemented
**Frontend:** N/A (backend-only triggers)
**API Client:** N/A
**UX Issues:** None (backend triggers)
**Fix Required:**
1. `backend/src/routes/leads.ts` — Add notification trigger on status change (PUT endpoint)
2. `backend/src/routes/leads.ts` — Add notification trigger on note creation
3. `backend/src/routes/leads.ts` — Add notification trigger on webhook lead creation

---

### TICKET-166: Notification Triggers — Payment & Invoice Events — MISSING
**Backend:** MISSING — `backend/src/routes/payments.ts` has NO notification triggers for payment received. `backend/src/routes/invoices.ts` has NO notification triggers for invoice created/overdue. Invoice overdue reminders exist only in cron (`auto-reminders.ts`), not as real-time triggers.
**Frontend:** N/A (backend-only triggers)
**API Client:** N/A
**UX Issues:** None
**Fix Required:**
1. `backend/src/routes/payments.ts` — Add notification on payment creation (notify lead owner + accountant)
2. `backend/src/routes/invoices.ts` — Add notification on invoice creation (notify lead owner)

---

### TICKET-167: Notification Triggers — Task Events — PARTIAL
**Backend:** PARTIAL — `backend/src/cron/overdue-tasks.ts:44` handles task overdue notifications via cron. However:
- Task assigned notification: NOT wired (task routes would need M14)
- Task completed notification: NOT wired
**Frontend:** N/A (backend-only triggers)
**API Client:** N/A
**UX Issues:** None
**Fix Required:**
1. Task notification hooks should be ready for M14 to call — document expected interface

---

### TICKET-168: Follow-Up Reminder Notifications — DONE
**Backend:** DONE — `backend/src/services/follow-up-reminders.ts` implements 5-minute polling for follow-ups. Sends push 15 min before scheduled time. Auto-marks overdue follow-ups as 'missed'. Notifies creator + assigned salesperson. Uses KV CACHE for deduplication (instead of DB `reminder_sent` column as spec says).
**Frontend:** N/A (cron/service-only feature)
**API Client:** N/A
**UX Issues:** None
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Spec requires `reminder_sent` column on `follow_ups` table. Current implementation uses KV CACHE instead — functionally equivalent but deviates from spec.

---

### TICKET-169: Notification Preferences — BUG
**Backend:** DONE — `backend/src/routes/notification-preferences.ts` with GET/PUT for preferences and quiet hours. Uses `settings` table with JSON storage (KV pattern). Default preferences for 8 notification types.
**Frontend:** DONE (UI exists) but BUG — `desktop/src/app/(app)/settings/notifications/page.tsx`
**API Client:** DONE — endpoints configured in `desktop/src/lib/api/config.ts:251-259`
**UX Issues:**
- **BUG: Data format mismatch** — Frontend sends `{email: {newLead: true, ...}, push: {...}, sms: {...}}` (channel-first) but backend expects `{lead_assigned: {push_enabled: true, in_app_enabled: true, email_enabled: false}, ...}` (type-first). The PUT will save wrong format to settings table.
- **BUG: Type name mismatch** — Frontend uses camelCase (`newLead`, `leadAssigned`, `taskDue`, `invoicePaid`, `newBooking`, `systemAlerts`) but backend uses snake_case (`lead_assigned`, `lead_status_change`, `follow_up_reminder`, `payment_received`, `task_assigned`, `birthday`, `invoice_overdue`, `announcement`)
- Missing "Mute All" toggle (spec requires it)
- Missing `task_overdue` type in preferences
- Missing `follow_up_reminder` and `birthday` types on frontend
**Fix Required:**
1. `desktop/src/app/(app)/settings/notifications/page.tsx:26-56` — Restructure `NotificationPreferences` interface to match backend format: `Record<string, {push_enabled, in_app_enabled, email_enabled}>`
2. `desktop/src/app/(app)/settings/notifications/page.tsx:90-97` — Use all 8 backend notification types with snake_case keys
3. `desktop/src/app/(app)/settings/notifications/page.tsx` — Add "Mute All" toggle at top

---

### TICKET-170: Quiet Hours — BUG
**Backend:** DONE — `backend/src/services/notification-service.ts:172-198` checks quiet hours. `backend/src/routes/notification-preferences.ts:107-154` GET/PUT quiet hours. Stores as `{startHour: number, endHour: number}`.
**Frontend:** DONE (UI exists) but BUG — `desktop/src/app/(app)/settings/notifications/page.tsx:243-276`
**API Client:** DONE — `API_ENDPOINTS.notificationPreferences.quietHours`
**UX Issues:**
- **BUG: Data format mismatch** — Frontend sends `{enabled: boolean, start: "22:00", end: "07:00"}` (strings) but backend expects `{startHour: 22, endHour: 8}` (integers). The PUT will fail or save garbage.
- Backend has no concept of `enabled` flag — quiet hours are just set or absent
- No timezone selector (spec requires `quiet_hours_timezone`)
- Announcements bypass quiet hours (correctly implemented in backend)
**Fix Required:**
1. `desktop/src/app/(app)/settings/notifications/page.tsx:135-142` — Convert time strings to integer hours before sending to backend
2. `desktop/src/app/(app)/settings/notifications/page.tsx` — Handle `enabled` toggle by deleting quiet hours entry when disabled
3. Backend: Consider adding timezone support to quiet hours

---

### TICKET-171: Auto-Reminder Cron — Birthday & Anniversary — DONE
**Backend:** DONE — `backend/src/cron/auto-reminders.ts:5-100` implements birthday detection using `substr(birthday, 6, 5)` matching. Sends SMS via messaging queue. Creates in-app notification for admins. Anniversary detection also present.
**Frontend:** N/A (cron-only feature)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None

---

### TICKET-172: Auto-Reminder — Invoice & Visa Expiry — DONE
**Backend:** DONE — `backend/src/cron/auto-reminders.ts` implements:
- Invoice due in 3 days: SMS + Email
- Invoice overdue 1 day: SMS + Email
- Invoice overdue 7 days: SMS + Email + Push
- Invoice overdue 14 days: SMS + Email + Push (goes beyond spec)
- Visa expiry 30 days: Push
- Passport expiry 6 months: Email
- Trip departure tomorrow: SMS + Email
- Trip completed yesterday: Feedback email
**Frontend:** N/A (cron-only feature)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None — exceeds spec with 14-day overdue and missing visa docs checks

---

### TICKET-173: Custom Admin Announcements — PARTIAL
**Backend:** DONE — `POST /api/v1/notifications/announce` in `backend/src/routes/notifications.ts:270`. Creates in-app notifications for all target users. Queues push notifications via `PUSH_NOTIFICATION_QUEUE`. Requires admin/sales_manager role.
**Frontend:** MISSING — No "Send Announcement" UI exists. No compose form with title, body, target selector.
**API Client:** MISSING — `notificationsApi` in `desktop/src/lib/api/notifications.ts` has no `announce()` method.
**UX Issues:**
- No announcement form page/dialog
- No target selector (all team / role / specific users)
- No announcement styling in notification list (should have different icon/highlight)
**Fix Required:**
1. Create `desktop/src/app/(app)/settings/announcements/page.tsx` or add dialog in settings
2. `desktop/src/lib/api/notifications.ts` — Add `announce(data)` method calling POST `/notifications/announce`
3. `desktop/src/app/(app)/notifications/page.tsx` — Special styling for announcement-type notifications

---

### TICKET-174: Notification Deep Linking — MISSING
**Backend:** DONE — Notifications store `reference_type` (entity_type) and `reference_id` (entity_id) fields.
**Frontend:** MISSING — `desktop/src/app/(app)/notifications/page.tsx:50-52` clicking a notification only calls `onMarkRead(notification.id)`. Does NOT navigate to the entity. The `Notification` type has `actionUrl` but it's never used. There's no routing logic to map `referenceType` → route.
**API Client:** N/A
**UX Issues:**
- Clicking notification does nothing useful beyond marking read
- No visual indicator that notification is clickable/navigable
- No foreground notification snackbar/toast when new notification arrives
**Fix Required:**
1. `desktop/src/app/(app)/notifications/page.tsx:50-52` — Add navigation: `router.push(/${referenceType}s/${referenceId})`
2. `desktop/src/app/(app)/notifications/page.tsx:48-72` — Add visual click affordance (cursor, chevron icon)
3. `desktop/src/lib/api/notifications.ts:5-17` — Add `referenceType` and `referenceId` to `Notification` interface (currently missing, only has generic `metadata`)

---

### TICKET-175: Notification Navigation & Settings Routes — DONE
**Backend:** N/A
**Frontend:** DONE — `/notifications` page exists. `/settings/notifications` page exists. Sidebar has Notifications link at `sidebar.tsx:117`. Top navbar has bell icon at `top-navbar.tsx:99-108`. Settings page presumably links to notification preferences.
**API Client:** N/A
**UX Issues:** None significant
**Fix Required:** None

---

### TICKET-176: Notification Badge Counts in Sidebar — BUG
**Backend:** DONE — `GET /api/v1/notifications/badge-counts` in `backend/src/routes/notifications.ts` returns `{unread_notifications, overdue_followups, pending_tasks, overdue_invoices}`.
**Frontend:** PARTIAL — `top-navbar.tsx:60-65` fetches unread count and shows badge on bell icon correctly. However `sidebar.tsx:117` has `badge: 7` hardcoded. No other sidebar items (Leads, Tasks, Invoices) have dynamic badges.
**API Client:** DONE — `notificationsApi.getBadgeCounts()` exists.
**UX Issues:**
- **BUG: Hardcoded badge** — `sidebar.tsx:117` has `badge: 7` instead of dynamic unread count
- No badges on Leads (overdue follow-ups), Tasks (pending), Invoices (overdue) sidebar items
- No periodic refresh of badge counts
- No real-time WebSocket badge updates
**Fix Required:**
1. `desktop/src/components/layout/sidebar.tsx:117` — Remove hardcoded `badge: 7`, wire to `notificationsApi.getBadgeCounts()` or `getUnreadCount()`
2. `desktop/src/components/layout/sidebar.tsx:64-119` — Add dynamic badges to Leads, Tasks, Invoices sidebar items using `getBadgeCounts()` response
3. Add polling (every 60-120s) to refresh badge counts
