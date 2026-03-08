#!/usr/bin/env node
/**
 * Generate TravelCRM_PRD_Coverage_Audit.xlsx from PRD-AUDIT-REPORT.md data
 */
import XLSX from 'xlsx';
import { writeFileSync } from 'fs';

// All sections data extracted from PRD-AUDIT-REPORT.md
const sections = [
  {
    name: 'S1: Global Architecture',
    prdRef: '§2',
    items: [
      [1, 'English (en) language', '§2.1', 'Done', 'app_en.arb exists'],
      [2, 'Hindi (hi) language', '§2.1', 'Done', 'app_hi.arb exists'],
      [3, 'Phase 2 languages (ar, es, fr, th, id, tr)', '§2.1', 'Phase 2', 'Not expected yet'],
      [4, 'RTL layout support', '§2.1', 'Phase 2', 'Needed for Arabic'],
      [5, 'Multi-currency support (10 currencies)', '§2.2', 'Done', 'Exchange rate service + API endpoint'],
      [6, 'Multi-timezone support', '§2.3', 'Done', 'UTC storage + per-user tz display'],
      [7, 'Regional tax support (GST/VAT/custom)', '§2.4', 'Done', 'tax-calculator.ts service'],
    ],
  },
  {
    name: 'S2: Auth & Users',
    prdRef: '§3.1',
    items: [
      [8, 'Email + Password login', '§3.1.1', 'Done', 'auth.ts POST /login'],
      [9, 'Phone OTP login (Twilio Verify)', '§3.1.1', 'Done', 'auth.ts POST /send-otp, /verify-otp'],
      [10, 'Multi-tenant login (resolve tenant)', '§3.1.1', 'Done', 'POST /resolve-tenant'],
      [11, 'JWT tokens (access + refresh)', '§3.1.1', 'Done', '15min access + 7-day refresh'],
      [12, 'Session management (view/revoke)', '§3.1.1', 'Done', 'GET/DELETE /sessions'],
      [13, 'Password reset (email-based)', '§3.1.1', 'Done', 'POST /forgot-password, /reset-password'],
      [14, '2FA (TOTP authenticator)', '§3.1.1', 'Phase 2', ''],
      [15, 'Biometric login (Mobile)', '§3.1.1', 'Done', 'biometric_provider.dart'],
      [16, 'RBAC (6 roles)', '§3.1.2', 'Done', 'rbac.ts middleware'],
      [17, 'Custom roles (granular)', '§3.1.2', 'Phase 2', ''],
      [18, 'Add/edit/deactivate users', '§3.1.3', 'Done', 'Full CRUD in users.ts + Flutter + Desktop'],
      [19, 'User profile management', '§3.1.3', 'Done', 'GET/PUT /me, avatar upload'],
      [20, 'Activity log (audit trail)', '§3.1.3', 'Done', 'activity-logs.ts'],
      [21, 'Login history (IP, device)', '§3.1.3', 'Done', 'GET /me/login-history'],
      [22, 'User-level language preference', '§3.1.3', 'Done', 'locale_provider.dart'],
    ],
  },
  {
    name: 'S3: Contact Management',
    prdRef: '§3.2',
    items: [
      [23, 'Add contact (manual)', '§3.2', 'Done', 'Full CRUD, single name field'],
      [24, 'Contact types (Customer/Supplier/Agent/Partner)', '§3.2', 'Done', 'contact_type_badge.dart'],
      [25, 'Full-text search (FTS5)', '§3.2', 'Done', 'Migration 0001_add_contacts_fts.sql'],
      [26, 'Contact filters (type, tags, city)', '§3.2', 'Done', 'GET /filter-options'],
      [27, 'Contact 360 profile page', '§3.2', 'Done', 'contact_detail_screen.dart'],
      [28, 'Duplicate detection', '§3.2', 'Done', 'POST /check-duplicate'],
      [29, 'Merge duplicates', '§3.2', 'Done', 'POST /merge/preview, POST /merge'],
      [30, 'Custom fields (tenant-configurable)', '§3.2', 'Done', 'GET/POST/PUT/DELETE /custom-fields'],
      [31, 'Contact tags (free-form)', '§3.2', 'Done', 'GET /tags, POST /bulk-tag'],
      [32, 'Import from Excel/CSV', '§3.2', 'Done', 'POST /import'],
      [33, 'Export to Excel/CSV', '§3.2', 'Done', 'GET /export'],
      [34, 'Contact sharing', '§3.2', 'Done', 'POST /:id/share'],
      [35, 'Contact source tracking', '§3.2', 'Done', 'source_badge.dart'],
      [36, 'Birthday & anniversary storage', '§3.2', 'Done', 'GET /upcoming-occasions'],
      [37, 'Preferred language per contact', '§3.2', 'Done', 'language_badge.dart'],
      [38, 'Phone with country code picker', '§3.2', 'Done', 'phone_input_widget.dart'],
    ],
  },
  {
    name: 'S4: Lead Management',
    prdRef: '§3.3',
    items: [
      [39, 'Lead creation (all fields)', '§3.3.1', 'Done', 'Full form with destination, pax, budget'],
      [40, 'Lead pipeline - Kanban + List view', '§3.3.2', 'Done', 'lead_pipeline_screen.dart'],
      [41, '8-stage pipeline', '§3.3.2', 'Done', 'New>Contacted>Req Gathered>Proposal>Negotiation>Confirmed>Completed>Lost'],
      [42, 'Auto-assign (round-robin + rules)', '§3.3.3', 'Done', 'lead-assignment.ts'],
      [43, 'Source-based routing', '§3.3.3', 'Done', 'settings.ts routing rules'],
      [44, 'Reassignment with notes', '§3.3.3', 'Done', 'POST /:id/assign'],
      [45, 'Follow-up scheduling', '§3.3.4', 'Done', 'Full CRUD in follow-ups.ts'],
      [46, 'Follow-up reminders (push)', '§3.3.4', 'Done', 'follow-up-reminders.ts cron'],
      [47, 'Auto follow-up sequences', '§3.3.4', 'Done', 'followup_sequences_screen.dart'],
      [48, 'Manager visibility of team follow-ups', '§3.3.4', 'Done', 'my_followups_screen.dart'],
      [49, 'Lead activity timeline', '§3.3.5', 'Done', 'GET /:id/activities'],
      [50, 'Auto lead capture (website webhook)', '§3.3.6', 'Done', 'webhook.ts POST /leads/webhook'],
      [51, 'Facebook/Google lead capture', '§3.3.6', 'Partial', 'Webhook exists; no native FB/Google integrations'],
      [52, 'Lead scoring (AI-based)', '§3.3.7', 'Done', 'AI intelligence routes'],
      [53, 'Bulk actions (assign, status, delete)', '—', 'Done', 'POST /bulk-assign, /bulk-status, /bulk-delete'],
      [54, 'Lost reason tracking', '§3.3.2', 'Done', 'lost_reason_dialog.dart'],
    ],
  },
  {
    name: 'S5: Itinerary & Quotation',
    prdRef: '§3.4',
    items: [
      [55, 'Day-wise itinerary builder', '§3.4.1', 'Done', 'itinerary_builder_screen.dart'],
      [56, 'Rich text descriptions', '§3.4.1', 'Done', 'Item descriptions support formatting'],
      [57, 'Include/exclude section', '§3.4.1', 'Done', 'inclusions_exclusions_editor.dart'],
      [58, 'Terms & conditions', '§3.4.1', 'Done', 'terms_editor.dart'],
      [59, 'Version control (V2, V3)', '§3.4.1', 'Done', 'POST /:id/new-version'],
      [60, 'Clone itinerary', '§3.4.1', 'Done', 'POST /:id/clone'],
      [61, 'Itinerary templates', '§3.4.1', 'Done', 'itinerary-templates.ts'],
      [62, 'Hotel/transport/flight/activity details', '§3.4.1', 'Done', 'item_form.dart supports all types'],
      [63, 'Pre-stored rate cards', '§3.4.2', 'Done', 'rate-cards.ts'],
      [64, 'Auto-price from rate cards', '§3.4.2', 'Done', 'GET /rate-cards/lookup'],
      [65, 'Markup management (% or fixed)', '§3.4.2', 'Done', 'In itinerary pricing'],
      [66, 'Tax calculation (GST/VAT)', '§3.4.2', 'Done', 'tax-calculator.ts'],
      [67, 'Currency conversion (live rates)', '§3.4.2', 'Done', 'exchange-rate.ts'],
      [68, 'Quotation PDF (branded)', '§3.4.3', 'Done', 'pdf_generator.dart'],
      [69, 'Email/WhatsApp share', '§3.4.3', 'Done', 'POST /:id/send'],
      [70, 'Shareable web link', '§3.4.3', 'Done', 'POST /:id/share-link'],
      [71, 'Drag-and-drop reorder', '§3.4.1', 'Partial', 'Day/item panels exist; native DnD may be limited'],
      [72, 'Image attachments per day', '§3.4.1', 'Partial', 'File system exists; per-item image upload not confirmed'],
    ],
  },
  {
    name: 'S6: Invoicing & Billing',
    prdRef: '§3.5',
    items: [
      [73, 'Invoice types (Tax/Proforma/Receipt/Credit/Debit)', '§3.5.1', 'Done', 'invoices + credit-notes routes'],
      [74, 'Auto invoice numbering (configurable)', '§3.5.1', 'Done', 'numbering.ts service'],
      [75, 'GST calculation (CGST/SGST/IGST)', '§3.5.1', 'Done', 'tax-calculator.ts'],
      [76, 'Line items (qty, rate, discount, tax)', '§3.5.1', 'Done', 'line_item_editor.dart'],
      [77, 'Invoice PDF (branded, GST-compliant)', '§3.5.1', 'Done', 'PDF generation in Flutter + Desktop'],
      [78, 'Email invoice', '§3.5.1', 'Done', 'POST /:id/send'],
      [79, 'Invoice from itinerary', '§3.5.1', 'Done', 'Auto-generate from itinerary data'],
      [80, 'Multi-currency invoices', '§3.5.2', 'Done', 'Exchange rate integration'],
      [81, 'Custom tax labels', '§3.5.2', 'Done', 'Configurable per tenant'],
      [82, 'Record payments (manual, partial)', '§3.5.4', 'Done', 'payments.ts full CRUD'],
      [83, 'Payment reminders (auto)', '§3.5.4', 'Done', 'Cron: checkInvoiceReminders hourly'],
      [84, 'Credit notes', '§3.5.3', 'Done', 'credit-notes.ts'],
      [85, 'Ageing report', '§3.5.4', 'Done', 'ageing_report_screen.dart'],
      [86, 'Outstanding dashboard', '§3.5.4', 'Done', 'Part of invoice list'],
      [87, 'Supplier payments tracking', '§3.5.4', 'Done', 'Supplier ledger endpoints'],
      [88, 'Recurring invoices', '§3.5.1', 'Phase 2', ''],
    ],
  },
  {
    name: 'S7: Voucher Management',
    prdRef: '§3.6',
    items: [
      [89, 'Hotel voucher', '§3.6.1', 'Done', 'vouchers.ts + voucher_form_screen.dart'],
      [90, 'Transport/service voucher', '§3.6.2', 'Done', 'Voucher types supported'],
      [91, 'Flight voucher', '§3.6.3', 'Done', ''],
      [92, 'Activity/excursion voucher', '§3.6.4', 'Done', ''],
      [93, 'Branded PDF generation', '§3.6', 'Done', 'PDF export via vouchersApi.getPdf'],
      [94, 'Email/WhatsApp send', '§3.6', 'Done', 'vouchersApi.send with dialog'],
      [95, 'Create from itinerary item', '—', 'Done', 'POST /from-itinerary-item'],
    ],
  },
  {
    name: 'S8: Communication Hub',
    prdRef: '§3.7',
    items: [
      [96, 'WhatsApp messaging (send text/images/docs)', '§3.7.1', 'Done', 'POST /send-whatsapp'],
      [97, 'WhatsApp template messages', '§3.7.1', 'Done', 'templates.ts route'],
      [98, 'WhatsApp conversation log', '§3.7.1', 'Done', 'GET /communications'],
      [99, 'Bulk WhatsApp', '§3.7.1', 'Done', 'POST /send-bulk-sms + WhatsApp campaigns'],
      [100, 'SMS integration', '§3.7.2', 'Done', 'POST /send-sms'],
      [101, 'SMS templates', '§3.7.2', 'Done', 'Template system supports SMS'],
      [102, 'Bulk SMS', '§3.7.2', 'Done', 'POST /send-bulk-sms'],
      [103, 'Email integration (HTML emails)', '§3.7.3', 'Done', 'POST /send-email via SendGrid'],
      [104, 'Email tracking (open/click)', '§3.7.3', 'Done', 'SendGrid webhooks'],
      [105, 'Bulk email campaigns', '§3.7.3', 'Done', 'Campaign system'],
      [106, 'Push notifications (FCM)', '§3.7.4', 'Done', 'fcm.ts + push-notification-queue.ts'],
      [107, 'Lead assignment notification', '§3.7.4', 'Done', ''],
      [108, 'Follow-up reminder notification', '§3.7.4', 'Done', ''],
      [109, 'Quiet hours', '§3.7.4', 'Done', 'GET/PUT /me/quiet-hours'],
      [110, 'Notification preferences', '§3.7.4', 'Done', 'notification_preferences_screen.dart'],
      [111, 'Message templates (variable substitution)', '§3.7.5', 'Done', 'template-engine.ts'],
      [112, 'Custom announcements', '§3.7.4', 'Done', 'POST /announce'],
      [113, 'Unsubscribe management (CAN-SPAM/GDPR)', '§3.7.3', 'Done', 'opt-out.ts marketing route'],
    ],
  },
  {
    name: 'S9: Supplier Management',
    prdRef: '§3.8',
    items: [
      [114, 'Supplier profile (CRUD)', '§3.8', 'Done', 'suppliers.ts + Desktop create form'],
      [115, 'Supplier categories', '§3.8', 'Done', 'Hotel, Transport, Airline, Activity, etc.'],
      [116, 'Supplier rate cards', '§3.8', 'Done', 'Supplier rate card endpoints'],
      [117, 'Rate comparison', '§3.8', 'Done', 'rate_comparison_screen.dart'],
      [118, 'Supplier payments tracking', '§3.8', 'Done', 'Supplier ledger + payments'],
      [119, 'Supplier documents', '§3.8', 'Done', 'Document management'],
      [120, 'Supplier ledger', '§3.8', 'Done', 'Full payment history'],
      [121, 'Supplier rating', '§3.8', 'Done', 'Rating data model exists'],
    ],
  },
  {
    name: 'S10: Visa & Travellers',
    prdRef: '§3.9',
    items: [
      [122, 'Traveller profile (passport, preferences)', '§3.9.1', 'Done', 'travellers.ts + Desktop detail page'],
      [123, 'Visa application tracker', '§3.9.2', 'Done', 'visa.ts'],
      [124, 'Country-specific checklists', '§3.9.2', 'Done', 'Checklist endpoint'],
      [125, 'Checklist progress tracking', '§3.9.2', 'Done', 'PATCH /:visaId/checklist/:itemId'],
      [126, 'Visa status pipeline', '§3.9.2', 'Done', 'visa_dashboard_screen.dart'],
      [127, 'Visa expiry tracking', '§3.9.2', 'Done', 'Cron: checkVisaPassportExpiry daily'],
      [128, 'Bulk visa tracking', '§3.9.2', 'Done', 'visa_list_screen.dart'],
      [129, 'Document upload per visa', '§3.9.2', 'Done', 'Document system integration'],
    ],
  },
  {
    name: 'S11: Planner & Tasks',
    prdRef: '§3.10',
    items: [
      [130, 'Calendar views (day/week/month)', '§3.10.1', 'Done', 'calendar_screen.dart'],
      [131, 'Event types (trip, meeting, follow-up)', '§3.10.1', 'Done', 'event.dart model'],
      [132, 'Recurring events', '§3.10.1', 'Done', 'recurrence-engine.ts'],
      [133, 'Color coding per type', '§3.10.1', 'Done', ''],
      [134, 'Drag-and-drop reschedule', '§3.10.1', 'Done', 'PATCH /:id/reschedule'],
      [135, 'Task management (CRUD)', '§3.10.2', 'Done', 'tasks.ts + Desktop kanban'],
      [136, 'Task statuses (To Do > In Progress > Done)', '§3.10.2', 'Done', 'PATCH /:id/status'],
      [137, 'Task linked to lead', '§3.10.2', 'Done', 'GET /leads/:leadId/tasks'],
      [138, 'Subtasks', '§3.10.2', 'Done', 'GET /:id/subtasks'],
      [139, 'Task comments', '§3.10.2', 'Done', 'POST/GET/PUT/DELETE /:taskId/comments'],
      [140, 'Overdue tracking', '§3.10.2', 'Done', 'processOverdueTasks() cron'],
      [141, 'Google Calendar sync', '§3.10.1', 'Phase 2', ''],
    ],
  },
  {
    name: 'S12: Reports & Analytics',
    prdRef: '§3.11',
    items: [
      [142, 'Sales summary report', '§3.11.1', 'Done', 'sales_summary_report_screen.dart'],
      [143, 'Lead conversion / Win-Loss', '§3.11.1', 'Done', 'win_loss_report_screen.dart'],
      [144, 'Revenue summary', '§3.11.1', 'Done', 'revenue_summary_report_screen.dart'],
      [145, 'Pipeline summary', '§3.11.1', 'Done', 'pipeline_summary_report_screen.dart'],
      [146, 'Lead ageing', '§3.11.1', 'Done', 'lead_ageing_report_screen.dart'],
      [147, 'Lead velocity', '§3.11.1', 'Done', 'lead_velocity_report_screen.dart'],
      [148, 'Collections report', '§3.11.1', 'Done', 'collections_report_screen.dart'],
      [149, 'Tax report (GST/VAT)', '§3.11.1', 'Done', 'tax_report_screen.dart'],
      [150, 'Team performance', '§3.11.1', 'Done', 'team_performance_report_screen.dart'],
      [151, 'Customer LTV', '§3.11.1', 'Done', 'customer_ltv_report_screen.dart'],
      [152, 'Fleet utilization', '§3.11.1', 'Done', 'fleet_utilization_report_screen.dart'],
      [153, 'Supplier usage', '§3.11.1', 'Done', 'supplier_usage_report_screen.dart'],
      [154, 'Visa status report', '§3.11.1', 'Done', 'visa_status_report_screen.dart'],
      [155, 'Campaign performance', '§3.11.1', 'Done', 'campaign_performance_report_screen.dart'],
      [156, 'Export to Excel/PDF', '§3.11.2', 'Done', 'excel-export.ts, pdf-export.ts'],
      [157, 'Date range filters', '§3.11.2', 'Done', 'All reports support date filtering'],
      [158, 'Charts (bar, line, pie, area)', '§3.11.2', 'Done', 'report_bar_chart.dart, etc.'],
      [159, 'Report caching (5min KV)', '§3.11.2', 'Done', 'report-cache.ts'],
      [160, 'Scheduled reports (auto-email)', '§3.11.2', 'Phase 2', ''],
    ],
  },
  {
    name: 'S13: Marketing & Promotions',
    prdRef: '§3.12',
    items: [
      [161, 'Promotion flyer builder', '§3.12.1', 'Done', 'flyer_editor_screen.dart'],
      [162, 'Template library', '§3.12.1', 'Done', 'template_gallery_screen.dart'],
      [163, 'Image library', '§3.12.1', 'Done', 'images.ts marketing route'],
      [164, 'Brand consistency (logo, colors)', '§3.12.1', 'Done', 'branding.ts'],
      [165, 'Social media sizes', '§3.12.1', 'Done', 'size_preset_selector.dart'],
      [166, 'Quick create (30-sec flyer)', '§3.12.1', 'Done', 'quick_create_screen.dart'],
      [167, 'Contact segments', '§3.12.2', 'Done', 'segments.ts'],
      [168, 'Bulk WhatsApp/SMS/Email', '§3.12.2', 'Done', 'Campaign system'],
      [169, 'Schedule sending', '§3.12.2', 'Done', 'Campaign scheduling'],
      [170, 'Opt-out management', '§3.12.2', 'Done', 'opt-out.ts route'],
      [171, 'Birthday/Anniversary auto-send', '§3.12.3', 'Done', 'Cron: checkBirthdayAnniversary daily'],
      [172, 'Invoice overdue reminders', '§3.12.3', 'Done', 'Cron: checkInvoiceReminders hourly'],
      [173, 'Visa expiry alerts', '§3.12.3', 'Done', 'Cron: checkVisaPassportExpiry daily'],
      [174, 'Trip departure reminder', '§3.12.3', 'Done', 'Cron: checkTripReminders daily'],
    ],
  },
  {
    name: 'S14: Import/Export',
    prdRef: '§3.13',
    items: [
      [175, 'Excel/CSV import (contacts, leads)', '§3.13.1', 'Done', 'imports.ts'],
      [176, 'Column mapping UI', '§3.13.1', 'Done', 'step_2_mapping.dart'],
      [177, 'Data validation before import', '§3.13.1', 'Done', 'import-validator.ts'],
      [178, 'Duplicate handling', '§3.13.1', 'Done', 'duplicate-detector.ts'],
      [179, 'Preview rows', '§3.13.1', 'Done', 'step_3_preview.dart'],
      [180, 'Error export (download failures)', '§3.13.1', 'Done', 'GET /:id/errors/download'],
      [181, 'Template download', '§3.13.1', 'Done', 'GET /templates/:type'],
      [182, 'Export contacts to Excel', '§3.13.2', 'Done', 'GET /exports/contacts'],
      [183, 'Export leads to Excel', '§3.13.2', 'Done', 'GET /exports/leads'],
      [184, 'Bulk invoice PDF (zip)', '§3.13.2', 'Done', 'POST /exports/invoices/bulk-pdf'],
      [185, 'Full data export (GDPR)', '§3.13.2', 'Done', 'POST /exports/full'],
    ],
  },
  {
    name: 'S15: Fleet & Drivers',
    prdRef: '§3.14',
    items: [
      [186, 'Vehicle management (CRUD)', '§3.14.1', 'Done', 'fleet.ts'],
      [187, 'Vehicle types (sedan, SUV, bus)', '§3.14.1', 'Done', ''],
      [188, 'Vehicle status (Available/On Trip/Maintenance)', '§3.14.1', 'Done', 'PUT /vehicles/:id/status'],
      [189, 'Vehicle documents + expiry tracking', '§3.14.1', 'Done', 'GET /documents/expiring'],
      [190, 'Maintenance schedule', '§3.14.1', 'Done', 'GET /maintenance/due'],
      [191, 'Availability calendar', '§3.14.1', 'Done', 'vehicle_availability_calendar.dart'],
      [192, 'Driver management (CRUD)', '§3.14.2', 'Done', 'Single name field matching backend'],
      [193, 'Driver documents + expiry tracking', '§3.14.2', 'Done', ''],
      [194, 'Driver schedule calendar', '§3.14.2', 'Done', 'driver_schedule_calendar.dart'],
      [195, 'Trip assignment (vehicle + driver)', '§3.14.3', 'Done', 'trip_form_screen.dart'],
      [196, 'Trip status pipeline', '§3.14.3', 'Done', 'PUT /trips/:id/status'],
      [197, 'Check-in/Check-out (GPS + timestamp)', '§3.14.3', 'Done', 'POST /trips/:id/check-in, /check-out'],
      [198, 'Trip timeline', '§3.14.3', 'Done', 'GET /trips/:id/timeline'],
      [199, 'Trip cost tracking', '§3.14.3', 'Done', 'trip-cost-calculator.ts'],
      [200, 'Vehicle rate cards', '§3.14', 'Done', 'vehicle_rate_card_list/form_screen.dart'],
      [201, 'Fleet dashboard', '§3.14', 'Done', 'fleet_dashboard_screen.dart'],
      [202, 'Fleet alerts', '§3.14', 'Done', 'processFleetAlerts() cron'],
    ],
  },
  {
    name: 'S16: Bookmarks & Notes',
    prdRef: '§3.15',
    items: [
      [203, 'Bookmark any entity', '§3.15.1', 'Done', 'bookmarks.ts'],
      [204, 'Bookmarks page', '§3.15.1', 'Done', 'bookmarks_screen.dart'],
      [205, 'Sticky notes (color-coded)', '§3.15.2', 'Done', 'sticky-notes.ts'],
    ],
  },
  {
    name: 'S17: Documents',
    prdRef: '§3.16',
    items: [
      [206, 'Upload files (PDF, images, Excel)', '§3.16', 'Done', 'documents.ts POST /upload'],
      [207, 'Files linked to Contact/Lead/Supplier', '§3.16', 'Done', 'Entity-linked storage'],
      [208, 'File preview + download', '§3.16', 'Done', 'GET /:id/download'],
      [209, 'Share via WhatsApp/Email', '§3.16', 'Done', 'Communication hub integration'],
    ],
  },
  {
    name: 'S18: WordPress Landing',
    prdRef: '§3.17',
    items: [
      [210, 'One-click WP site creation', '§3.17', 'Done', 'wp-provision-queue.ts'],
      [211, 'Custom subdomain', '§3.17', 'Done', 'Terraform Cloudflare config'],
      [212, 'Enquiry form > auto-create lead', '§3.17', 'Done', 'webhook.ts POST /leads/webhook'],
      [213, 'SSL auto-provisioning', '§3.17', 'Done', 'Caddy + Let\'s Encrypt'],
    ],
  },
  {
    name: 'S19: Super Admin Portal',
    prdRef: '§4',
    items: [
      [214, 'Tenant dashboard (MRR, churn, growth)', '§4.1', 'Done', 'Super-admin Next.js app'],
      [215, 'Onboard new tenant (wizard)', '§4.1', 'Done', ''],
      [216, 'One-click WordPress provisioning', '§4.1', 'Done', ''],
      [217, 'Manage tenants (CRUD)', '§4.1', 'Done', ''],
      [218, 'Subscription management', '§4.1', 'Done', 'Master DB subscriptions table'],
      [219, 'Feature flags per tenant', '§4.1', 'Done', 'feature-flags-panel.tsx'],
      [220, 'Usage analytics per tenant', '§4.1', 'Done', 'Usage snapshots'],
      [221, 'Announcements', '§4.1', 'Done', ''],
      [222, 'Support tickets', '§4.1', 'Done', 'Migration 0005'],
      [223, 'Audit log', '§4.1', 'Done', ''],
      [224, 'API keys + webhook log', '§4.1', 'Done', 'Migration 0007'],
      [225, 'AI/VoIP controls per tenant', '—', 'Done', 'Migration 0008 + ai-voip-panel.tsx'],
      [226, 'Usage caps (daily/monthly)', '—', 'Done', 'usage-cap.ts middleware'],
      [227, 'Feature gates on routes', '—', 'Done', 'feature-gate.ts middleware'],
    ],
  },
  {
    name: 'S20: Driver App',
    prdRef: '§5',
    items: [
      [228, 'Phone OTP login', '§5.1', 'Done', 'driver.ts POST /login, /login/verify'],
      [229, 'My trips (upcoming, today, past)', '§5.1', 'Done', 'GET /trips'],
      [230, 'Trip details', '§5.1', 'Done', 'GET /trips/:id'],
      [231, 'Accept / Reject trips', '§5.1', 'Done', 'POST /trips/:id/accept, /reject'],
      [232, 'Check-in / Check-out (GPS)', '§5.1', 'Done', 'POST /trips/:id/check-in, /check-out'],
      [233, 'Trip status updates', '§5.1', 'Done', 'POST /trips/:id/status'],
      [234, 'Profile management', '§5.1', 'Done', 'GET/PUT /profile'],
      [235, 'Document upload', '§5.1', 'Done', 'POST /profile/documents'],
      [236, 'Push notifications', '§5.1', 'Done', 'POST/DELETE /push-tokens'],
      [237, 'Driver earnings', '§5.1', 'Phase 2', ''],
    ],
  },
  {
    name: 'S21: VoIP Calling',
    prdRef: '§11.1',
    items: [
      [238, 'Click-to-call (outbound)', '§11.1.1', 'Done', 'POST /calls/outbound'],
      [239, 'In-app calling', '§11.1.1', 'Done', 'in_call_screen.dart'],
      [240, 'Click-to-call button on contact/lead', '§11.1.1', 'Done', 'click_to_call_button.dart'],
      [241, 'Dial pad', '§11.1.1', 'Done', 'dial_pad_screen.dart'],
      [242, 'Call transfer', '§11.1.1', 'Done', 'POST /:id/transfer'],
      [243, 'Inbound calling (IVR)', '§11.1.2', 'Done', 'VoIP callbacks + IVR handler'],
      [244, 'Smart routing (caller-based)', '§11.1.2', 'Done', 'call-routing.ts'],
      [245, 'Missed call alerts', '§11.1.2', 'Done', 'missed-call-handler.ts'],
      [246, 'Voicemail (record + transcribe)', '§11.1.2', 'Done', 'Voicemail callback routes'],
      [247, 'Business hours routing', '§11.1.2', 'Done', 'business-hours.ts'],
      [248, 'Call recording', '§11.1.3', 'Done', 'Recording callback + R2 storage'],
      [249, 'Call log (history per contact)', '§11.1.3', 'Done', 'call_log_screen.dart'],
      [250, 'Call outcome tagging', '§11.1.3', 'Done', 'PUT /:id (outcome field)'],
      [251, 'Call analytics', '§11.1.3', 'Done', 'GET /analytics'],
      [252, 'Multi-number support', '§11.1.3', 'Done', 'number_management_screen.dart'],
      [253, 'VoIP provider abstraction (Twilio+Plivo)', '—', 'Done', 'voip-provider.ts factory pattern'],
      [254, 'Plivo integration (78% cheaper)', '—', 'Done', 'plivo-voice.ts, plivo-messaging.ts'],
    ],
  },
  {
    name: 'S22: AI Call Intelligence',
    prdRef: '§11.2',
    items: [
      [255, 'Call transcription (Deepgram)', '§11.2.1', 'Done', 'deepgram.ts + transcripts.ts'],
      [256, 'Multi-language transcription', '§11.2.1', 'Done', 'Deepgram multi-lang'],
      [257, 'Transcript search (full-text)', '§11.2.1', 'Done', 'transcript_search_screen.dart'],
      [258, 'Transcript editing', '§11.2.1', 'Done', 'PUT /transcripts/:callLogId'],
      [259, 'AI auto lead capture from calls', '§11.2.2', 'Done', 'ai-extractions.ts'],
      [260, 'Confidence scoring', '§11.2.2', 'Done', 'Part of extraction model'],
      [261, 'One-click confirm extracted data', '§11.2.2', 'Done', 'POST /:id/confirm'],
      [262, 'AI call summary', '§11.2.3', 'Done', 'Part of extraction'],
      [263, 'Sentiment analysis', '§11.2.3', 'Done', 'AI intelligence service'],
      [264, 'Auto-create follow-up from call', '§11.2.3', 'Done', 'Automation in calls.ts'],
      [265, 'Auto-update lead status from call', '—', 'Done', 'Automation in calls.ts'],
    ],
  },
  {
    name: 'S23: AI Assistant',
    prdRef: '§11.3',
    items: [
      [266, 'Natural language lead creation', '§11.3.1', 'Done', 'POST /ai/extract-lead'],
      [267, 'WhatsApp message > Lead', '§11.3.1', 'Done', 'POST /ai/parse-whatsapp'],
      [268, 'Email > Lead', '§11.3.1', 'Done', 'POST /ai/parse-email'],
      [269, 'Business card scan (OCR)', '§11.3.1', 'Done', 'POST /ai/scan-business-card'],
      [270, 'Bulk lead parsing', '§11.3.1', 'Done', 'POST /ai/parse-bulk-leads'],
      [271, 'AI itinerary generator', '§11.3.2', 'Done', 'POST /ai/generate-itinerary'],
      [272, 'AI itinerary enrichment', '§11.3.2', 'Done', 'POST /ai/enrich-itinerary'],
      [273, 'AI invoice generator', '§11.3.3', 'Done', 'POST /ai/generate-invoice'],
      [274, 'AI communication composer', '§11.3.4', 'Done', 'POST /ai/compose-message'],
      [275, 'Smart reply suggestions', '§11.3.4', 'Done', 'POST /ai/suggest-replies'],
      [276, 'Natural language CRM queries', '§11.3.5', 'Done', 'POST /ai/intelligence/nl-query'],
      [277, 'AI generated content review', '—', 'Done', 'GET/POST /ai/generated/:id/accept, /reject'],
      [278, 'AI hub screen', '—', 'Done', 'ai_hub_screen.dart'],
    ],
  },
  {
    name: 'S24: AI Automations',
    prdRef: '§11.4',
    items: [
      [279, 'AI lead scoring (enhanced)', '§11.4.1', 'Done', 'AI intelligence lead-score endpoints'],
      [280, 'AI smart follow-up sequences', '§11.4.2', 'Done', 'Smart-followup endpoints'],
      [281, 'Passport OCR', '§11.4.3', 'Done', 'POST /ai/intelligence/ocr/passport'],
      [282, 'Visa document classification', '§11.4.3', 'Done', 'POST /ai/intelligence/ocr/visa-classify'],
      [283, 'Supplier invoice OCR', '§11.4.3', 'Done', 'POST /ai/intelligence/ocr/supplier-invoice'],
      [284, 'Document scan review', '§11.4.3', 'Done', 'GET/POST document-scans/:id/apply, /reject'],
    ],
  },
  {
    name: 'S25: AI Chatbot',
    prdRef: '§11.5',
    items: [
      [285, 'Website chatbot config', '§11.5.1', 'Done', 'chatbot.ts'],
      [286, 'Chatbot conversations', '§11.5.1', 'Done', 'chatbot_conversations_screen.dart'],
      [287, 'Human handoff', '§11.5.1', 'Done', 'POST /conversations/:id/handoff'],
      [288, 'Create lead from chatbot', '§11.5.1', 'Done', 'POST /conversations/:id/create-lead'],
      [289, 'Chatbot analytics', '§11.5.1', 'Done', 'GET /chatbot/analytics'],
      [290, 'Multi-channel (website + WhatsApp)', '§11.5', 'Done', 'Config per channel'],
    ],
  },
  {
    name: 'S26: AI Business Intelligence',
    prdRef: '§11.6',
    items: [
      [291, 'AI daily business briefing', '§11.6.1', 'Done', 'GET/POST /ai/bi/briefings'],
      [292, 'Business health score (0-100)', '§11.6.6', 'Done', 'GET /ai/bi/health-score'],
      [293, 'Revenue pulse', '§11.6.6', 'Done', 'GET /ai/bi/revenue-pulse'],
      [294, 'Destination profitability', '§11.6.2', 'Done', 'GET /ai/bi/destination-profitability'],
      [295, 'Seasonal demand prediction', '§11.6.2', 'Done', 'GET /ai/bi/seasonal-demand'],
      [296, 'Customer LTV prediction', '§11.6.4', 'Done', 'GET /ai/bi/customer-ltv/:contactId'],
      [297, 'Cash flow forecast', '§11.6.1', 'Done', 'GET /ai/bi/cash-flow-forecast'],
      [298, 'Team performance analysis', '§11.6.3', 'Done', 'GET /ai/bi/team-performance'],
      [299, 'Workload analysis', '§11.6.3', 'Done', 'GET /ai/bi/workload-analysis'],
      [300, 'Customer segmentation (AI)', '§11.6.4', 'Done', 'POST /ai/bi/customer-segments/calculate'],
      [301, 'Trending destinations', '§11.6.5', 'Done', 'GET /ai/bi/trending-destinations'],
      [302, 'Lost deal analysis', '§11.6.5', 'Done', 'GET /ai/bi/lost-deal-analysis'],
      [303, 'Lead source ROI', '§11.6.5', 'Done', 'GET /ai/bi/lead-source-roi'],
      [304, 'AI recommendations feed', '§11.6.6', 'Done', 'POST /ai/bi/recommendations/generate'],
      [305, 'AI usage tracking/metering', '§11.7.6', 'Done', 'ai_usage_screen.dart + GET /ai/bi/usage'],
    ],
  },
  {
    name: 'S27: Additional (Beyond PRD)',
    prdRef: '—',
    items: [
      [306, 'WhatsApp bulk campaigns', '—', 'Done', 'whatsapp-campaigns.ts (10 endpoints)'],
      [307, 'AI social content generation', '—', 'Done', 'social-content.ts'],
      [308, 'AI marketing suggestions', '—', 'Done', 'marketing-suggestions.ts'],
      [309, 'Extraction > Create Itinerary', '—', 'Done', 'POST /ai/extractions/:id/create-itinerary'],
      [310, 'Extraction > Create Invoice', '—', 'Done', 'POST /ai/extractions/:id/create-invoice'],
      [311, 'Extraction > Schedule Follow-up', '—', 'Done', 'POST /ai/extractions/:id/schedule-followup'],
      [312, 'Call quick actions API', '—', 'Done', 'GET /calls/:id/actions'],
      [313, 'VoIP usage cap enforcement', '—', 'Done', 'usage-cap.ts middleware'],
      [314, 'WebSocket real-time updates', '—', 'Done', '/api/v1/ws endpoint'],
      [315, 'Rate limiter middleware', '—', 'Done', 'rate-limit.ts'],
      [316, 'Input validation middleware', '—', 'Done', 'input-validation.ts'],
      [317, 'Sanitization utilities', '—', 'Done', 'sanitize.ts'],
    ],
  },
];

