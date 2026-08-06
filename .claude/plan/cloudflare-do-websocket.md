# Implementation Plan: Replace Polling with Cloudflare Durable Objects WebSocket

## Task Type
- [x] Backend (Cloudflare Workers + Durable Objects)
- [x] Frontend (Next.js Desktop Electron App)
- [x] Fullstack (End-to-end real-time pipeline)

---

## Current State Analysis

### Existing Infrastructure (Already Built)
- **RealtimeRoom DO** at `backend/src/durable-objects/realtime.ts` — fully functional per-tenant WebSocket room
- **WebSocket endpoint** at `GET /api/v1/ws?userId=xxx` in `backend/src/index.ts:283-295`
- **wrangler.toml** already has `REALTIME` DO binding with migration `v1`
- **Broadcast helper** already used in `leads.ts` route for lead events
- **Ping/pong heartbeat** already implemented in the DO

### Polling Patterns to Replace (9 found, 6 eligible for WebSocket)

| # | File | Interval | Data | WebSocket Eligible? |
|---|------|----------|------|---------------------|
| 1 | `top-navbar.tsx:147` | 60s | Unread notification count | **YES** — push on new notification |
| 2 | `sidebar.tsx:180` | 90s | Badge counts (tasks, notifications, invoices, followups) | **YES** — push on count change |
| 3 | `campaigns/[id]/page.tsx:131` | 30s | Campaign stats while sending | **YES** — push progress from queue |
| 4 | `import/page.tsx:242` | 2s | Import job progress | **YES** — push from import queue |
| 5 | `settings/export/page.tsx:105` | 3s | Export job status | **YES** — push from export queue |
| 6 | `call-controls-panel.tsx:39,53` | 2s/1s | Call timer (local UI) | **NO** — local timer, not server data |
| 7 | `address-autocomplete.tsx:117` | 200ms | Google Maps API loaded | **NO** — local browser check |
| 8 | `visa/[id]/page.tsx:184` | 200ms | Upload progress (simulated) | **NO** — local visual feedback |
| 9 | `itineraries/[id]/edit/page.tsx:266` | 30s | Auto-save debounce | **NO** — local debounce, not polling |

### Additional Real-Time Opportunities (not currently polled, but should be pushed)
- **Lead CRUD events** — already broadcast via DO (used in leads.ts)
- **New communication received** — should push to conversation page
- **Task status changes** — should push to Kanban board
- **Invoice payment received** — should push to invoice list
- **Visa status updates** — should push to visa Kanban

---

## Technical Solution

### Architecture: Single DO Class + Event Router Pattern

```
┌─────────────────────┐     ┌──────────────────────┐
│   Cloudflare Worker  │────▶│  RealtimeRoom DO     │
│   (Hono routes)      │     │  (per-tenant)        │
│                      │     │                      │
│  POST /broadcast ────┼────▶│  broadcast(event)    │
│                      │     │  sendToUser(event)   │
│  Queue handlers ─────┼────▶│                      │
│  Cron handlers ──────┼────▶│  ┌─ Session Map ──┐  │
│                      │     │  │ userId → WS    │  │
└──────────┬───────────┘     │  │ userId → WS    │  │
           │                 │  └─────────────────┘  │
           │                 └──────────┬─────────────┘
           │                            │ WebSocket frames
           │                            ▼
┌──────────┴───────────────────────────────────────────┐
│                    Desktop App                        │
│                                                       │
│  ┌─ useRealtimeStore (Zustand) ───────────────────┐  │
│  │  ws: WebSocket | null                          │  │
│  │  connected: boolean                            │  │
│  │  subscribe(eventType, handler) → unsubscribe   │  │
│  │  notificationCount: number                     │  │
│  │  badgeCounts: { tasks, notifications, ... }    │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─ useRealtimeEvent(type, handler) ──────────────┐  │
│  │  Hook that subscribes to specific event types   │  │
│  │  Auto-cleanup on unmount                        │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─ RealtimeProvider (in layout.tsx) ─────────────┐  │
│  │  Connects WS on auth, disconnects on logout    │  │
│  │  Auto-reconnect with exponential backoff       │  │
│  │  Ping/pong keepalive (30s interval)            │  │
│  └────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### Event Type Taxonomy

```typescript
// Shared event types (backend + frontend)
type RealtimeEventType =
  // Notifications & Badges
  | 'notification:new'           // New notification created
  | 'notification:read'          // Notification marked as read
  | 'badge_counts:update'        // Badge counts changed

  // Leads
  | 'lead:created'
  | 'lead:updated'
  | 'lead:status_changed'

  // Tasks
  | 'task:assigned'
  | 'task:completed'
  | 'task:status_changed'

  // Invoices & Payments
  | 'payment:received'
  | 'invoice:status_changed'

  // Campaigns
  | 'campaign:progress'          // Batch progress (sent/total)
  | 'campaign:completed'
  | 'campaign:failed'

  // Import/Export
  | 'import:progress'            // { jobId, processed, total, status }
  | 'import:completed'
  | 'import:failed'
  | 'export:progress'
  | 'export:completed'
  | 'export:failed'

  // Communication
  | 'communication:received'     // New message received

  // Visa
  | 'visa:status_changed'

  // System
  | 'connected'                  // Initial connection ack
  | 'pong'                       // Heartbeat response
