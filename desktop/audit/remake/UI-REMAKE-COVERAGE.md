# UI Remake Coverage Report

**Generated:** 2026-10-02T07:40:15.494Z

## Summary

| Metric | Value |
|---|---|
| Total Endpoints | 562 |
| CRUD Wired | 228 |
| Completion | **41%** |

## Coverage by Slice

| Endpoint | Slice | UI Page | CRUD Wired | UX Contract | E2E Spec | Status |
|---|---|---|:---:|:---:|:---:|---|
| GET /api/v1/suppliers/categories/summary | accounts | accounts | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/compose-message | ai-assistant | ai | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/ai/conversations | ai-assistant | ai | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/extract-lead | ai-assistant | ai | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/generate-itinerary | ai-assistant | ai | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/suggest-replies | ai-assistant | ai | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/ai/conversations/:id | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/conversations/:id | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/enrich-itinerary | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/generate-invoice | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/generated/:id/accept | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/generated/:id/feedback | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/generated/:id/reject | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/generated/:id | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/generated | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/parse-bulk-leads | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/parse-email | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/parse-whatsapp | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/scan-business-card | ai-assistant | ai | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/briefings/:id | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/bi/briefings/generate | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/briefings | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/cash-flow-forecast | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/ai/bi/customer-ltv/:contactId | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/bi/customer-segments/calculate | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/customer-segments | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/destination-profitability | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/ai/bi/health-score/calculate | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/health-score/history | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/health-score | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/lead-source-roi | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/lost-deal-analysis | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/ai/bi/recommendations/generate | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/revenue-pulse | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/seasonal-demand | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/team-performance | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/trending-destinations | ai-business-intelligence | bi | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/usage | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/bi/workload-analysis | ai-business-intelligence | bi | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/extractions/:id/confirm | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/extractions/:id/create-invoice | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/extractions/:id/create-itinerary | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/extractions/:id/reject | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/extractions/:id/schedule-followup | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/extractions/:id | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/extractions/pending-count | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/extractions/usage/summary | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/extractions | ai-extractions | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/insights | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/ai/intelligence/lead-score/:leadId | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/intelligence/nl-query | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/intelligence/ocr/passport | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/intelligence/ocr/supplier-invoice | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/intelligence/ocr/visa-classify | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/ai/intelligence/recommendations | ai-intelligence | insights | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/ai/intelligence/document-scans/:id/apply | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/document-scans/:id/reject | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/document-scans/:id | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/document-scans | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/insights/:id/action | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/insights/:id/dismiss | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/insights/:id | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/insights/customer/:contactId | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/insights/predictions | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/insights/trends | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/lead-score/:leadId/history | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/lead-score/:leadId | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/lead-scores/bulk | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/nl-queries | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/recommendations/:id/act | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/recommendations/:id/dismiss | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/smart-followup/:leadId | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/smart-followups/:id/dismiss | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/ai/intelligence/smart-followups/:id/send | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/intelligence/smart-followups | ai-intelligence | insights | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/ai/settings/features/check/:featureKey | ai-settings | ai | ✗ | ✓ | ✓ | ✗ Not done |
| PUT /api/v1/ai/settings/features | ai-settings | ai | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/settings/provider | ai-settings | ai | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/settings/usage | ai-settings | ai | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/ai/settings | ai-settings | ai | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/auth/forgot-password | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/login | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/logout | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/refresh-token | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/reset-password | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/resolve-tenant | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/send-otp | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/auth/sessions | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/auth/verify-otp | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/hsn-codes | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/hsn-codes | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/users/me | auth-shell | login | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/auth/sessions/:id | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/auth/sessions | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/auth/setup-account | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/exchange-rates | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/files/* | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/files/* | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/files/upload | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/public/quotation/:token | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/users/me/avatar | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/users/me/login-history | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/users/me/signature | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/users/me/signature | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/users/me | auth-shell | login | ✗ | ✗ | ✓ | ✗ Not done |
| PATCH /api/v1/events/:id/reschedule | calendar | calendar | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/events/:id | calendar | calendar | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/events/:id | calendar | calendar | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/events/:id | calendar | calendar | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/events | calendar | calendar | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/events | calendar | calendar | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/calls/:id/actions | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/calls/:id/end | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/calls/:id/transfer | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/calls/:id | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/calls/:id | calls | calls | ✗ | ✓ | ✓ | ✗ Not done |
| PUT /api/v1/calls/:id | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/calls/analytics | calls | calls | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/calls/missed/:id/mark-returned | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/calls/missed | calls | calls | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/calls/outbound | calls | calls | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/calls | calls | calls | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/transcripts/:callLogId | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/transcripts/:callLogId | calls | calls | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/transcripts | calls | calls | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/campaigns/:id/cancel | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/campaigns/:id/schedule | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/campaigns/:id/send | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/campaigns/:id | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/campaigns/:id | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/campaigns/:id | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/campaigns | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/campaigns | campaigns | campaigns | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/campaigns/:id/recipients | campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/chatbot/analytics | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/chatbot/config/:channel | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| PUT /api/v1/chatbot/config/:channel | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/chatbot/config | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/chatbot/conversations/:id/close | chatbot | chatbot | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/chatbot/conversations/:id/create-lead | chatbot | chatbot | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/chatbot/conversations/:id/handoff | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/chatbot/conversations/:id/reply | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/chatbot/conversations/:id | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/chatbot/conversations | chatbot | chatbot | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/chatbot/webhook/:channel | chatbot | chatbot | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/chatbot/whatsapp/incoming | chatbot | chatbot | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/chatbot/widget.js | chatbot | chatbot | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/communications/send-document | communication-inbox | communication | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/communications/send-template | communication-inbox | communication | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/communications/send | communication-inbox | communication | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/communications/bulk-send/:batchId/status | communication-inbox | communication | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/communications/bulk-send | communication-inbox | communication | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/communications/history | communication-inbox | communication | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/communications/log | communication-inbox | communication | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/contacts/:id/share | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/:id/timeline | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/contacts/:id | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/:id | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/contacts/:id | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/contacts/check-duplicate | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/custom-fields | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/export | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/filter-options | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/contacts/merge | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/tags | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts/upcoming-occasions | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/contacts | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/contacts | contacts | contacts | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/contacts/bulk-tag | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/contacts/custom-fields/:id | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/contacts/custom-fields/:id | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/contacts/custom-fields | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/contacts/import | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/contacts/merge/preview | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/contacts/shared-with-me | contacts | contacts | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/credit-notes/:id/apply | credit-debit-notes | credit-notes | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/credit-notes | credit-debit-notes | credit-notes | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/credit-notes | credit-debit-notes | credit-notes | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/debit-notes/:id/apply | credit-debit-notes | credit-notes | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/debit-notes | credit-debit-notes | credit-notes | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/debit-notes | credit-debit-notes | credit-notes | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/bookmarks/:id | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/bookmarks | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/bookmarks | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/notifications/badge-counts | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/sticky-notes/:id | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/sticky-notes/:id | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/sticky-notes | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/sticky-notes | dashboard | dashboard | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/bookmarks/check | dashboard | dashboard | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/reports/dashboard | dashboard | dashboard | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/documents/:id/download | documents | documents | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/documents/:id | documents | documents | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/documents/:id | documents | documents | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/documents/:id | documents | documents | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/documents/upload | documents | documents | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/documents | documents | documents | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/driver/login/verify | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/login | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/logout | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/driver/profile/documents | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/profile/documents | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/profile/photo | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/driver/profile | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/driver/profile | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/driver/push-tokens/:token | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/push-tokens | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/refresh | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/trips/:id/accept | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/trips/:id/check-in | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/trips/:id/check-out | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/trips/:id/reject | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/driver/trips/:id/status | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/driver/trips/:id | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/driver/trips | driver-app-api | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/dashboard | fleet-dashboard | fleet | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/drivers/:id | fleet-drivers | drivers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/drivers/:id | fleet-drivers | drivers | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/fleet/drivers/:id | fleet-drivers | drivers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/drivers | fleet-drivers | drivers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/fleet/drivers | fleet-drivers | drivers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/documents/drivers/expiring | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/drivers/:driverId/documents/:docId/download | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/drivers/:driverId/documents/:docId | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/drivers/:id/documents | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/drivers/:id/documents | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/drivers/:id/rate | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/drivers/:id/schedule | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/fleet/drivers/:id/status | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/drivers/:id/trips | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/drivers/schedule | fleet-drivers | drivers | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/vehicle-rate-cards/:id | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicle-rate-cards/:id | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/fleet/vehicle-rate-cards/:id | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/vehicle-rate-cards/estimate | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicle-rate-cards/lookup | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicle-rate-cards | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/vehicle-rate-cards | fleet-rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/trips/:id | fleet-trips | trips | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/fleet/trips/:id | fleet-trips | trips | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/trips | fleet-trips | trips | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/fleet/trips | fleet-trips | trips | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/fleet/calculate-distance | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/costs/report | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/trips/:id/costs/summary | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/trips/:id/costs | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/trips/:id/costs | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/trips/:id/generate-invoice | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/trips/:id/generate-voucher | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/fleet/trips/:id/status | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/trips/:id/timeline | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/trips/:id | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/trips/:tripId/costs/:costId | fleet-trips | trips | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/vehicles/:id | fleet-vehicles | vehicles | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/vehicles/:id | fleet-vehicles | vehicles | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/fleet/vehicles/:id | fleet-vehicles | vehicles | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/vehicles | fleet-vehicles | vehicles | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/fleet/vehicles | fleet-vehicles | vehicles | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/fleet/documents/expiring | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/maintenance/due | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/:id/availability | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/:id/documents | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/vehicles/:id/documents | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/:id/maintenance | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/vehicles/:id/maintenance | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/fleet/vehicles/:id/odometer | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/:id/photo | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/fleet/vehicles/:id/photo | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/fleet/vehicles/:id/status | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/:id/trips | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/:vehicleId/documents/:docId/download | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/fleet/vehicles/:vehicleId/documents/:docId | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/fleet/vehicles/availability | fleet-vehicles | vehicles | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/follow-ups/:id/complete | follow-ups | follow-ups | ✗ | ✓ | ✓ | ✗ Not done |
| DELETE /api/v1/follow-ups/:id | follow-ups | follow-ups | ✗ | ✓ | ✓ | ✗ Not done |
| PUT /api/v1/follow-ups/:id | follow-ups | follow-ups | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/follow-ups | follow-ups | follow-ups | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/follow-ups | follow-ups | follow-ups | ✗ | ✓ | ✓ | ✗ Not done |
| GET /api/v1/exports/contacts | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/exports/full | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/exports/invoices/bulk-pdf | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/exports/jobs/:id/download | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/exports/jobs/:id | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/exports/leads | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/imports/:id/cancel | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/imports/:id/errors/download | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/imports/:id/errors | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/imports/:id/execute | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/imports/templates/:type | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/imports/upload | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/imports | import-export | import | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/imports/:id/progress | import-export | import | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/invoices/:id/duplicate | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/invoices/:id/payments | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/invoices/:id/send | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/invoices/:id/void | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/invoices/:id | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/invoices/:id | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/invoices/:id | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/invoices/from-itinerary | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/invoices/summary | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/invoices | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/invoices | invoices | invoices | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/itineraries/:id/clone | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/itineraries/:id/new-version | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/itineraries/:id/send | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/itineraries/:id/share-link | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/itineraries/:id/share-link | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/itineraries/:id/versions | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/itineraries/:id | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/itineraries/:id | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/itineraries/:id | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/itineraries | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/itineraries | itineraries | itineraries | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/itineraries/:id/pdf | itineraries | itineraries | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/itinerary-templates/:id | itinerary-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/itinerary-templates/:id | itinerary-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/itinerary-templates/create-from | itinerary-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/itinerary-templates/from-itinerary | itinerary-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/itinerary-templates | itinerary-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/itinerary-templates | itinerary-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/leads/:id/activities | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/:id/assign | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/leads/:id/follow-ups | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/leads/:id/notes | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/:id/notes | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/leads/:id/status | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/leads/:id | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/leads/:id | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/leads/:id | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/bulk-assign | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/bulk-delete | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/bulk-status | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/leads/filter-options | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/leads/unassigned | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/leads | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads | leads | leads | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/:id/activities | leads | leads | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/leads/:id/notes/:noteId | leads | leads | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/leads/:id/notes/:noteId | leads | leads | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/campaigns/:id/analytics | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/campaigns/:id/cancel | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/campaigns/:id/recipients | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/campaigns/:id/send | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/campaigns/:id | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/campaigns/:id | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/marketing/campaigns/:id | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/campaigns | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/campaigns | marketing-campaigns | campaigns | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/branding | marketing-flyers | flyers | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/marketing/branding | marketing-flyers | flyers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/marketing/flyer-templates | marketing-flyers | flyers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/marketing/flyers | marketing-flyers | flyers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/marketing/flyers | marketing-flyers | flyers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/marketing/images | marketing-flyers | flyers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/marketing/flyer-templates/:id/assets | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/flyer-templates/:id | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/flyer-templates/:id | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/marketing/flyer-templates/:id | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/flyer-templates/:templateId/assets/:assetId | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/flyer-templates | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/flyers/:id/upload | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/flyers/:id | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/flyers/:id | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/flyers/share | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/images/:id | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/images/upload-logo | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/images/upload | marketing-flyers | flyers | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/opt-out/:contactId/opt-in | marketing-opt-out | opted-out | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/opt-out/:contactId | marketing-opt-out | opted-out | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/opt-out | marketing-opt-out | opted-out | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/segments | marketing-segments | segments | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/marketing/segments | marketing-segments | segments | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/marketing/segments/:id/contacts | marketing-segments | segments | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/segments/:id/refresh-count | marketing-segments | segments | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/segments/:id | marketing-segments | segments | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/segments/:id | marketing-segments | segments | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/marketing/segments/:id | marketing-segments | segments | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/marketing/social-content/:id | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/social-content/:id | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/marketing/social-content/:id | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/social-content/generate-batch | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/social-content/generate | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/social-content | marketing-social | social | ✗ | ✓ | ✓ | ✗ Not done |
| PUT /api/v1/marketing/suggestions/:id/accept | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/marketing/suggestions/:id/dismiss | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/marketing/suggestions/generate | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/marketing/suggestions | marketing-social | social | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/message-templates/:id | message-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/message-templates/:id | message-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/message-templates/:id | message-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/message-templates | message-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/message-templates | message-templates | templates | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/notifications/:id/read | notifications | notifications | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/notifications/:id | notifications | notifications | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/notifications/announce | notifications | notifications | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/notifications/read-all | notifications | notifications | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/notifications/unread-count | notifications | notifications | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/notifications | notifications | notifications | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/notification-preferences/me/quiet-hours | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/notification-preferences/me/quiet-hours | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/notification-preferences/me | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/notification-preferences/me | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/push-tokens/:token | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/push-tokens/token/:fcmToken | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/push-tokens | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/push-tokens | notifications | notifications | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/payments/:id/link-invoice | payments | payments | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/payments/:id | payments | payments | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/payments/:id | payments | payments | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/payments | payments | payments | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/payments | payments | payments | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/rate-cards/:id | rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/rate-cards/:id | rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/rate-cards/:id | rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/rate-cards/lookup | rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/rate-cards | rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/rate-cards | rate-cards | rate-cards | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/reports/:id/export | reports | reports | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/reports/:id | reports | reports | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/reports/ageing | reports | reports | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/reports/outstanding | reports | reports | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/reports | reports | reports | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/reports/:id/cache | reports | reports | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/reports/cache | reports | reports | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/settings/assignment-rules | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/settings/assignment-rules | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/settings/company | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/settings/company | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/settings/follow-up-sequences | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/settings/follow-up-sequences | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/settings/invoice-defaults | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/settings/invoice-defaults | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/settings/logo | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/settings/numbering | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/settings/numbering | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/settings/routing-rules | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/settings/routing-rules | settings-company | settings | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/settings/follow-up-sequences/:id | settings-company | settings | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/settings/follow-up-sequences/:id | settings-company | settings | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/settings/itinerary-defaults | settings-company | settings | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/settings/itinerary-defaults | settings-company | settings | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/users/:id | settings-team | team | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/users/:id | settings-team | team | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/users | settings-team | team | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/activity-logs/entity/:type/:id | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/activity-logs/user/:id | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/activity-logs | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/users/:id/activate | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/users/:id/deactivate | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/users/:id/login-history | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/users/:id/unlock | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/users | settings-team | team | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/dashboard | super-admin | super-admin | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/stats | super-admin | super-admin | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/platform/health | super-admin | super-admin | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/tenants | super-admin | tenants | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/tenants/:p | super-admin | tenants | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/users | super-admin | users | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/users/:p | super-admin | users | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/plans | super-admin | plans | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/plans/:p | super-admin | plans | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/billing | super-admin | billing | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/billing/stats | super-admin | billing | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/billing/invoices | super-admin | billing | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/billing/payments | super-admin | billing | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/billing/revenue | super-admin | billing | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/system/health | super-admin | super-admin | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/system/logs | super-admin | super-admin | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/system/metrics | super-admin | super-admin | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/config | super-admin | config | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/admin/audit-logs | super-admin | audit | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/suppliers/:id/ledger | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/suppliers/:id/payments | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/suppliers/:id/payments | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/suppliers/:id/rate-cards | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/suppliers/:id/rate | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/suppliers/:id/toggle-preferred | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/suppliers/:id | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/suppliers/:id | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/suppliers/:id | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/suppliers/compare-rates | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/suppliers | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/suppliers | suppliers | suppliers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/suppliers/:id/rate-cards | suppliers | suppliers | ✗ | ✗ | ✓ | ✗ Not done |
| PATCH /api/v1/tasks/:id/status | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/tasks/:id/subtasks | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/tasks/:id | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/tasks/:id | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/tasks/:id | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/tasks/:taskId/comments | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/tasks/:taskId/comments | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/tasks/dashboard/summary | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/tasks/leads/:leadId/tasks | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/tasks | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/tasks | tasks | tasks | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/tasks/:taskId/comments/:commentId | tasks | tasks | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/tasks/:taskId/comments/:commentId | tasks | tasks | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/test/reset | test-harness | — | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/travellers/:id | travellers | travellers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/travellers/:id | travellers | travellers | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/travellers/:id | travellers | travellers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/travellers | travellers | travellers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/travellers | travellers | travellers | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/travellers/:id/link-contact | travellers | travellers | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/travellers/:id/unlink-contact | travellers | travellers | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/visa/:id/documents/:docId/download | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/visa/:id/documents/:docId | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/visa/:id/documents | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/visa/:id/documents | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/visa/:id | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/visa/:id | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/visa/:id | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/visa | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/visa | visa | visa | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/visa/:id/checklist/:itemId | visa | visa | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/visa/:id/notes | visa | visa | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/visa/:id/status | visa | visa | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/visa/dashboard | visa | visa | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/visa/missing-documents | visa | visa | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/voip/caller-info | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/voip/numbers/:id | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/voip/numbers/:id | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/numbers/purchase | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/numbers/search | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/voip/numbers | voip-settings | voip | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/voip/recording-callback | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/voip/settings | voip-settings | voip | ✗ | ✓ | ✓ | ✗ Not done |
| PUT /api/v1/voip/settings | voip-settings | voip | ✗ | ✓ | ✓ | ✗ Not done |
| POST /api/v1/voip/status-callback | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/voip/test-connection | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/token | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/twiml/dial-status | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/twiml/inbound | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/twiml/ivr-handler | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/twiml/outbound | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/voicemail-callback | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/voip/voicemail-complete | voip-settings | voip | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/vouchers/:id/pdf | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/vouchers/:id/send | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| PATCH /api/v1/vouchers/:id/status | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| DELETE /api/v1/vouchers/:id | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/vouchers/:id | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| PUT /api/v1/vouchers/:id | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/vouchers/bulk-send | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/vouchers/by-lead/:leadId | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/vouchers/from-itinerary-item | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| GET /api/v1/vouchers | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/vouchers | vouchers | vouchers | ✓ | ✓ | ✓ | ✓ Done |
| POST /api/v1/leads/webhook | webhooks-integrations | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/webhooks/sendgrid/events | webhooks-integrations | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/webhooks/twilio/status | webhooks-integrations | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/whatsapp-campaigns/:id/analytics | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/whatsapp-campaigns/:id/cancel | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/whatsapp-campaigns/:id/pause | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/whatsapp-campaigns/:id/recipients | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/whatsapp-campaigns/:id/send | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| DELETE /api/v1/whatsapp-campaigns/:id | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/whatsapp-campaigns/:id | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| PUT /api/v1/whatsapp-campaigns/:id | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| GET /api/v1/whatsapp-campaigns | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |
| POST /api/v1/whatsapp-campaigns | whatsapp-campaigns | — | ✗ | ✗ | ✓ | ✗ Not done |

## Not Done

266 endpoint(s) still need work:

- **GET /api/v1/activity-logs/entity/:type/:id** (slice: settings-team) — No API client wired
- **GET /api/v1/activity-logs/user/:id** (slice: settings-team) — No API client wired
- **GET /api/v1/activity-logs** (slice: settings-team) — No API client wired
- **GET /api/v1/ai/bi/briefings/:id** (slice: ai-business-intelligence) — No API client wired
- **POST /api/v1/ai/bi/briefings/generate** (slice: ai-business-intelligence) — No API client wired
- **POST /api/v1/ai/bi/customer-ltv/:contactId** (slice: ai-business-intelligence) — No API client wired
- **POST /api/v1/ai/bi/customer-segments/calculate** (slice: ai-business-intelligence) — No API client wired
- **GET /api/v1/ai/bi/customer-segments** (slice: ai-business-intelligence) — No API client wired
- **POST /api/v1/ai/bi/health-score/calculate** (slice: ai-business-intelligence) — No API client wired
- **GET /api/v1/ai/bi/health-score/history** (slice: ai-business-intelligence) — No API client wired
- **POST /api/v1/ai/bi/recommendations/generate** (slice: ai-business-intelligence) — No API client wired
- **GET /api/v1/ai/bi/usage** (slice: ai-business-intelligence) — No API client wired
- **GET /api/v1/ai/bi/workload-analysis** (slice: ai-business-intelligence) — No API client wired
- **DELETE /api/v1/ai/conversations/:id** (slice: ai-assistant) — No API client wired
- **GET /api/v1/ai/conversations/:id** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/enrich-itinerary** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/extractions/:id/confirm** (slice: ai-extractions) — No API client wired
- **POST /api/v1/ai/extractions/:id/create-invoice** (slice: ai-extractions) — No API client wired
- **POST /api/v1/ai/extractions/:id/create-itinerary** (slice: ai-extractions) — No API client wired
- **POST /api/v1/ai/extractions/:id/reject** (slice: ai-extractions) — No API client wired
- **POST /api/v1/ai/extractions/:id/schedule-followup** (slice: ai-extractions) — No API client wired
- **GET /api/v1/ai/extractions/:id** (slice: ai-extractions) — No API client wired
- **GET /api/v1/ai/extractions/pending-count** (slice: ai-extractions) — No API client wired
- **GET /api/v1/ai/extractions/usage/summary** (slice: ai-extractions) — No API client wired
- **GET /api/v1/ai/extractions** (slice: ai-extractions) — No API client wired
- **POST /api/v1/ai/generate-invoice** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/generated/:id/accept** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/generated/:id/feedback** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/generated/:id/reject** (slice: ai-assistant) — No API client wired
- **GET /api/v1/ai/generated/:id** (slice: ai-assistant) — No API client wired
- **GET /api/v1/ai/generated** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/intelligence/document-scans/:id/apply** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/document-scans/:id/reject** (slice: ai-intelligence) — No API client wired
- **GET /api/v1/ai/intelligence/document-scans/:id** (slice: ai-intelligence) — No API client wired
- **GET /api/v1/ai/intelligence/document-scans** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/insights/:id/action** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/insights/:id/dismiss** (slice: ai-intelligence) — No API client wired
- **GET /api/v1/ai/intelligence/insights/:id** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/insights/customer/:contactId** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/insights/predictions** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/insights/trends** (slice: ai-intelligence) — No API client wired
- **GET /api/v1/ai/intelligence/lead-score/:leadId/history** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/lead-score/:leadId** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/lead-scores/bulk** (slice: ai-intelligence) — No API client wired
- **GET /api/v1/ai/intelligence/nl-queries** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/recommendations/:id/act** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/recommendations/:id/dismiss** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/smart-followup/:leadId** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/smart-followups/:id/dismiss** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/intelligence/smart-followups/:id/send** (slice: ai-intelligence) — No API client wired
- **GET /api/v1/ai/intelligence/smart-followups** (slice: ai-intelligence) — No API client wired
- **POST /api/v1/ai/parse-bulk-leads** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/parse-email** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/parse-whatsapp** (slice: ai-assistant) — No API client wired
- **POST /api/v1/ai/scan-business-card** (slice: ai-assistant) — No API client wired
- **DELETE /api/v1/auth/sessions/:id** (slice: auth-shell) — No API client wired
- **DELETE /api/v1/auth/sessions** (slice: auth-shell) — No API client wired
- **POST /api/v1/auth/setup-account** (slice: auth-shell) — No API client wired
- **GET /api/v1/bookmarks/check** (slice: dashboard) — No API client wired
- **GET /api/v1/calls/:id/actions** (slice: calls) — No API client wired
- **POST /api/v1/calls/:id/end** (slice: calls) — No API client wired
- **POST /api/v1/calls/:id/transfer** (slice: calls) — No API client wired
- **DELETE /api/v1/calls/:id** (slice: calls) — No API client wired
- **PUT /api/v1/calls/:id** (slice: calls) — No API client wired
- **POST /api/v1/calls/missed/:id/mark-returned** (slice: calls) — No API client wired
- **POST /api/v1/chatbot/conversations/:id/close** (slice: chatbot) — No API client wired
- **POST /api/v1/chatbot/conversations/:id/create-lead** (slice: chatbot) — No API client wired
- **POST /api/v1/chatbot/webhook/:channel** (slice: chatbot) — No API client wired
- **POST /api/v1/chatbot/whatsapp/incoming** (slice: chatbot) — No API client wired
- **GET /api/v1/chatbot/widget.js** (slice: chatbot) — No API client wired
- **GET /api/v1/communications/bulk-send/:batchId/status** (slice: communication-inbox) — No API client wired
- **POST /api/v1/contacts/bulk-tag** (slice: contacts) — No API client wired
- **DELETE /api/v1/contacts/custom-fields/:id** (slice: contacts) — No API client wired
- **PUT /api/v1/contacts/custom-fields/:id** (slice: contacts) — No API client wired
- **POST /api/v1/contacts/custom-fields** (slice: contacts) — No API client wired
- **POST /api/v1/contacts/import** (slice: contacts) — No API client wired
- **POST /api/v1/contacts/merge/preview** (slice: contacts) — No API client wired
- **GET /api/v1/contacts/shared-with-me** (slice: contacts) — No API client wired
- **POST /api/v1/driver/login/verify** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/login** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/logout** (slice: driver-app-api) — No API client wired
- **GET /api/v1/driver/profile/documents** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/profile/documents** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/profile/photo** (slice: driver-app-api) — No API client wired
- **GET /api/v1/driver/profile** (slice: driver-app-api) — No API client wired
- **PUT /api/v1/driver/profile** (slice: driver-app-api) — No API client wired
- **DELETE /api/v1/driver/push-tokens/:token** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/push-tokens** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/refresh** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/trips/:id/accept** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/trips/:id/check-in** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/trips/:id/check-out** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/trips/:id/reject** (slice: driver-app-api) — No API client wired
- **POST /api/v1/driver/trips/:id/status** (slice: driver-app-api) — No API client wired
- **GET /api/v1/driver/trips/:id** (slice: driver-app-api) — No API client wired
- **GET /api/v1/driver/trips** (slice: driver-app-api) — No API client wired
- **GET /api/v1/exchange-rates** (slice: auth-shell) — No API client wired
- **DELETE /api/v1/files/*** (slice: auth-shell) — No API client wired
- **GET /api/v1/files/*** (slice: auth-shell) — No API client wired
- **POST /api/v1/files/upload** (slice: auth-shell) — No API client wired
- **POST /api/v1/fleet/calculate-distance** (slice: fleet-trips) — No API client wired
- **GET /api/v1/fleet/costs/report** (slice: fleet-trips) — No API client wired
- **GET /api/v1/fleet/dashboard** (slice: fleet-dashboard) — No API client wired
- **GET /api/v1/fleet/documents/drivers/expiring** (slice: fleet-drivers) — No API client wired
- **GET /api/v1/fleet/documents/expiring** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/fleet/drivers/:driverId/documents/:docId/download** (slice: fleet-drivers) — No API client wired
- **DELETE /api/v1/fleet/drivers/:driverId/documents/:docId** (slice: fleet-drivers) — No API client wired
- **GET /api/v1/fleet/drivers/:id/documents** (slice: fleet-drivers) — No API client wired
- **POST /api/v1/fleet/drivers/:id/documents** (slice: fleet-drivers) — No API client wired
- **POST /api/v1/fleet/drivers/:id/rate** (slice: fleet-drivers) — No API client wired
- **PUT /api/v1/fleet/drivers/:id/status** (slice: fleet-drivers) — No API client wired
- **GET /api/v1/fleet/drivers/:id/trips** (slice: fleet-drivers) — No API client wired
- **GET /api/v1/fleet/maintenance/due** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/fleet/trips/:id/costs/summary** (slice: fleet-trips) — No API client wired
- **GET /api/v1/fleet/trips/:id/costs** (slice: fleet-trips) — No API client wired
- **POST /api/v1/fleet/trips/:id/costs** (slice: fleet-trips) — No API client wired
- **POST /api/v1/fleet/trips/:id/generate-invoice** (slice: fleet-trips) — No API client wired
- **POST /api/v1/fleet/trips/:id/generate-voucher** (slice: fleet-trips) — No API client wired
- **PUT /api/v1/fleet/trips/:id/status** (slice: fleet-trips) — No API client wired
- **GET /api/v1/fleet/trips/:id/timeline** (slice: fleet-trips) — No API client wired
- **DELETE /api/v1/fleet/trips/:tripId/costs/:costId** (slice: fleet-trips) — No API client wired
- **DELETE /api/v1/fleet/vehicle-rate-cards/:id** (slice: fleet-rate-cards) — No API client wired
- **GET /api/v1/fleet/vehicle-rate-cards/:id** (slice: fleet-rate-cards) — No API client wired
- **PUT /api/v1/fleet/vehicle-rate-cards/:id** (slice: fleet-rate-cards) — No API client wired
- **POST /api/v1/fleet/vehicle-rate-cards/estimate** (slice: fleet-rate-cards) — No API client wired
- **GET /api/v1/fleet/vehicle-rate-cards/lookup** (slice: fleet-rate-cards) — No API client wired
- **GET /api/v1/fleet/vehicle-rate-cards** (slice: fleet-rate-cards) — No API client wired
- **POST /api/v1/fleet/vehicle-rate-cards** (slice: fleet-rate-cards) — No API client wired
- **GET /api/v1/fleet/vehicles/:id/documents** (slice: fleet-vehicles) — No API client wired
- **POST /api/v1/fleet/vehicles/:id/documents** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/fleet/vehicles/:id/maintenance** (slice: fleet-vehicles) — No API client wired
- **POST /api/v1/fleet/vehicles/:id/maintenance** (slice: fleet-vehicles) — No API client wired
- **PUT /api/v1/fleet/vehicles/:id/odometer** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/fleet/vehicles/:id/photo** (slice: fleet-vehicles) — No API client wired
- **POST /api/v1/fleet/vehicles/:id/photo** (slice: fleet-vehicles) — No API client wired
- **PUT /api/v1/fleet/vehicles/:id/status** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/fleet/vehicles/:id/trips** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/fleet/vehicles/:vehicleId/documents/:docId/download** (slice: fleet-vehicles) — No API client wired
- **DELETE /api/v1/fleet/vehicles/:vehicleId/documents/:docId** (slice: fleet-vehicles) — No API client wired
- **GET /api/v1/itineraries/:id/pdf** (slice: itineraries) — No API client wired
- **DELETE /api/v1/itinerary-templates/:id** (slice: itinerary-templates) — No API client wired
- **GET /api/v1/itinerary-templates/:id** (slice: itinerary-templates) — No API client wired
- **POST /api/v1/itinerary-templates/create-from** (slice: itinerary-templates) — No API client wired
- **POST /api/v1/itinerary-templates/from-itinerary** (slice: itinerary-templates) — No API client wired
- **GET /api/v1/itinerary-templates** (slice: itinerary-templates) — No API client wired
- **POST /api/v1/itinerary-templates** (slice: itinerary-templates) — No API client wired
- **POST /api/v1/leads/:id/activities** (slice: leads) — No API client wired
- **DELETE /api/v1/leads/:id/notes/:noteId** (slice: leads) — No API client wired
- **PUT /api/v1/leads/:id/notes/:noteId** (slice: leads) — No API client wired
- **POST /api/v1/leads/webhook** (slice: webhooks-integrations) — No API client wired
- **GET /api/v1/marketing/campaigns/:id/analytics** (slice: marketing-campaigns) — No API client wired
- **POST /api/v1/marketing/campaigns/:id/cancel** (slice: marketing-campaigns) — No API client wired
- **GET /api/v1/marketing/campaigns/:id/recipients** (slice: marketing-campaigns) — No API client wired
- **POST /api/v1/marketing/campaigns/:id/send** (slice: marketing-campaigns) — No API client wired
- **DELETE /api/v1/marketing/campaigns/:id** (slice: marketing-campaigns) — No API client wired
- **GET /api/v1/marketing/campaigns/:id** (slice: marketing-campaigns) — No API client wired
- **PUT /api/v1/marketing/campaigns/:id** (slice: marketing-campaigns) — No API client wired
- **GET /api/v1/marketing/campaigns** (slice: marketing-campaigns) — No API client wired
- **POST /api/v1/marketing/campaigns** (slice: marketing-campaigns) — No API client wired
- **POST /api/v1/marketing/flyer-templates/:id/assets** (slice: marketing-flyers) — No API client wired
- **DELETE /api/v1/marketing/flyer-templates/:id** (slice: marketing-flyers) — No API client wired
- **GET /api/v1/marketing/flyer-templates/:id** (slice: marketing-flyers) — No API client wired
- **PUT /api/v1/marketing/flyer-templates/:id** (slice: marketing-flyers) — No API client wired
- **DELETE /api/v1/marketing/flyer-templates/:templateId/assets/:assetId** (slice: marketing-flyers) — No API client wired
- **POST /api/v1/marketing/flyer-templates** (slice: marketing-flyers) — No API client wired
- **POST /api/v1/marketing/flyers/:id/upload** (slice: marketing-flyers) — No API client wired
- **DELETE /api/v1/marketing/flyers/:id** (slice: marketing-flyers) — No API client wired
- **GET /api/v1/marketing/flyers/:id** (slice: marketing-flyers) — No API client wired
- **POST /api/v1/marketing/flyers/share** (slice: marketing-flyers) — No API client wired
- **DELETE /api/v1/marketing/images/:id** (slice: marketing-flyers) — No API client wired
- **POST /api/v1/marketing/images/upload-logo** (slice: marketing-flyers) — No API client wired
- **POST /api/v1/marketing/images/upload** (slice: marketing-flyers) — No API client wired
- **POST /api/v1/marketing/opt-out/:contactId/opt-in** (slice: marketing-opt-out) — No API client wired
- **POST /api/v1/marketing/opt-out/:contactId** (slice: marketing-opt-out) — No API client wired
- **GET /api/v1/marketing/opt-out** (slice: marketing-opt-out) — No API client wired
- **GET /api/v1/marketing/segments/:id/contacts** (slice: marketing-segments) — No API client wired
- **POST /api/v1/marketing/segments/:id/refresh-count** (slice: marketing-segments) — No API client wired
- **DELETE /api/v1/marketing/segments/:id** (slice: marketing-segments) — No API client wired
- **GET /api/v1/marketing/segments/:id** (slice: marketing-segments) — No API client wired
- **PUT /api/v1/marketing/segments/:id** (slice: marketing-segments) — No API client wired
- **DELETE /api/v1/marketing/social-content/:id** (slice: marketing-social) — No API client wired
- **GET /api/v1/marketing/social-content/:id** (slice: marketing-social) — No API client wired
- **PUT /api/v1/marketing/social-content/:id** (slice: marketing-social) — No API client wired
- **POST /api/v1/marketing/social-content/generate-batch** (slice: marketing-social) — No API client wired
- **POST /api/v1/marketing/social-content/generate** (slice: marketing-social) — No API client wired
- **PUT /api/v1/marketing/suggestions/:id/accept** (slice: marketing-social) — No API client wired
- **PUT /api/v1/marketing/suggestions/:id/dismiss** (slice: marketing-social) — No API client wired
- **POST /api/v1/marketing/suggestions/generate** (slice: marketing-social) — No API client wired
- **GET /api/v1/marketing/suggestions** (slice: marketing-social) — No API client wired
- **DELETE /api/v1/message-templates/:id** (slice: message-templates) — No API client wired
- **GET /api/v1/message-templates/:id** (slice: message-templates) — No API client wired
- **PUT /api/v1/message-templates/:id** (slice: message-templates) — No API client wired
- **GET /api/v1/message-templates** (slice: message-templates) — No API client wired
- **POST /api/v1/message-templates** (slice: message-templates) — No API client wired
- **GET /api/v1/notification-preferences/me/quiet-hours** (slice: notifications) — No API client wired
- **PUT /api/v1/notification-preferences/me/quiet-hours** (slice: notifications) — No API client wired
- **GET /api/v1/notification-preferences/me** (slice: notifications) — No API client wired
- **PUT /api/v1/notification-preferences/me** (slice: notifications) — No API client wired
- **GET /api/v1/public/quotation/:token** (slice: auth-shell) — No API client wired
- **DELETE /api/v1/push-tokens/:token** (slice: notifications) — No API client wired
- **DELETE /api/v1/push-tokens/token/:fcmToken** (slice: notifications) — No API client wired
- **GET /api/v1/push-tokens** (slice: notifications) — No API client wired
- **POST /api/v1/push-tokens** (slice: notifications) — No API client wired
- **DELETE /api/v1/rate-cards/:id** (slice: rate-cards) — No API client wired
- **GET /api/v1/rate-cards/:id** (slice: rate-cards) — No API client wired
- **PUT /api/v1/rate-cards/:id** (slice: rate-cards) — No API client wired
- **GET /api/v1/rate-cards/lookup** (slice: rate-cards) — No API client wired
- **GET /api/v1/rate-cards** (slice: rate-cards) — No API client wired
- **POST /api/v1/rate-cards** (slice: rate-cards) — No API client wired
- **DELETE /api/v1/reports/:id/cache** (slice: reports) — No API client wired
- **DELETE /api/v1/reports/cache** (slice: reports) — No API client wired
- **GET /api/v1/reports/dashboard** (slice: dashboard) — No API client wired
- **DELETE /api/v1/settings/follow-up-sequences/:id** (slice: settings-company) — No API client wired
- **PUT /api/v1/settings/follow-up-sequences/:id** (slice: settings-company) — No API client wired
- **GET /api/v1/settings/itinerary-defaults** (slice: settings-company) — No API client wired
- **PUT /api/v1/settings/itinerary-defaults** (slice: settings-company) — No API client wired
- **POST /api/v1/suppliers/:id/rate-cards** (slice: suppliers) — No API client wired
- **DELETE /api/v1/tasks/:taskId/comments/:commentId** (slice: tasks) — No API client wired
- **PUT /api/v1/tasks/:taskId/comments/:commentId** (slice: tasks) — No API client wired
- **POST /api/v1/test/reset** (slice: test-harness) — No API client wired
- **GET /api/v1/transcripts/:callLogId** (slice: calls) — No API client wired
- **PUT /api/v1/transcripts/:callLogId** (slice: calls) — No API client wired
- **PUT /api/v1/travellers/:id/link-contact** (slice: travellers) — No API client wired
- **PUT /api/v1/travellers/:id/unlink-contact** (slice: travellers) — No API client wired
- **PUT /api/v1/users/:id/activate** (slice: settings-team) — No API client wired
- **PUT /api/v1/users/:id/deactivate** (slice: settings-team) — No API client wired
- **GET /api/v1/users/:id/login-history** (slice: settings-team) — No API client wired
- **POST /api/v1/users/:id/unlock** (slice: settings-team) — No API client wired
- **POST /api/v1/users/me/avatar** (slice: auth-shell) — No API client wired
- **GET /api/v1/users/me/login-history** (slice: auth-shell) — No API client wired
- **GET /api/v1/users/me/signature** (slice: auth-shell) — No API client wired
- **PUT /api/v1/users/me/signature** (slice: auth-shell) — No API client wired
- **PUT /api/v1/users/me** (slice: auth-shell) — No API client wired
- **POST /api/v1/users** (slice: settings-team) — No API client wired
- **PUT /api/v1/visa/:id/checklist/:itemId** (slice: visa) — No API client wired
- **POST /api/v1/visa/:id/notes** (slice: visa) — No API client wired
- **PUT /api/v1/visa/:id/status** (slice: visa) — No API client wired
- **GET /api/v1/visa/dashboard** (slice: visa) — No API client wired
- **GET /api/v1/visa/missing-documents** (slice: visa) — No API client wired
- **GET /api/v1/voip/caller-info** (slice: voip-settings) — No API client wired
- **DELETE /api/v1/voip/numbers/:id** (slice: voip-settings) — No API client wired
- **PUT /api/v1/voip/numbers/:id** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/numbers/purchase** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/numbers/search** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/recording-callback** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/status-callback** (slice: voip-settings) — No API client wired
- **GET /api/v1/voip/test-connection** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/token** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/twiml/dial-status** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/twiml/inbound** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/twiml/ivr-handler** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/twiml/outbound** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/voicemail-callback** (slice: voip-settings) — No API client wired
- **POST /api/v1/voip/voicemail-complete** (slice: voip-settings) — No API client wired
- **POST /api/v1/webhooks/sendgrid/events** (slice: webhooks-integrations) — No API client wired
- **POST /api/v1/webhooks/twilio/status** (slice: webhooks-integrations) — No API client wired
- **GET /api/v1/whatsapp-campaigns/:id/analytics** (slice: whatsapp-campaigns) — No API client wired
- **POST /api/v1/whatsapp-campaigns/:id/cancel** (slice: whatsapp-campaigns) — No API client wired
- **POST /api/v1/whatsapp-campaigns/:id/pause** (slice: whatsapp-campaigns) — No API client wired
- **GET /api/v1/whatsapp-campaigns/:id/recipients** (slice: whatsapp-campaigns) — No API client wired
- **POST /api/v1/whatsapp-campaigns/:id/send** (slice: whatsapp-campaigns) — No API client wired
- **DELETE /api/v1/whatsapp-campaigns/:id** (slice: whatsapp-campaigns) — No API client wired
- **GET /api/v1/whatsapp-campaigns/:id** (slice: whatsapp-campaigns) — No API client wired
- **PUT /api/v1/whatsapp-campaigns/:id** (slice: whatsapp-campaigns) — No API client wired
- **GET /api/v1/whatsapp-campaigns** (slice: whatsapp-campaigns) — No API client wired
- **POST /api/v1/whatsapp-campaigns** (slice: whatsapp-campaigns) — No API client wired