// Color fills
const greenFill = { fgColor: { rgb: 'C6EFCE' } };
const yellowFill = { fgColor: { rgb: 'FFEB9C' } };
const redFill = { fgColor: { rgb: 'FFC7CE' } };
const blueFill = { fgColor: { rgb: 'BDD7EE' } };
const headerFill = { fgColor: { rgb: '4472C4' } };

const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 };
const boldFont = { bold: true, sz: 11 };

function statusFill(status) {
  switch (status) {
    case 'Done': return greenFill;
    case 'Partial': return yellowFill;
    case 'Missing': return redFill;
    case 'Phase 2': return blueFill;
    default: return {};
  }
}

function statusSymbol(status) {
  switch (status) {
    case 'Done': return 'Done';
    case 'Partial': return 'Partial';
    case 'Missing': return 'Missing';
    case 'Phase 2': return 'Phase 2';
    default: return status;
  }
}

// Create workbook
const wb = XLSX.utils.book_new();

// ── Sheet 1: Full Feature List ──
const allRows = [['#', 'Section', 'Feature', 'PRD Ref', 'Status', 'Notes']];
for (const sec of sections) {
  for (const item of sec.items) {
    allRows.push([item[0], sec.name, item[1], item[2], statusSymbol(item[3]), item[4]]);
  }
}
const ws1 = XLSX.utils.aoa_to_sheet(allRows);
ws1['!cols'] = [
  { wch: 5 },  // #
  { wch: 30 }, // Section
  { wch: 50 }, // Feature
  { wch: 10 }, // PRD Ref
  { wch: 12 }, // Status
  { wch: 55 }, // Notes
];
// Style header
for (let c = 0; c < 6; c++) {
  const cell = ws1[XLSX.utils.encode_cell({ r: 0, c })];
  if (cell) {
    cell.s = { fill: headerFill, font: headerFont, alignment: { horizontal: 'center' } };
  }
}
// Style status cells
for (let r = 1; r < allRows.length; r++) {
  const cell = ws1[XLSX.utils.encode_cell({ r, c: 4 })];
  if (cell) {
    cell.s = { fill: statusFill(cell.v), alignment: { horizontal: 'center' } };
  }
}
XLSX.utils.book_append_sheet(wb, ws1, 'All Features');

