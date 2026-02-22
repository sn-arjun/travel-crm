# Milestone 10: Push Notifications & Auto-Reminders Implementation

## Overview
Milestone 10 implements comprehensive push notifications and auto-reminder functionality for TravelCRM Pro, enabling real-time notifications, user preferences management, and automated reminder cron jobs.

## Completed Implementation

### 1. Core Notification Service
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/services/notification-service.ts`

**Key Features:**
- `notify()` - Central function for sending notifications with preference and quiet hours checks
- `notifyMultiple()` - Send notifications to multiple users simultaneously
- `createInAppNotification()` - Create in-app notification records in database
- `saveNotificationPreferences()` - Save user notification preferences
- `setQuietHours()` - Configure quiet hours for users
- `getNotificationPreferences()` - Retrieve user preferences with defaults
- `getDefaultNotificationPreferences()` - Default notification settings for all types

**Features:**
- Respects user notification preferences (push, in-app, email enabled/disabled)
- Checks quiet hours (time-based suppression)
- Bypasses quiet hours for announcements
- Automatically queues push notifications via PUSH_NOTIFICATION_QUEUE
- Supports notification types: lead_assigned, lead_status_change, follow_up_reminder, payment_received, task_assigned, birthday, invoice_overdue, announcement

### 2. Push Notification Queue Handler
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/queues/push-notification-queue.ts`

**Enhancements:**
- Implements `handlePushJob()` to process push notifications from queue
- `getAllUserTokens()` - Looks up all FCM tokens for a user across all tenant databases
- Multi-device support: sends to all active tokens
- Automatic invalid token cleanup (marks tokens inactive)
- Cross-tenant support via MASTER_DB lookup

**Implementation Details:**
```typescript
// Sends push to all devices
- Queries push_tokens table for active tokens
- Sends to each token via FCM API
- Handles multi-tenant database resolution
```

### 3. Push Token Management Routes
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/routes/push-tokens.ts`

**Endpoints:**
- `POST /api/v1/push-tokens` - Register/update push token
  - Supports upsert: updates if token exists, creates if new
  - Parameters: fcmToken (required), deviceType (android|ios|web), deviceName
  - Returns: token ID, device info, active status

- `GET /api/v1/push-tokens` - List all tokens for current user
  - Returns: list of tokens with device info, active status

- `DELETE /api/v1/push-tokens/:token` - Deregister by token ID
  - Removes token from database

- `DELETE /api/v1/push-tokens/token/:fcmToken` - Deregister by FCM token value
  - Used for logout/device removal
  - Matches tokens by FCM string value

### 4. Notification Preferences Routes
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/routes/notification-preferences.ts`

**Endpoints:**
- `GET /api/v1/notification-preferences/me` - Get user preferences and quiet hours
  - Returns: preference settings for each notification type + quiet hours

- `PUT /api/v1/notification-preferences/me` - Update preferences and/or quiet hours
  - Body: `{ preferences?: {...}, quietHours?: { startHour, endHour } }`
  - Returns: updated settings

- `GET /api/v1/notification-preferences/me/quiet-hours` - Get quiet hours
  - Returns: `{ startHour: number, endHour: number }`

- `PUT /api/v1/notification-preferences/me/quiet-hours` - Set quiet hours
  - Body: `{ startHour, endHour }` (0-23 format)
  - Returns: updated quiet hours

**Preference Types:**
- lead_assigned
- lead_status_change
- follow_up_reminder
- payment_received
- task_assigned
- birthday
- invoice_overdue
- announcement

**Each Type Has:**
- push_enabled: boolean (default: true)
- in_app_enabled: boolean (default: true)
- email_enabled: boolean (default: false)

