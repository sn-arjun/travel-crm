# Milestone 14 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m14.md

## Summary
| Status   | Count |
|----------|-------|
| DONE     | 8     |
| PARTIAL  | 10    |
| MISSING  | 2     |
| BUG      | 4     |

Total Tickets: 20

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| NEXT_PUBLIC_API_URL | desktop/src/lib/api/config.ts | Yes | Falls back to localhost:8787 |
| (No M14-specific env vars) | — | — | — |

## UX Anti-Patterns (must fix)

| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| tasks/page.tsx:99 | Raw ID input — shows `Lead: {task.leadId}` as plain Badge | Replace with clickable lead name link; fetch lead title via API or from backend join |
| tasks/page.tsx:108 | Raw ID for assignee — shows `task.assignedTo` raw string | Display assignee name (backend already returns `assignee_name`) |
| tasks/page.tsx:271 | Raw ID in detail panel — `{task.leadId}` as Badge | Replace with clickable link to lead detail page |
| tasks/page.tsx:263 | Raw ID in detail panel — `{task.assignedTo}` as text | Display resolved assignee name |
| tasks/page.tsx:290-298 | No infinite scroll — uses `useApiQuery` without pagination | Replace with `useInfiniteScroll` from `desktop/src/hooks/use-infinite-scroll.ts` |
| tasks/page.tsx:416-469 | No FilterBar component — uses raw Select dropdowns | Replace with `FilterBar` from `desktop/src/components/domain/filter-bar.tsx` |
| tasks/page.tsx:471-476 | No loading skeletons — shows generic spinner | Add skeleton cards for Kanban columns during loading |
| tasks/page.tsx:531-571 | Incomplete create form — missing assignedTo, category, leadId fields | Add Combobox for assignee (users API), Combobox for lead, category dropdown |
| tasks/page.tsx:186-190 | Weak empty state — just "No tasks" text | Add proper EmptyState with illustration and CTA button |
| calendar/page.tsx:345 | Raw ID display — `{event.leadId}` as plain text | Replace with clickable lead name link |
| calendar/page.tsx:284-288 | No loading skeletons — shows generic spinner | Add skeleton grid for calendar during loading |
| calendar/page.tsx:380-428 | Incomplete event create form — missing location, recurrence, all_day, color, lead linking | Add all missing fields per spec |
| calendar/page.tsx:270 | Incomplete event type legend — missing trip_departure, trip_return, follow_up, deadline, reminder, holiday | Match backend enum: trip_departure, trip_return, meeting, follow_up, deadline, reminder, holiday |
| calendar/page.tsx:323-359 | No hover actions on event cards — only delete button | Add edit, view-in-detail icons |
| calendar/page.tsx (entire) | No event edit capability — can only create and delete | Add event editing via dialog or dedicated page |
| calendar/page.tsx (entire) | No week/day views — only month view | Add view toggle for Week and Day views per spec |
| calendar/page.tsx (entire) | No drag-and-drop rescheduling | Implement drag-drop on calendar grid to reschedule events |
| calendar/page.tsx (entire) | No team/my calendar toggle | Add team vs personal calendar view per spec |

## UX Improvements (nice to have)

| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| tasks/page.tsx | Kanban only | Add list view toggle (grouped by status with collapsible sections) per TICKET-243 | High |
| tasks/page.tsx | No subtask display | Show subtask progress bar (e.g., "2/5") on task cards | High |
| tasks/page.tsx | No comments section | Add comments thread in task detail panel with input field | High |
| tasks/page.tsx | No task edit form | Add inline edit or navigate to edit page | High |
| tasks/page.tsx | No overdue highlighting | Add red background tint and "OVERDUE" badge per spec | Medium |
| tasks/page.tsx | No sort options | Add sort by due date, priority, created date | Medium |
| tasks/page.tsx | No keyboard shortcuts | Add Ctrl+N for new task, Enter to save | Low |
| tasks/page.tsx | No bulk operations | Add multi-select and bulk status change | Low |
| calendar/page.tsx | No "Today" button | Add button to jump to current date | Medium |
| calendar/page.tsx | No end time display | Show event time range, not just start time | Medium |
| calendar/page.tsx | No event search | Add search/filter for events by title or type | Medium |
| calendar/page.tsx | No timezone display | Show event times in user's timezone with abbreviation | Low |
| dashboard (page.tsx:111) | Links to `/planner` which doesn't exist | Change to `/calendar` | High |