// ── Sheet 2: Summary Scorecard ──
const summaryHeaders = ['Category', 'PRD Ref', 'Total', 'Done', 'Partial', 'Missing', 'Phase 2', '% Complete'];
const summaryRows = [summaryHeaders];
let grandTotal = 0, grandDone = 0, grandPartial = 0, grandMissing = 0, grandPhase2 = 0;

for (const sec of sections) {
  const total = sec.items.length;
  const done = sec.items.filter(i => i[3] === 'Done').length;
  const partial = sec.items.filter(i => i[3] === 'Partial').length;
  const missing = sec.items.filter(i => i[3] === 'Missing').length;
  const phase2 = sec.items.filter(i => i[3] === 'Phase 2').length;
  const pct = total > 0 ? ((done / total) * 100).toFixed(1) + '%' : '0%';
  summaryRows.push([sec.name, sec.prdRef, total, done, partial, missing, phase2, pct]);
  grandTotal += total;
  grandDone += done;
  grandPartial += partial;
  grandMissing += missing;
  grandPhase2 += phase2;
}

const grandPct = grandTotal > 0 ? ((grandDone / grandTotal) * 100).toFixed(1) + '%' : '0%';
summaryRows.push(['TOTAL', '', grandTotal, grandDone, grandPartial, grandMissing, grandPhase2, grandPct]);