### 5. Auto-Reminders Cron Jobs
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/cron/auto-reminders.ts`

**Jobs Implemented:**

#### `checkBirthdayAnniversary()`
Runs: Daily at 8 AM
- Queries contacts with birthday/anniversary matching today
- Sends WhatsApp/SMS wishes via SMS_QUEUE
- Creates in-app notifications for admins/managers
- Notifies relevant staff about milestones

#### `checkInvoiceReminders()`
Runs: Daily
- Due in 3 days: email + WhatsApp
- Overdue 1 day: email + WhatsApp
- Overdue 7 days: email + WhatsApp + push to accountant
- Severity-based messaging
- Contact-specific personalization

#### `checkVisaPassportExpiry()`
Runs: Daily
- Visa expiry 30 days: push to salesperson
- Passport expiry 6 months: email to contact
- Tracks document expiries
- Proactive notifications for compliance

#### `checkTripReminders()`
Runs: Daily
- Departure tomorrow: WhatsApp + email summary
- Completed yesterday: feedback request email
- Engagement optimization
- Post-trip follow-up automation

### 6. Enhanced Notifications Routes
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/routes/notifications.ts`

**New Endpoints:**

- `GET /api/v1/notifications/unread-count` - Get unread notification count
  - Returns: `{ unreadCount: number }`

- `GET /api/v1/notifications/badge-counts` - Get all badge counts
  - Returns:
    ```json
    {
      "unreadNotifications": number,
      "overdueFollowups": number,
      "pendingTasks": number,
      "overdueInvoices": number
    }
    ```

- `POST /api/v1/notifications/announce` - Admin announcement
  - Role: admin or sales_manager only
  - Body:
    ```json
    {
      "title": "string",
      "body": "string",
      "target": "all" | "role:admin" | "role:manager" | "user_id1,user_id2"
    }
    ```
  - Features:
    - Bypasses quiet hours for announcements
    - Multi-user targeting
    - Role-based targeting
    - Returns sent count

### 7. Enhanced Follow-Up Reminders Service
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/services/follow-up-reminders.ts`

**Enhancements:**
- Changed from direct `sendPushNotification()` to queue-based via `PUSH_NOTIFICATION_QUEUE`
- Added missed follow-up detection and notification
- Notifies both assignee and manager of missed follow-ups
- Cache-based deduplication using KV store
- Improved data retrieval with lead assignment info

**Notifications:**
- 15 minutes before: push reminder
- At scheduled time: push reminder
- When missed: in-app notification to assignee + manager

### 8. Route Registration & Server Setup
**File:** `/sessions/sleepy-inspiring-feynman/mnt/CRM/backend/src/index.ts`

**Changes:**
- Imported `pushTokenRoutes` from routes/push-tokens
- Imported `preferencesRoutes` from routes/notification-preferences
- Imported auto-reminder cron functions
- Registered routes:
  - `app.route('/api/v1/push-tokens', pushTokenRoutes)`
  - `app.route('/api/v1/notification-preferences', preferencesRoutes)`
- Updated `scheduled()` handler to call all cron jobs
- Maintained backwards compatibility with existing scheduled() calls

**Cron Handler:**
```typescript
// Enhanced to run multiple cron jobs
// - checkFollowUpReminders (every 5 minutes)
// - checkBirthdayAnniversary (daily 8 AM)
// - checkInvoiceReminders (daily)
// - checkVisaPassportExpiry (daily)
// - checkTripReminders (daily)
```

## Database Tables (Already Exist)

### notifications
- id: string
- user_id: string
- title: string
- message: string
- type: string
- reference_type: string
- reference_id: string
- is_read: integer
- created_at: string

### push_tokens
- id: string
- user_id: string
- fcm_token: string (unique per user)
- device_type: string (android, ios, web)
- device_name: string
- is_active: integer
- created_at: string
- updated_at: string

### settings (key-value store)
- key: string (primary key)
- value: string (JSON)
- updated_at: string

**Used Keys:**
- `notification_prefs_{userId}` - User notification preferences (JSON)
- `quiet_hours_{userId}` - User quiet hours config (JSON)

## API Usage Examples

### Register Push Token
```bash
curl -X POST http://localhost:8787/api/v1/push-tokens \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fcmToken": "abc123...",
    "deviceType": "android",
    "deviceName": "Pixel 6"
  }'