## Ticket Details

### TICKET-230: Drizzle Schema — Events & Tasks Tables — DONE
**Backend:** DONE — `backend/src/db/tenant-schema.ts`
- `events` table at line 767: all 18 columns present (id, title, description, event_type, start_at, end_at, all_day, location, color, recurrence_rule, recurrence_parent_id, related_lead_id, related_task_id, assigned_to, created_by, timezone, is_deleted, created_at, updated_at)
- `tasks` table at line 737: all 16 columns present including `overdue_notified_date` at line 750
- `task_comments` table at line 800: all 6 columns present
- Indexes: all specified indexes created (lines 755-760 for tasks, 788-793 for events, 808-809 for comments)
**Frontend:** N/A (backend-only ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None

---

### TICKET-231: Events CRUD API — DONE
**Backend:** DONE — `backend/src/routes/planner.ts`
- POST /events (line ~102): creates event with all fields, validation present
- GET /events (line ~14): list with date range, event_type, assigned_to, view filters, role-based filtering
- GET /events/:id (line ~79): single event with assignee/creator names
- PUT /events/:id (line ~155): partial update supported
- DELETE /events/:id (line ~235): soft delete
**Frontend:** N/A (backend-only ticket)
**API Client:** DONE — `desktop/src/lib/api/events.ts`
**UX Issues:** None
**Fix Required:** None

---

### TICKET-232: Recurring Events Engine — PARTIAL
**Backend:** PARTIAL — `backend/src/services/recurrence-engine.ts`
- `expandRecurrence()` function implemented with daily/weekly/monthly support
- Virtual ID generation: `{parentId}_YYYYMMDD` format
- Max 366 instance limit enforced
- Duration preservation working
**Frontend:** N/A
**API Client:** N/A
**UX Issues:**
- PUT /events/:id scope='this_and_future' NOT IMPLEMENTED (only 'this' and 'all' scopes work)
**Fix Required:**
1. `backend/src/routes/planner.ts:~165-192` — Add 'this_and_future' scope handling: update parent's recurrence end_date to day before, create new recurring event from target date

---

### TICKET-233: Flutter Calendar — Month View — PARTIAL (DESKTOP EQUIVALENT)
**Note:** Spec targets Flutter but desktop uses Next.js. Desktop equivalent exists at `desktop/src/app/(app)/calendar/page.tsx`.
**Backend:** N/A (frontend ticket)
**Frontend:** PARTIAL — `desktop/src/app/(app)/calendar/page.tsx` (443 lines)
- Month view grid with day numbers: DONE (lines 60-152)
- Events shown as colored labels on days: DONE (max 3 + "+N more" indicator)
- Day selection shows events in side panel: DONE (lines 307-440)
- Color coding per event type: PARTIAL — only 4 types (meeting/call/task/other) instead of 7 (trip_departure/trip_return/meeting/follow_up/deadline/reminder/holiday)
- Month navigation (prev/next): DONE (lines 196-204)
- "Today" button: MISSING
- Loading state: PARTIAL — spinner only, no skeleton grid
- Create event from selected date: DONE (lines 365-436)
- Empty state for day with no events: DONE (lines 317-321)
**API Client:** DONE — `desktop/src/lib/api/events.ts`
**UX Issues:**
1. calendar/page.tsx:270 — Only 4 event types in legend (missing trip_departure, trip_return, follow_up, deadline, reminder, holiday)
2. calendar/page.tsx:284-288 — No skeleton loading, just spinner
3. calendar/page.tsx:380-428 — Incomplete create form (missing location, recurrence, all_day, color, lead link)
4. calendar/page.tsx:345 — Raw lead ID display
**Fix Required:**
1. `calendar/page.tsx:27-47` — Add all 7 event type colors from spec
2. `calendar/page.tsx:270` — Update legend to show all event types
3. `calendar/page.tsx:380-428` — Add location, all_day toggle, recurrence rule, lead Combobox, color picker fields
4. `calendar/page.tsx:284-288` — Replace spinner with skeleton calendar grid
5. `calendar/page.tsx:345` — Fetch and display lead name instead of raw ID

---

### TICKET-234: Flutter Calendar — Week & Day Views — MISSING (DESKTOP)
**Backend:** N/A
**Frontend:** MISSING — `desktop/src/app/(app)/calendar/page.tsx` only has month view
- No view toggle (Month/Week/Day): MISSING
- No week view with hourly time slots: MISSING
- No day view with hourly timeline: MISSING
- No current time indicator: MISSING
- No swipe/navigation between weeks or days: MISSING
**API Client:** N/A
**UX Issues:** Entire feature missing
**Fix Required:**
1. `calendar/page.tsx` — Add SegmentedButton/Tabs toggle for Month/Week/Day views
2. Create WeekView component with 7-day columns and hourly rows
3. Create DayView component with single-day hourly timeline
4. Add current time red indicator line

---

### TICKET-235: Event Creation & Edit Form — PARTIAL (DESKTOP)
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/calendar/page.tsx:380-428`
- Create event dialog exists but is minimal
- Has: title, type, time, description
- Missing: location, all_day toggle, recurrence configuration, lead linking (Combobox), assignee dropdown, color picker, end time
- No edit form exists at all — can only create and delete
- No route `/calendar/events/[id]/edit`
**API Client:** DONE — `events.ts` has `create()` and `update()` methods
**UX Issues:**
1. No event editing capability at all
2. Create form missing 6+ fields from spec
3. No form validation shown (title required but no visual indicator)
**Fix Required:**
1. `calendar/page.tsx:380-428` — Add all missing form fields
2. Create event edit dialog or page at `calendar/events/[id]/edit/page.tsx`
3. Add form validation with inline error messages

---

### TICKET-236: Event Detail Bottom Sheet & Delete — PARTIAL (DESKTOP)
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/calendar/page.tsx:323-359`
- Event card in side panel shows: type badge, title, time, description, leadId: DONE
- Delete button: DONE (line 349-355)
- Missing: assignee display, edit button, recurrence info, linked lead navigation, color header bar, timezone display
- Missing: for recurring events, no "Delete this only / all future / all" dialog
**API Client:** N/A
**UX Issues:**
1. calendar/page.tsx:345 — Raw lead ID shown
2. No edit button on event detail
3. No recurring event delete scope dialog
**Fix Required:**
1. `calendar/page.tsx:323-359` — Add assignee name, edit button, recurrence info text
2. Add colored header bar matching event type
3. Add recurring delete confirmation dialog with scope options

---

### TICKET-237: Drag-and-Drop Event Rescheduling — MISSING (DESKTOP)
**Backend:** DONE — `backend/src/routes/planner.ts:~266-283` has PATCH /events/:id/reschedule
**Frontend:** MISSING — No drag-and-drop on calendar grid
**API Client:** DONE — `events.ts:95-96` has `reschedule()` method (but uses POST instead of PATCH)
**UX Issues:** Feature entirely absent from UI
**Fix Required:**
1. `calendar/page.tsx` — Implement drag-and-drop on month view grid (drag event to new date)
2. `events.ts:96` — Change `client.post` to `client.patch` to match backend PATCH method

---

### TICKET-238: Team Calendar & My Calendar Toggle — MISSING (DESKTOP)
**Backend:** DONE — GET /events supports `?view=team` and `?view=my` query params
**Frontend:** MISSING — No My Calendar / Team Calendar toggle in UI
**API Client:** DONE — `events.ts:63` has `view?: string` param in list()
**UX Issues:** Feature entirely absent from UI
**Fix Required:**
1. `calendar/page.tsx` — Add SegmentedButton toggle for "My Calendar" / "Team Calendar"
2. Pass `view` param to API call based on toggle state
3. Show team member color legend when in team mode

---

### TICKET-239: Timezone Display & Color Coding Constants — PARTIAL
**Backend:** PARTIAL — Events store timezone field, but missing dedicated timezone endpoints
- Missing: `GET /api/v1/users/me/timezone`
- Missing: `PUT /api/v1/users/me/timezone`
**Frontend:** PARTIAL — `desktop/src/app/(app)/calendar/page.tsx`
- Color coding: PARTIAL — only 4 types (meeting/call/task/other) instead of full 7-type color scheme
- Missing: timezone-aware time display (currently uses browser locale)
- Missing: timezone abbreviation in event time display
- Missing: event type icons (airplane, people, phone, flag, bell, palm_tree)
**API Client:** N/A — No timezone endpoints in config
**UX Issues:**
1. calendar/page.tsx:27-47 — Incomplete color scheme (4 types vs 7)
2. No timezone conversion/display
**Fix Required:**
1. `calendar/page.tsx:27-47` — Add all 7 event type colors matching spec hex values
2. `backend/src/routes/users.ts` — Add GET/PUT /users/me/timezone endpoints
3. `desktop/src/lib/api/config.ts` — Add timezone endpoints
4. `calendar/page.tsx:337` — Display timezone abbreviation with event times

---

### TICKET-240: Tasks CRUD API — DONE
**Backend:** DONE — `backend/src/routes/tasks.ts`
- POST /tasks (line ~100): creates task with all fields, auto-creates calendar event if due_date set
- GET /tasks (line ~21): list with status, priority, category, assigned_to, related_lead_id, due_date_from/to, overdue, view, page, limit filters
- GET /tasks/:id (line ~76): single task with subtask counts, assignee, lead info
- PUT /tasks/:id (line ~159): partial update with calendar event sync
- PATCH /tasks/:id/status (line ~229): status transition validation enforced
- DELETE /tasks/:id (line ~269): soft delete of task + subtasks + linked event
- GET /tasks/:id/subtasks (line ~293): returns subtasks with assignee names
**Frontend:** N/A (backend-only ticket)
**API Client:** DONE — `desktop/src/lib/api/tasks.ts`
**UX Issues:** None
**Fix Required:** None

---

### TICKET-241: Task Comments API — DONE
**Backend:** DONE — `backend/src/routes/tasks.ts`
- POST /tasks/:taskId/comments (line ~313): create with 2000 char limit
- GET /tasks/:taskId/comments (line ~343): list with user name/avatar
- PUT /tasks/:taskId/comments/:commentId (line ~362): author-only edit
- DELETE /tasks/:taskId/comments/:commentId (line ~386): author or manager delete
**Frontend:** N/A (backend-only ticket)
**API Client:** PARTIAL — `tasks.ts:102-103` has `getComments()` but missing `createComment()`, `updateComment()`, `deleteComment()` methods
**UX Issues:** None
**Fix Required:**
1. `desktop/src/lib/api/tasks.ts` — Add `createComment(taskId, content)`, `updateComment(taskId, commentId, content)`, `deleteComment(taskId, commentId)` methods

---

### TICKET-242: Task Creation Form (Flutter) — PARTIAL (DESKTOP)
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/tasks/page.tsx:531-571`
- Has: title (required), description, priority dropdown, due date picker
- Missing: category dropdown (6 categories), assignee Combobox (searchable user list), lead linking Combobox (searchable leads), parent task ID (for subtasks)
- No form validation visual indicators
- No pre-fill from parent context (e.g., navigating from lead detail)
**API Client:** DONE — `tasks.ts:87-88` has `create()`
**UX Issues:**
1. tasks/page.tsx:531-571 — Missing assignedTo, category, leadId fields
2. No Combobox for relation fields
3. No auto-populate from URL params
**Fix Required:**
1. `tasks/page.tsx:536-561` — Add category Select dropdown with 6 options
2. `tasks/page.tsx:536-561` — Add searchable Combobox for assignee (fetching users from API)
3. `tasks/page.tsx:536-561` — Add searchable Combobox for lead linking
4. Read URL params (e.g., `?leadId=xxx`) and pre-fill lead field

---

### TICKET-243: Task List Screen (My Tasks & All Tasks) — PARTIAL (DESKTOP)
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/tasks/page.tsx` (574 lines)
- Kanban board with 3 columns (To Do / In Progress / Completed): DONE
- Drag-and-drop between columns: DONE
- Task cards showing priority, assignee, due date, overdue indicator: DONE
- Filter by search, assignee, priority, status: DONE (but raw Selects, not FilterBar)
- Missing: "My Tasks" / "All Tasks" tab toggle per role
- Missing: list view (grouped by status with collapsible sections)
- Missing: sort options (due date, priority, created date, alphabetical)
- Missing: infinite scroll pagination
- Missing: subtask progress display on cards
- Missing: category chip on cards
- Missing: overdue red background tint and "OVERDUE" badge
- Missing: linked lead name (shows raw ID)
**API Client:** DONE — `tasks.ts:71-82` has `list()` with proper params
**UX Issues:**
1. tasks/page.tsx:290-298 — No infinite scroll, loads all at once
2. tasks/page.tsx:416-469 — Raw Select dropdowns instead of FilterBar component
3. tasks/page.tsx:99 — Raw lead ID display
4. tasks/page.tsx:108 — Raw assignee ID display
5. tasks/page.tsx:186-190 — Weak empty state (just "No tasks" text)
6. tasks/page.tsx:471-476 — No skeleton loading
**Fix Required:**
1. `tasks/page.tsx:290-298` — Replace with `useInfiniteScroll` hook
2. `tasks/page.tsx:416-469` — Replace with `FilterBar` component
3. `tasks/page.tsx` — Add My Tasks / All Tasks tab toggle
4. `tasks/page.tsx` — Add list view toggle alongside Kanban
5. `tasks/page.tsx:99,271` — Show lead title instead of raw ID
6. `tasks/page.tsx:108,263` — Show assignee name (use `assignee_name` from backend)
7. `tasks/page.tsx:186-190` — Add proper EmptyState with icon and CTA

---

### TICKET-244: Task Detail Screen with Subtasks & Comments — PARTIAL (DESKTOP)
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/tasks/page.tsx:197-278` (Sheet panel, not dedicated page)
- Shows: title, status badge, priority badge, description, due date, assignee, linked lead: DONE
- Missing: No dedicated `/tasks/[id]` page (only inline Sheet panel)
- Missing: subtask section with checkboxes and "Add Subtask" button
- Missing: subtask progress bar
- Missing: comments thread (chronological list with user info)
- Missing: "Add comment" input field
- Missing: status transition UI (tap status chip to change)
- Missing: edit button navigating to edit form
- Missing: delete button with confirmation
- Missing: "View in Calendar" link for tasks with due_date
**API Client:** PARTIAL — has `getSubtasks()` and `getComments()` but these are NOT used in UI. Missing `createComment()`, `updateComment()`, `deleteComment()`.
**UX Issues:**
1. Detail panel is read-only with no actions
2. No subtask display or management
3. No comments section
4. No status transition from detail view
**Fix Required:**
1. Create dedicated `desktop/src/app/(app)/tasks/[id]/page.tsx` with full detail view
2. Add subtask section with checkboxes, inline add form, progress bar
3. Add comments thread with user avatars, timestamps, add comment input
4. Add status transition dropdown
5. Add edit and delete buttons
6. `desktop/src/lib/api/tasks.ts` — Add comment CRUD methods

---

### TICKET-245: Task Status Transitions & Lead Linking — PARTIAL
**Backend:** DONE — `backend/src/routes/tasks.ts`
- Status transition validation: DONE (todo→in_progress, in_progress→done, done→in_progress; lines ~229-265)
- completed_at set/cleared: DONE
- GET /leads/:leadId/tasks endpoint: DONE (line ~411)
**Frontend:** PARTIAL
- Status change via dropdown: DONE (tasks/page.tsx:362-372)
- Lead detail screen Tasks tab: NOT CHECKED (would need to verify leads detail page)
- Task detail linked lead navigation: MISSING (shows raw ID, not clickable link)
- Create task from lead detail with auto-fill: MISSING
**API Client:** DONE — `tasks.ts:108-109` has `getByLead()` but NOT used in any UI
**UX Issues:**
1. tasks/page.tsx:99,271 — Lead shown as raw ID badge, not clickable
2. No "Tasks" tab in lead detail screen
**Fix Required:**
1. `tasks/page.tsx:99` — Make lead badge clickable, navigate to `/leads/${task.leadId}`
2. Add Tasks tab to lead detail page calling `tasksApi.getByLead(leadId)`
3. Lead detail "Add Task" button should link to `/tasks/new?leadId=${leadId}`

---

### TICKET-246: Overdue Task Tracking & Push Notifications — DONE
**Backend:** DONE — `backend/src/cron/overdue-tasks.ts`
- Overdue detection query: DONE (due_date < today AND status != 'done' AND is_deleted = 0)
- In-app notification creation: DONE
- overdue_notified_date tracking: DONE (prevents duplicate notifications)
- `overdue_notified_date` column in tasks schema: DONE (tenant-schema.ts line 750)
**Frontend:** N/A (backend cron ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:**
1. Verify cron schedule registration in `backend/src/index.ts` or `wrangler.toml` (currently function is exported but schedule not visible)

---

### TICKET-247: Task Assignment Push Notification — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/tasks.ts`
- On task creation: notification logic NOT present in POST handler (lines ~100-155)
- On task reassignment: notification logic NOT present in PUT handler (lines ~159-225)
- Backend has no `notificationService` import/usage in tasks.ts
**Frontend:** N/A (backend ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:**
1. `backend/src/routes/tasks.ts` POST handler — Add notification to assignee when assignedTo !== createdBy
2. `backend/src/routes/tasks.ts` PUT handler — Detect reassignment (assignedTo changed), notify new and old assignees

---

### TICKET-248: Task Dashboard Widget — PARTIAL
**Backend:** DONE — `backend/src/routes/tasks.ts` has GET /tasks/dashboard/summary (line ~431)
- Returns today_tasks, overdue_count, completed_today, by_status: DONE
**Frontend:** PARTIAL — `desktop/src/app/(app)/page.tsx`
- Dashboard shows "Open Tasks" stat card (line 31): DONE
- Shows "Upcoming Events" stat card (line 33): DONE
- Quick action "Schedule event" links to `/planner` (line 111): BUG — `/planner` doesn't exist
- Missing: dedicated task dashboard widget with today's tasks list, overdue badge, status breakdown
- Missing: auto-refresh
**API Client:** DONE — `tasks.ts:105-106` has `getDashboardSummary()`
**UX Issues:**
1. page.tsx:111 — Links to non-existent `/planner` route
2. No dedicated task widget showing today's tasks and overdue count
**Fix Required:**
1. `desktop/src/app/(app)/page.tsx:111` — Change `/planner` to `/calendar`
2. Add TaskDashboardWidget component to dashboard using `tasksApi.getDashboardSummary()`

---

### TICKET-249: Auto-Create Calendar Event from Task Due Date — DONE
**Backend:** DONE — `backend/src/routes/tasks.ts`
- On task creation with due_date: creates deadline event (lines ~128-142)
- On task update — due_date changed: updates/creates/deletes linked event (lines ~192-213)
- On task deletion: soft-deletes linked event (lines ~281-283)
- On task completion: updates event color to green (lines ~251-259)
- Duplicate prevention: checks existing event by related_task_id before creating
**Frontend:** N/A (backend ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None
**Note:** Task-event sync is implemented inline in route handlers. Spec suggested dedicated `task-event-sync.ts` service but inline implementation is acceptable.

---

### TICKET-250: Planner & Tasks Routes and Navigation — PARTIAL (DESKTOP)
**Backend:** N/A
**Frontend:** PARTIAL — Desktop sidebar and routing
- Sidebar: "Calendar" at `/calendar` (sidebar.tsx:70): DONE
- Sidebar: "Tasks" at `/tasks` with badge (sidebar.tsx:71): DONE
- Route `/tasks` page: DONE (tasks/page.tsx)
- Route `/calendar` page: DONE (calendar/page.tsx)
- Missing: `/tasks/[id]` page (task detail — only inline Sheet)
- Missing: `/tasks/[id]/edit` page (task edit)
- Missing: `/tasks/new` page (uses Dialog instead)
- Missing: `/calendar/events/[id]/edit` page (no event editing)
- Missing: deep linking from push notification
- Missing: breadcrumbs
**API Client:** N/A
**UX Issues:**
1. Dashboard links to `/planner` which doesn't exist (page.tsx:111)
2. No dedicated task detail or edit pages — only inline dialogs
**Fix Required:**
1. Create `desktop/src/app/(app)/tasks/[id]/page.tsx` — task detail
2. Create `desktop/src/app/(app)/tasks/[id]/edit/page.tsx` — task edit
3. Create `desktop/src/app/(app)/tasks/new/page.tsx` — task creation (or keep dialog)
4. `desktop/src/app/(app)/page.tsx:111` — Change `/planner` to `/calendar`

---

### TICKET-251: Freezed Models — Event & Task — N/A (FLUTTER ONLY)
**Note:** This ticket is Flutter-specific (Freezed data models). Desktop uses TypeScript interfaces.
**Desktop Equivalent:** PARTIAL — `desktop/src/lib/api/tasks.ts` and `desktop/src/lib/api/events.ts` define TS interfaces
**Issues:**
1. `tasks.ts:10` — Task status enum includes both 'pending' and 'todo', 'completed' and 'done' — inconsistent with backend which only uses 'todo'/'in_progress'/'done'
2. `tasks.ts:5-20` — Missing fields: `category`, `parent_task_id`, `completed_at`, `overdue_notified_date`, `subtask_count`, `completed_subtask_count`, `assignee_name`, `lead_title`
3. `events.ts:5-20` — Missing fields: `recurrence_rule`, `recurrence_parent_id`, `color`, `timezone`, `related_task_id`, `all_day`, `assigned_to`, `is_recurring`
4. `events.ts:14` — Event type enum only has 4 types instead of 7+
**Fix Required:**
1. `tasks.ts:5-20` — Add missing fields to Task interface
2. `tasks.ts:10` — Normalize status enum to match backend: 'todo' | 'in_progress' | 'done'
3. `events.ts:5-20` — Add missing fields to CalendarEvent interface
4. `events.ts:14` — Expand event type enum to include all 7 types

---

### TICKET-252: Event & Task Repositories (Flutter) — N/A (FLUTTER ONLY)
**Note:** Flutter-specific. Desktop equivalent is the API client module.
**Desktop Equivalent:** PARTIAL — `desktop/src/lib/api/tasks.ts` and `desktop/src/lib/api/events.ts`
**Issues:**
1. `tasks.ts` — Missing comment create/update/delete methods
2. `events.ts:96` — `reschedule()` uses `client.post` but backend expects PATCH
**Fix Required:**
1. `tasks.ts` — Add `createComment(taskId: string, content: string)`, `updateComment(taskId: string, commentId: string, content: string)`, `deleteComment(taskId: string, commentId: string)` methods
2. `events.ts:96` — Change `client.post` to `client.patch`

---

## BUG Summary

### BUG-1: Dashboard links to non-existent `/planner` route
**File:** `desktop/src/app/(app)/page.tsx:111`
**Impact:** Clicking "Schedule event" quick action navigates to 404
**Fix:** Change href from `/planner` to `/calendar`

### BUG-2: Events API client uses POST for reschedule instead of PATCH
**File:** `desktop/src/lib/api/events.ts:96`
**Impact:** Backend expects PATCH but client sends POST — will get 404 or method not allowed
**Fix:** Change `client.post` to `client.patch`

### BUG-3: Task status enum mismatch between frontend and backend
**File:** `desktop/src/lib/api/tasks.ts:10`
**Backend sends:** `todo` | `in_progress` | `done`
**Frontend expects:** `pending` | `in_progress` | `completed` | `cancelled` | `todo`
**Impact:** Manual mapping needed at runtime (tasks/page.tsx:309-318 does this but it's fragile)
**Fix:** Normalize Task interface status to `'todo' | 'in_progress' | 'done'` and update UI labels

### BUG-4: Task API path mismatch for lead tasks
**File:** `desktop/src/lib/api/config.ts:139`
**Client path:** `/tasks/leads/:leadId/tasks`
**Backend path:** Tasks routes mounted at `/tasks`, with route `/leads/:leadId/tasks` → effective path is `/tasks/leads/:leadId/tasks`
**Impact:** Appears to match but should be verified — backend mounts taskRoutes under 'tasks' prefix, and route is `GET /leads/:leadId/tasks`, so effective path is `/tasks/leads/:leadId/tasks`
**Fix:** Verify path matches; if backend uses different prefix, update config