const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
ws2['!cols'] = [
  { wch: 35 }, // Category
  { wch: 10 }, // PRD Ref
  { wch: 8 },  // Total
  { wch: 8 },  // Done
  { wch: 10 }, // Partial
  { wch: 10 }, // Missing
  { wch: 10 }, // Phase 2
  { wch: 12 }, // % Complete
];
// Style header
for (let c = 0; c < 8; c++) {
  const cell = ws2[XLSX.utils.encode_cell({ r: 0, c })];
  if (cell) {
    cell.s = { fill: headerFill, font: headerFont, alignment: { horizontal: 'center' } };
  }
}
// Style totals row (bold)
const totalRowIdx = summaryRows.length - 1;
for (let c = 0; c < 8; c++) {
  const cell = ws2[XLSX.utils.encode_cell({ r: totalRowIdx, c })];
  if (cell) {
    cell.s = { font: boldFont };
  }
}
XLSX.utils.book_append_sheet(wb, ws2, 'Summary Scorecard');

// ── Sheet 3: Overall Metrics ──
const metricsRows = [
  ['Metric', 'Value'],
  ['Report Date', '2026-03-07'],
  ['PRD Version', '1.0 (2026-02-19)'],
  ['Total PRD Features', grandTotal],
  ['Fully Implemented', grandDone],
  ['Partially Implemented', grandPartial],
  ['Missing', grandMissing],
  ['Deferred to Phase 2', grandPhase2],
  ['Bonus Features (beyond PRD)', sections.find(s => s.name.includes('Beyond'))?.items.length ?? 12],
  ['Effective Completion Rate', grandPct],
  ['', ''],
  ['Partial Items Requiring Attention', ''],
  ['Facebook/Google lead capture', 'Webhook exists; no native OAuth integrations'],
  ['Drag-and-drop reorder', 'Day/item panels exist; native DnD may be limited'],
  ['Image attachments per itinerary item', 'File system exists; per-item image upload needs verification'],
  ['', ''],
  ['Phase 2 Items (Not Expected Yet)', ''],
  ['2FA (TOTP authenticator)', ''],
  ['Custom roles (granular permissions)', ''],
  ['Google Calendar sync', ''],
  ['Scheduled reports (auto-email)', ''],
  ['Recurring invoices', ''],
  ['Driver earnings module', ''],
  ['Additional languages (ar, es, fr, th, id, tr)', ''],
];
const ws3 = XLSX.utils.aoa_to_sheet(metricsRows);
ws3['!cols'] = [{ wch: 40 }, { wch: 55 }];
for (let c = 0; c < 2; c++) {
  const cell = ws3[XLSX.utils.encode_cell({ r: 0, c })];
  if (cell) {
    cell.s = { fill: headerFill, font: headerFont, alignment: { horizontal: 'center' } };
  }
}
XLSX.utils.book_append_sheet(wb, ws3, 'Overall Metrics');