```

### Get Notification Preferences
```bash
curl http://localhost:8787/api/v1/notification-preferences/me \
  -H "Authorization: Bearer <token>"
```

### Update Quiet Hours
```bash
curl -X PUT http://localhost:8787/api/v1/notification-preferences/me/quiet-hours \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "startHour": 22, "endHour": 8 }'
```

### Send Announcement
```bash
curl -X POST http://localhost:8787/api/v1/notifications/announce \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "System Maintenance",
    "body": "Scheduled maintenance tonight 10 PM - 12 AM",
    "target": "all"
  }'
```

### Get Badge Counts
```bash
curl http://localhost:8787/api/v1/notifications/badge-counts \
  -H "Authorization: Bearer <token>"
```

## Configuration Requirements

### wrangler.toml
Ensure the following are configured:

```toml
# Queues
[[queues.producers]]
name = "PUSH_NOTIFICATION_QUEUE"

[[queues.consumers]]
queue = "PUSH_NOTIFICATION_QUEUE"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3

# Cron jobs (optional - can be triggered via scheduler)
[env.production]
triggers.crons = [
  "*/5 * * * *",      # Every 5 minutes - follow-up reminders
  "0 8 * * *",        # Daily at 8 AM - birthday reminders
  "0 9 * * *",        # Daily at 9 AM - invoice reminders
  "0 10 * * *"        # Daily at 10 AM - trip reminders
]
```

### Environment Variables
```
FCM_SERVER_KEY=<firebase-server-key>
MASTER_DB=<d1-database>
PUSH_NOTIFICATION_QUEUE=<cloudflare-queue>
```

## Testing Checklist

### Push Token Management
- [ ] Register new push token
- [ ] Update existing token (upsert behavior)
- [ ] List tokens for user
- [ ] Delete token by ID
- [ ] Delete token by FCM value
- [ ] Verify multi-device support

### Notification Preferences
- [ ] Get default preferences
- [ ] Update individual preferences
- [ ] Set quiet hours
- [ ] Get quiet hours
- [ ] Verify preferences persist

### Notifications
- [ ] Create in-app notification
- [ ] Send announcement to all users
- [ ] Send announcement to specific role
- [ ] Send announcement to specific users
- [ ] Verify quiet hours skip (except announcements)
- [ ] Get unread count
- [ ] Get badge counts
- [ ] Mark as read
- [ ] Delete notification

### Cron Jobs
- [ ] Birthday reminders send SMS
- [ ] Invoice reminders send at correct intervals
- [ ] Visa/passport expiry alerts
- [ ] Trip departure reminders
- [ ] Missed follow-up notifications
- [ ] Cache deduplication works

### Queue Processing
- [ ] Push notifications queue and process
- [ ] Multi-device delivery works
- [ ] Invalid tokens handled gracefully
- [ ] Cross-tenant lookups work

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Client (Mobile/Web)                                     │
│  - Register FCM token                                   │
│  - Update preferences                                   │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│ API Routes (REST)                                       │
│  - /push-tokens                                         │
│  - /notification-preferences                            │
│  - /notifications                                       │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│ Notification Service                                    │
│  - Check preferences                                    │
│  - Check quiet hours                                    │
│  - Create in-app notification                           │
│  - Queue push notification                              │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│ Queue (PUSH_NOTIFICATION_QUEUE)                         │
│  - Buffer notifications                                 │
│  - Retry failed sends                                   │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│ Queue Handler                                           │
│  - Look up FCM tokens (multi-tenant)                    │
│  - Send to all user devices                             │
│  - Handle invalid tokens                                │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│ FCM API (Firebase Cloud Messaging)                      │
│  - Deliver push notifications                           │
│  - Track delivery status                                │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Cron Jobs (Scheduled)                                    │
│  - checkFollowUpReminders (5 min)                        │
│  - checkBirthdayAnniversary (8 AM)                       │
│  - checkInvoiceReminders (daily)                         │
│  - checkVisaPassportExpiry (9 AM)                        │
│  - checkTripReminders (10 AM)                            │
└──────────┬───────────────────────────────────────────────┘
           │
           └──→ Query database for due items
               → Send via SMS/Email/Push queues
               → Create in-app notifications
```