```

---

## Implementation Steps

### Phase 1: Backend — Extend DO + Add Broadcast Helpers (2-3 hours)

#### Step 1.1: Create broadcast utility
**File:** `backend/src/utils/realtime.ts` (NEW)

```typescript
// Reusable helper so every route/queue doesn't repeat DO lookup logic
export async function broadcastToTenant(
  env: Env,
  tenantId: string,
  event: { type: string; data: Record<string, unknown> },
  options?: { excludeUserId?: string; targetUserId?: string }
): Promise<void> {
  try {
    const roomId = env.REALTIME.idFromName(tenantId);
    const room = env.REALTIME.get(roomId);

    const endpoint = options?.targetUserId
      ? '/send-to-user'
      : '/broadcast';

    await room.fetch(`http://internal${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({
        ...event,
        timestamp: new Date().toISOString(),
        ...(options?.excludeUserId && { excludeUserId: options.excludeUserId }),
        ...(options?.targetUserId && { targetUserId: options.targetUserId }),
      }),
    });
  } catch {
    // Non-critical — don't fail the request if broadcast fails
    console.error(`[realtime] broadcast failed for tenant ${tenantId}:`, event.type);
  }
}
```

#### Step 1.2: Extend RealtimeRoom DO with sendToUser endpoint
**File:** `backend/src/durable-objects/realtime.ts` (MODIFY)

Add a `POST /send-to-user` handler alongside existing `/broadcast`:
```typescript
if (request.method === 'POST' && url.pathname === '/send-to-user') {
  const body = await request.json();
  this.sendToUser(body.targetUserId, body);
  return new Response(JSON.stringify({ success: true }));
}
```

#### Step 1.3: Add broadcast calls to notification creation
**File:** `backend/src/routes/notifications.ts` (MODIFY)

After inserting a notification, call:
```typescript
await broadcastToTenant(c.env, tenantId, {
  type: 'notification:new',
  data: { notification: newNotification },
});
```

After marking notification(s) as read:
```typescript
await broadcastToTenant(c.env, tenantId, {
  type: 'badge_counts:update',
  data: await computeBadgeCounts(db, userId),
}, { targetUserId: userId });
```

#### Step 1.4: Add broadcast calls to queue handlers
**Files:**
- `backend/src/queues/import-queue.ts` (MODIFY) — broadcast `import:progress` per batch, `import:completed`/`import:failed` at end
- `backend/src/queues/export-queue.ts` (MODIFY) — broadcast `export:progress`, `export:completed`/`export:failed`
- `backend/src/queues/campaign-queue.ts` (MODIFY) — broadcast `campaign:progress`, `campaign:completed`/`campaign:failed`

Pattern for queue handlers:
```typescript
// Inside the batch processing loop:
await broadcastToTenant(env, tenantId, {
  type: 'import:progress',
  data: { jobId, processed: currentRow, total: totalRows, status: 'processing' },
});

// At completion:
await broadcastToTenant(env, tenantId, {
  type: 'import:completed',
  data: { jobId, totalProcessed, errors, status: 'completed' },
});
```

#### Step 1.5: Add broadcast calls to existing CRUD routes
**Files to modify** (add broadcast after successful mutations):
- `backend/src/routes/tasks.ts` — `task:assigned`, `task:completed`, `task:status_changed`
- `backend/src/routes/invoices.ts` — `invoice:status_changed`
- `backend/src/routes/payments.ts` — `payment:received`, `badge_counts:update`
- `backend/src/routes/visa.ts` — `visa:status_changed`
- `backend/src/routes/campaigns.ts` — `campaign:progress`
- `backend/src/cron/auto-reminders.ts` — `notification:new` after creating reminder notifications

**Note:** `leads.ts` already broadcasts — no change needed.

#### Step 1.6: Add badge_counts computation helper
**File:** `backend/src/utils/badge-counts.ts` (NEW)

```typescript
export async function computeBadgeCounts(db: D1Database, userId: string) {
  // Same query as GET /notifications/badge-counts endpoint
  // Returns { notifications, tasks, followUps, overdueInvoices }
  const [notifs, tasks, followUps, invoices] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND read=0').bind(userId).first(),
    db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND status='pending'").bind(userId).first(),
    db.prepare("SELECT COUNT(*) as c FROM leads WHERE assigned_to=? AND next_follow_up < datetime('now')").bind(userId).first(),
    db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='overdue'").first(),
  ]);
  return {
    notifications: notifs?.c ?? 0,
    tasks: tasks?.c ?? 0,
    followUps: followUps?.c ?? 0,
    overdueInvoices: invoices?.c ?? 0,
  };
}
```

---

### Phase 2: Frontend — WebSocket Client Infrastructure (2-3 hours)

#### Step 2.1: Create Zustand realtime store
**File:** `desktop/src/stores/realtime-store.ts` (NEW)

```typescript
import { create } from 'zustand';

type EventHandler = (data: any) => void;

interface RealtimeStore {
  ws: WebSocket | null;
  connected: boolean;
  reconnectAttempts: number;
  listeners: Map<string, Set<EventHandler>>;

  connect: (wsUrl: string, token: string, userId: string) => void;
  disconnect: () => void;
  subscribe: (eventType: string, handler: EventHandler) => () => void;

  // Derived counts (updated via WS events)
  notificationCount: number;
  badgeCounts: { notifications: number; tasks: number; followUps: number; overdueInvoices: number };
  setNotificationCount: (count: number) => void;
  setBadgeCounts: (counts: any) => void;
}
```

Key behaviors:
- **Auto-reconnect**: Exponential backoff (1s, 2s, 4s, 8s, max 30s) with jitter
- **Ping keepalive**: Send `{ type: 'ping' }` every 30s; if no pong within 10s, reconnect
- **Auth integration**: Pass JWT token as query param or initial message
- **Graceful degradation**: If WS fails, components fall back to their existing polling

#### Step 2.2: Create useRealtimeEvent hook
**File:** `desktop/src/hooks/use-realtime-event.ts` (NEW)

```typescript
export function useRealtimeEvent(
  eventType: string | string[],
  handler: (data: any) => void,
  deps: any[] = []
) {
  const subscribe = useRealtimeStore(s => s.subscribe);

  useEffect(() => {
    const types = Array.isArray(eventType) ? eventType : [eventType];
    const unsubs = types.map(t => subscribe(t, handler));
    return () => unsubs.forEach(u => u());
  }, [eventType, ...deps]);
}
```

#### Step 2.3: Create RealtimeProvider component
**File:** `desktop/src/components/providers/realtime-provider.tsx` (NEW)

```typescript
// Wraps the app, manages WS lifecycle
// - Reads auth token from useAuthStore
// - Builds WS URL from NEXT_PUBLIC_API_URL (replace http→ws, https→wss)
// - Connects on mount (if authenticated), disconnects on logout
// - Handles visibility change (reconnect when tab becomes visible)
// - Listens for 'notification:new' to increment notificationCount
// - Listens for 'badge_counts:update' to refresh badgeCounts
```

#### Step 2.4: Wire into app layout
**File:** `desktop/src/app/(app)/layout.tsx` (MODIFY)

```tsx
// Add RealtimeProvider inside the auth-protected layout
<KeyboardShortcutsProvider>
  <RealtimeProvider>  {/* NEW */}
    <AppShell>{children}</AppShell>
    <CommandPalette />
  </RealtimeProvider>
</KeyboardShortcutsProvider>
```

---

### Phase 3: Replace Polling in Components (1-2 hours)

#### Step 3.1: Notification Bell — replace 60s polling
**File:** `desktop/src/components/layout/top-navbar.tsx` (MODIFY)

Before:
```typescript
React.useEffect(() => {
  fetchUnreadCount();
  const interval = setInterval(fetchUnreadCount, 60_000);
  return () => clearInterval(interval);
}, [fetchUnreadCount]);
```

After:
```typescript
// Initial fetch
React.useEffect(() => { fetchUnreadCount(); }, []);

// Real-time updates
useRealtimeEvent('notification:new', () => {
  setUnreadCount(prev => prev + 1);
});
useRealtimeEvent('notification:read', () => {
  fetchUnreadCount(); // Refetch exact count
});
useRealtimeEvent('badge_counts:update', (data) => {
  setUnreadCount(data.notifications ?? 0);
});

// Fallback: poll every 5 minutes if WS disconnected
const connected = useRealtimeStore(s => s.connected);
React.useEffect(() => {
  if (connected) return; // WS handles it
  const interval = setInterval(fetchUnreadCount, 300_000);
  return () => clearInterval(interval);
}, [connected]);
```

#### Step 3.2: Sidebar Badge Counts — replace 90s polling
**File:** `desktop/src/components/layout/sidebar.tsx` (MODIFY)

Before:
```typescript
React.useEffect(() => {
  fetchCounts();
  const interval = setInterval(fetchCounts, 90_000);
  return () => clearInterval(interval);
}, [fetchCounts]);
```

After:
```typescript
// Initial fetch
React.useEffect(() => { fetchCounts(); }, []);

// Real-time updates
useRealtimeEvent('badge_counts:update', (data) => {
  setCounts(data);
});
// Also refetch on specific events that affect counts
useRealtimeEvent([
  'task:assigned', 'task:completed',
  'payment:received', 'notification:new',
], () => { fetchCounts(); });

// Fallback polling if WS disconnected
const connected = useRealtimeStore(s => s.connected);
React.useEffect(() => {
  if (connected) return;
  const interval = setInterval(fetchCounts, 90_000);
  return () => clearInterval(interval);
}, [connected]);
```

#### Step 3.3: Campaign Detail — replace 30s polling
**File:** `desktop/src/app/(app)/campaigns/[id]/page.tsx` (MODIFY)

Before:
```typescript
React.useEffect(() => {
  if (campaignStatus !== 'sending' && campaignStatus !== 'running') return;
  const interval = setInterval(() => { refetch(); }, 30_000);
  return () => clearInterval(interval);
}, [campaignStatus, refetch]);
```

After:
```typescript
useRealtimeEvent(['campaign:progress', 'campaign:completed', 'campaign:failed'], (data) => {
  if (data.campaignId === campaignId) {
    refetch(); // Refresh full campaign data
  }
});

// Fallback polling only if WS disconnected
const connected = useRealtimeStore(s => s.connected);
React.useEffect(() => {
  if (connected) return;
  if (campaignStatus !== 'sending' && campaignStatus !== 'running') return;
  const interval = setInterval(() => { refetch(); }, 30_000);
  return () => clearInterval(interval);
}, [connected, campaignStatus, refetch]);
```

#### Step 3.4: Import Progress — replace 2s polling
**File:** `desktop/src/app/(app)/import/page.tsx` (MODIFY)

Before:
```typescript
pollRef.current = setInterval(async () => {
  const res = await importsApi.getProgress(uploadedJobId);
  // ...
}, 2000);
```

After:
```typescript
useRealtimeEvent(['import:progress', 'import:completed', 'import:failed'], (data) => {
  if (data.jobId === uploadedJobId) {
    setProgress(data);
    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      setImportDone(true);
    }
  }
});

// Fallback: poll only if WS disconnected
const connected = useRealtimeStore(s => s.connected);
React.useEffect(() => {
  if (!uploadedJobId || connected) return;
  const poll = setInterval(async () => {
    const res = await importsApi.getProgress(uploadedJobId);
    // ...existing logic
  }, 2000);
  return () => clearInterval(poll);
}, [uploadedJobId, connected]);
```

#### Step 3.5: Export Status — replace 3s polling
**File:** `desktop/src/app/(app)/settings/export/page.tsx` (MODIFY)

Same pattern as import — listen for `export:progress`, `export:completed`, `export:failed` events, with fallback polling when WS is disconnected.

---

### Phase 4: Enhanced Real-Time Features (1-2 hours)

#### Step 4.1: Live list updates
For pages that show lists (leads, tasks, invoices), subscribe to relevant events and prepend/update items:

```typescript
// Example: Tasks Kanban
useRealtimeEvent('task:status_changed', (data) => {
  // Move task card to new column without full refetch
  updateTaskInList(data.taskId, { status: data.newStatus });
});
useRealtimeEvent('task:assigned', (data) => {
  // Add task to current user's view
  if (data.assigneeId === currentUserId) {
    prependTask(data.task);
  }
});
```

#### Step 4.2: Connection status indicator
**File:** `desktop/src/components/layout/connection-status.tsx` (NEW)

Small dot/indicator in the bottom-left of the sidebar showing:
- Green dot: WebSocket connected
- Yellow dot: Reconnecting...
- No dot: Connected via polling (fallback)

#### Step 4.3: Toast notifications for real-time events
In `RealtimeProvider`, show toast for high-priority events:
```typescript
useRealtimeEvent('notification:new', (data) => {
  toast.info(data.notification.title, {
    description: data.notification.body,
    action: { label: 'View', onClick: () => router.push(data.notification.link) },
  });
});
```

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `backend/src/utils/realtime.ts` | **Create** | Broadcast utility (broadcastToTenant helper) |
| `backend/src/utils/badge-counts.ts` | **Create** | Badge count computation helper |
| `backend/src/durable-objects/realtime.ts` | **Modify** | Add /send-to-user endpoint |
| `backend/src/routes/notifications.ts` | **Modify** | Broadcast on notification create/read |
| `backend/src/routes/tasks.ts` | **Modify** | Broadcast on task assign/complete/status |
| `backend/src/routes/invoices.ts` | **Modify** | Broadcast on invoice status change |
| `backend/src/routes/payments.ts` | **Modify** | Broadcast on payment received |
| `backend/src/routes/visa.ts` | **Modify** | Broadcast on visa status change |
| `backend/src/routes/campaigns.ts` | **Modify** | Broadcast on campaign status change |
| `backend/src/queues/import-queue.ts` | **Modify** | Broadcast import progress |
| `backend/src/queues/export-queue.ts` | **Modify** | Broadcast export progress |
| `backend/src/queues/campaign-queue.ts` | **Modify** | Broadcast campaign progress |
| `backend/src/cron/auto-reminders.ts` | **Modify** | Broadcast after creating notifications |
| `desktop/src/stores/realtime-store.ts` | **Create** | Zustand store for WS connection + event dispatch |
| `desktop/src/hooks/use-realtime-event.ts` | **Create** | Hook for subscribing to WS events |
| `desktop/src/components/providers/realtime-provider.tsx` | **Create** | WS lifecycle manager |
| `desktop/src/components/layout/connection-status.tsx` | **Create** | Connection indicator UI |
| `desktop/src/app/(app)/layout.tsx` | **Modify** | Wrap with RealtimeProvider |
| `desktop/src/components/layout/top-navbar.tsx` | **Modify** | Replace 60s polling → WS events |
| `desktop/src/components/layout/sidebar.tsx` | **Modify** | Replace 90s polling → WS events |
| `desktop/src/app/(app)/campaigns/[id]/page.tsx` | **Modify** | Replace 30s polling → WS events |
| `desktop/src/app/(app)/import/page.tsx` | **Modify** | Replace 2s polling → WS events |
| `desktop/src/app/(app)/settings/export/page.tsx` | **Modify** | Replace 3s polling → WS events |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| WebSocket connection fails (firewall, proxy) | **Fallback polling** — every component keeps its old polling logic, activated only when `connected === false` |
| Durable Object cold start latency | Initial connection may take 200-500ms; show "Connecting..." state; first data comes from initial HTTP fetch anyway |
| Stale data if WS message lost | Components do initial HTTP fetch on mount; WS only provides incremental updates |
| Memory leak from event listeners | `useRealtimeEvent` hook auto-unsubscribes on unmount via cleanup function |
| DO instance limit (1000 concurrent connections) | Each tenant gets its own DO instance; 1000 users per tenant is well within limits |
| Reconnection storms after outage | Exponential backoff with random jitter (1-30s) prevents thundering herd |
| Token expiry during long WS sessions | Send token in initial WS handshake; on auth error message, disconnect → refresh token → reconnect |
| Queue handlers don't have Env bindings for DO | Queue consumer handlers receive `env` with DO bindings — verified in wrangler.toml config |
| Double updates (WS + initial fetch race) | Use event timestamps; ignore events older than last known state |

---

## Testing Strategy

1. **Unit tests**: broadcastToTenant utility, badge-counts computation
2. **Integration tests**: Verify DO receives broadcast calls from routes
3. **E2E tests**:
   - Connect WS → create lead → verify WS message received
   - Start import → verify progress events arrive
   - Disconnect WS → verify fallback polling activates
4. **Manual testing**:
   - Open two browser tabs → make change in tab 1 → see update in tab 2
   - Kill WS connection → verify automatic reconnect
   - Test with slow network (Chrome DevTools throttling)

---

## Performance Impact

| Metric | Before (Polling) | After (WebSocket) |
|--------|-------------------|-------------------|
| API calls for 10 idle users/hour | ~720 (notifications) + ~400 (badges) = **1,120 requests** | **~20 requests** (initial fetches + keepalive pongs) |
| Notification latency | 0-60 seconds | **< 100ms** |
| Badge count freshness | 0-90 seconds | **Real-time** |
| Import progress latency | 0-2 seconds | **Instant** |
| Server bandwidth | High (repeated full responses) | Low (small event payloads) |
| Client battery/CPU | High (frequent fetch cycles) | Low (idle WS connection) |

---

## Implementation Order (Recommended)

1. **Phase 1** (Backend): Create utility + extend DO + add broadcasts to routes/queues
2. **Phase 2** (Frontend): Build store + hook + provider → wire into layout
3. **Phase 3** (Replace Polling): One component at a time, each with fallback
4. **Phase 4** (Enhance): Live list updates + connection indicator + toast notifications

**Each phase is independently deployable** — Phase 1 broadcasts to empty rooms (no clients yet), Phase 2 connects but doesn't replace polling yet, Phase 3 switches components one by one.

---

## SESSION_ID
- CODEX_SESSION: N/A (codeagent-wrapper not available)
- GEMINI_SESSION: N/A (codeagent-wrapper not available)