// ── Sheet 4: Desktop Quality Fixes ──
const fixRows = [
  ['Category', 'Fix Description'],
  ['Data Model', 'Profile/Team pages: Changed from firstName/lastName to single name field matching backend'],
  ['Data Model', 'Fleet pages: All driver references use driver.name'],
  ['Data Model', 'Supplier creation: Fixed from contactsApi to suppliersApi, type to category'],
  ['Mock Removal', 'Invoices list: Removed 20 hardcoded mock invoices; now shows real API data'],
  ['Mock Removal', 'Payments list: Removed mock payment arrays; computes stats from real data'],
  ['Mock Removal', 'Reports hub KPIs: Replaced hardcoded values with computed from real leads/invoices'],
  ['Feature Impl', 'Invoice detail: Mark as Paid (paymentsApi), Send Reminder (communicationsApi), Cancel Invoice'],
  ['Feature Impl', 'Voucher detail: Email/WhatsApp send (dialog with vouchersApi.send)'],
  ['Feature Impl', 'Traveller documents: Full upload/download/delete via documentsApi'],
  ['Feature Impl', 'Fleet trip invoice: Generate Invoice navigates to /invoices/new with pre-filled data'],
  ['Feature Impl', 'AI Compose: Send button opens dialog, sends via communicationsApi.send (email/SMS/WhatsApp)'],
  ['Feature Impl', 'AI Lead Creation: Creates contact + lead via API, navigates to lead detail'],
  ['Feature Impl', 'AI Itinerary: Save button saves via itinerariesApi.create with all fields + items'],
  ['Feature Impl', 'Marketing Social: Edit button opens dialog, saves via socialContent.update, refetches list'],
  ['Feature Impl', 'Team Settings: Invite button sends invitation email via communicationsApi.send'],
  ['Navigation', 'Supplier list: Row click navigates to supplier detail'],
  ['Navigation', 'Voucher detail: Edit button navigates to edit page'],
  ['Navigation', 'Communication templates: Create/Edit/Duplicate/Delete/Use actions all wired'],
  ['Navigation', 'Tasks kanban: Fixed broken onStatusChange callback'],
  ['Navigation', 'Contact delete dialog: Fixed DialogTrigger to proper Button elements'],
  ['Date/Time', 'REF_DATE pattern: All ~18 files changed from hardcoded 2026-03-06 to Date.now()'],
  ['Date/Time', 'Invoice/Payment forms: Dynamic dates instead of hardcoded'],
  ['Build', 'Desktop: 122 pages compiled (Next.js 16 + webpack)'],
  ['Build', 'Super-admin: 36 pages compiled'],
  ['Build', 'Flutter CRM: 0 analysis issues'],
  ['Build', 'Flutter Driver: 0 analysis issues'],
  ['Build', 'Backend: Clean TypeScript compilation'],
];
const ws4 = XLSX.utils.aoa_to_sheet(fixRows);
ws4['!cols'] = [{ wch: 15 }, { wch: 85 }];
for (let c = 0; c < 2; c++) {
  const cell = ws4[XLSX.utils.encode_cell({ r: 0, c })];
  if (cell) {
    cell.s = { fill: headerFill, font: headerFont, alignment: { horizontal: 'center' } };
  }
}
XLSX.utils.book_append_sheet(wb, ws4, 'Desktop Fixes');

// Write file
const outPath = 'c:/Users/Admin/Downloads/pro/CRM/TravelCRM_PRD_Coverage_Audit_v2.xlsx';
XLSX.writeFile(wb, outPath);
console.log(`Written: ${outPath}`);
console.log(`Total features: ${grandTotal}, Done: ${grandDone}, Partial: ${grandPartial}, Missing: ${grandMissing}, Phase 2: ${grandPhase2}`);
console.log(`Completion: ${grandPct}`);