## Key Design Decisions

### 1. Preference Storage
- Stored as JSON in `settings` table with key-based lookup
- Defaults built-in to service layer
- Atomic updates via SQL upsert

### 2. Queue-Based Architecture
- All push notifications go through queue for reliability
- Decouples notification generation from delivery
- Enables retry logic and batching

### 3. Multi-Tenant Support
- Cross-tenant token lookup via MASTER_DB
- Each tenant gets complete token coverage
- Supports user sharing across tenants

### 4. Quiet Hours
- User-configurable time windows
- Stored as start/end hours (24-hour format)
- Supports wrapping ranges (e.g., 22:00 to 08:00)
- Bypassed for announcements (high priority)

### 5. Cache Deduplication
- Uses Cloudflare KV for reminder deduplication
- TTL-based expiration
- Prevents duplicate notifications from cron retries

## Future Enhancements

1. **Email Notifications** - Integrate with SendGrid for email channel
2. **SMS Gateway** - Enhanced Twilio integration for SMS reminders
3. **Notification Templates** - Configurable templates per notification type
4. **Rich Notifications** - Add images, deep links, actions
5. **Analytics** - Track notification delivery, opens, clicks
6. **A/B Testing** - Test notification variations
7. **Notification History** - Long-term archival and search
8. **Custom Rules** - User-defined notification rules and workflows
9. **Notification Channels** - Additional channels (SMS, Slack, Teams)
10. **Notification Scheduling** - Schedule notifications for specific times

## Performance Considerations

- **Token Lookup**: O(n) where n = number of tenant DBs (cached via query)
- **Preference Retrieval**: O(1) cached in settings table
- **Queue Processing**: Asynchronous, non-blocking
- **Cron Jobs**: Run on schedule, minimal database load
- **Deduplication**: KV-based, O(1) lookup

## Security

- All endpoints require authentication
- Admin-only announcement endpoint
- User data isolation by tenant
- Token deregistration on logout
- Preference updates authenticated to user
- No sensitive data in push payloads

## Monitoring & Debugging

Enable logs with:
```
console.log('[PUSH QUEUE] ...')
console.log('[NOTIFICATION] ...')
console.log('[CRON] ...')
```

Check:
- Queue size and latency
- FCM API response codes
- Token validity rates
- Cron job execution times
- Failed notification count

## Files Changed

### New Files
1. `/src/services/notification-service.ts` (200+ lines)
2. `/src/routes/push-tokens.ts` (180+ lines)
3. `/src/routes/notification-preferences.ts` (200+ lines)
4. `/src/cron/auto-reminders.ts` (450+ lines)

### Modified Files
1. `/src/queues/push-notification-queue.ts` - Complete implementation
2. `/src/routes/notifications.ts` - Added 3 new endpoints
3. `/src/services/follow-up-reminders.ts` - Enhanced with queue and missed notifications
4. `/src/index.ts` - Registered new routes and cron jobs

## Total Implementation
- **~1300 lines** of new TypeScript code
- **4 new API endpoints** for push token management
- **4 new API endpoints** for notification preferences
- **3 new API endpoints** for notifications (announce, unread-count, badge-counts)
- **4 cron jobs** for auto-reminders
- **Full multi-tenant support**
- **Comprehensive error handling**
- **Queue-based reliable delivery**
