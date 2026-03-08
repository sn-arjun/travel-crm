# Milestone 15 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m15.md

## Summary
| Status   | Count |
|----------|-------|
| DONE     | 6     |
| PARTIAL  | 17    |
| MISSING  | 4     |
| BUG      | 3     |

**Overall:** The Reporting & Analytics milestone has a solid foundation — the report engine, registry, caching service, date-range utilities, period comparison, Excel/PDF exports, and type system are all implemented on the backend. 12 desktop report pages cover all 9 categories. However, the implementation is **significantly simplified** compared to ticket specs: most backend report definitions register only 1 report per category (ticket spec calls for 3-6 each), the frontend pages use **hardcoded fallback data** rather than the parameterized report engine API, KV caching is **not integrated** into the route handler, drill-down endpoints are **not implemented**, and the `report_dashboard_widgets` table is **missing** from the schema.

---

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `NEXT_PUBLIC_API_URL` | `desktop/src/lib/api/config.ts:1` | Optional | Falls back to `http://localhost:8787/api/v1` |
| `REPORT_CACHE` (KV binding) | `backend/src/types.ts:14` | Optional | Cache class exists but **not wired** into reports route — reports work without it |

---

## UX Anti-Patterns (must fix)

| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| All report pages | **Placeholder/fallback data** — Every report page catches API errors and falls back to hardcoded sample data with `getFallback*()` functions. Users may see fake data without realizing it. | Remove fallback data in production; show proper error states instead of silently swapping real data for fake data |
| All report pages | **No loading skeletons** — Loading state is either a spinner (`Loader` icon) or absent; no shimmer/skeleton placeholders for KPI cards, charts, or tables | Add Skeleton components for KPI cards, chart areas, and table rows during fetch |
| All report pages | **Export buttons are non-functional** — Export/Download buttons exist in headers but trigger `toast('Exporting...')` or simple blob download without passing date range / filter params to the backend export endpoint | Wire export buttons to `reportsApi.export(id, format)` with current date range and filter params |
| All report pages | **No period comparison toggle** — Ticket spec requires a "Compare with previous period" switch showing % change arrows. Frontend shows static trend percentages instead of dynamic comparison data from the `?compare=true` backend param | Add comparison toggle that passes `compare=true` to API and displays `previous_period` + `changes` data |
| Reports Hub (`/reports`) | **Schedule & Export All buttons are no-ops** — `<Button>Schedule</Button>` and `<Button>Export All</Button>` have no onClick handlers | Either implement or remove these buttons |
| Reports Hub (`/reports`) | **KPI cards fetch all leads/invoices** — Loads up to 500 leads and 500 invoices client-side to compute KPIs, instead of using the `/reports/dashboard` endpoint that already provides aggregated data | Use `reportsApi.getDashboard()` instead of fetching raw entity lists |
| Sales reports | **No drill-down** — Table cells showing revenue/count numbers are not clickable. Ticket requires blue underlined clickable numbers that open drill-down view | Implement drill-down click handler on numeric cells |
| Sales reports | **Missing sub-reports** — Only 4 backend report definitions (sales_summary, sales_by_destination, win_loss_analysis, sales_by_source). Missing: sales_by_salesperson, sales_by_trip_type, conversion_rate, avg_deal_size, revenue_forecast, monthly_comparison | Register missing report definitions in backend |
| Lead reports | **Missing sub-reports** — Only 3 backend definitions (pipeline_summary, lead_ageing, lead_velocity). Missing: lead_source_analysis, lead_response_time, followup_compliance, hot_leads, lost_analysis, unassigned_leads, duplicate_leads | Register missing report definitions in backend |
| Financial reports | **Missing sub-reports** — Only 3 backend definitions (revenue_summary, collections_report, tax_report). Missing: outstanding_receivables (has custom route but not in registry), outstanding_payables, pnl_by_lead, payment_method_breakdown, refund_report, advance_payments, daily_cash | Register missing report definitions in backend |
| Customer reports | **Missing sub-reports** — Only 2 backend definitions (repeat_customers, customer_ltv). Missing: birthday_upcoming, dormant_customers | Register missing report definitions |
| Team reports | **Missing sub-reports** — Only 1 backend definition (team_dashboard). Missing: individual_performance, response_time_by_user, activity_report, task_completion | Register missing report definitions |
| Visa reports | **Missing sub-reports** — Only 1 backend definition (visa_status_summary). Missing: pending_documents, visa_success_rate | Register missing report definitions |
| Supplier reports | **Missing sub-reports** — Only 1 backend definition (supplier_usage). Missing: supplier_payment_summary, supplier_outstanding | Register missing report definitions |
| Fleet reports | **Missing sub-reports** — Only 1 backend definition (fleet_utilization). Missing: driver_performance, fleet_availability, trip_cost_analysis | Register missing report definitions |
| Marketing reports | **Missing sub-reports** — Only 1 backend definition (campaign_performance). Missing: lead_source_roi, bulk_message_delivery | Register missing report definitions |
| All report pages | **No search/filter on report index** — Reports Hub shows 8 category cards but no search bar to find individual reports by name (required by TICKET-275) | Add search bar to Reports Hub |
| All report pages | **No favorites/pinned reports** — No star/pin icon to save frequently used reports (required by TICKET-275) | Add pin/favorite functionality |
| All report pages | **No recently viewed** — No "Recently Viewed" section on Reports Hub (required by TICKET-275) | Track and display last 5 viewed reports |

---

## UX Improvements (nice to have)

| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| All report pages | Date range is a simple `<Select>` dropdown | Add custom date picker for "Custom Range" option with start/end date inputs | High |
| All report pages | Charts use Recharts with basic tooltips | Add currency formatting (₹1.2L) to chart Y-axis labels consistently | Medium |
| Sales reports | Salesperson data shows mock names | Connect to real users API for salesperson picker/filter | High |
| Financial reports | Outstanding tables show mock data | Wire to `/reports/outstanding` and `/reports/ageing` backend endpoints that already exist | High |
| Reports Hub | Static report counts ("8 reports", "9 reports") | Dynamically count available reports from registry | Low |
| All report pages | No breadcrumb navigation | Add "Reports > Sales > Sales Summary" breadcrumbs | Medium |
| All report pages | No print/PDF preview | Add print-friendly CSS media queries for report pages | Low |
| Team reports | No individual performance drill-down | Click team member card → individual deep-dive page | Medium |
| Customer reports | Birthday list shows mock data | Wire to contacts API with birthday filter | Medium |
| All chart pages | No chart type toggle | Allow switching between bar/line/pie views for same data | Low |

---

## Ticket Details

### TICKET-250: Report Engine — Parameterized SQL Query Builder — PARTIAL
**Backend:** DONE — `backend/src/services/report-engine.ts` (207 lines). ReportEngine class with `execute()` method, parameterized query builder, date range filtering, pagination, sorting, grouping, role-based auto-filtering for salesperson. Supports `{DATE_FILTER}`, `{GROUP_BY}`, `{ORDER_BY}` placeholders.
**Frontend:** N/A (backend-only ticket)
**API Client:** DONE — `desktop/src/lib/api/reports.ts:39-41` has `getById(id)` which hits `GET /reports/:reportId`
**UX Issues:**
- Query timeout protection (5 second abort) is NOT implemented — no timeout on `db.batch()`
- Per-page cap is 500 instead of ticket-specified max of 100
- `meta.total` returns `-1` when page is full instead of actual count (no COUNT query)
**Fix Required:**
1. `backend/src/services/report-engine.ts:116` — Change `perPage > 500` to `perPage > 100`
2. `backend/src/services/report-engine.ts:180` — Run a separate COUNT query to get true total
3. Add query timeout protection wrapping `db.batch()`

---

### TICKET-251: Report Caching in KV with 5-Minute TTL — PARTIAL
**Backend:** PARTIAL — `backend/src/services/report-cache.ts` (56 lines) exists with correct SHA-256 hashing, 5-minute TTL, get/set/invalidate methods. `REPORT_CACHE` KV binding declared in `backend/src/types.ts:14`.
**Frontend:** N/A
**API Client:** N/A
**UX Issues:**
- Cache is **NOT integrated** into `reports.ts` route handler — `reportRoutes.get('/:id')` directly calls `reportEngine.execute()` without checking/setting cache
- No `X-Cache: HIT/MISS` header
- No `cached_at` in response
- No `DELETE /reports/cache` or `DELETE /reports/:reportId/cache` endpoints for cache clearing
**Fix Required:**
1. `backend/src/routes/reports.ts:181-216` — Wrap execute call with cache check: `cache.get()` → return if hit, else `engine.execute()` → `cache.set()` → return
2. `backend/src/routes/reports.ts` — Add `DELETE /cache` and `DELETE /:id/cache` endpoints
3. Add `X-Cache` header and `cached_at` to response

---

### TICKET-252: Date Range Filter System — DONE
**Backend:** DONE — `backend/src/utils/date-range.ts` (51 lines). `resolveDateRange()` supports all 11 presets (today, yesterday, this_week, last_week, this_month, last_month, this_quarter, last_quarter, this_year, last_year, custom). Uses date-fns.
**Frontend:** PARTIAL — Desktop report pages have a `DateRangeSelector` component with `Select` dropdown supporting 5 ranges (7d, 30d, 90d, 6m, 1y) but NOT matching the backend's preset names. No custom date picker for arbitrary range.
**API Client:** PARTIAL — API methods accept `dateRange` string param but don't pass `date_preset` to match backend's `resolveDateRange()`
**UX Issues:**
- Frontend date range options don't match backend presets ("7d" vs "this_week")
- No custom range date picker
- Date range not persisted in localStorage per report
- No URL-compatible query params for shareable report URLs
**Fix Required:**
1. Desktop `DateRangeSelector` — Map frontend options to backend presets or send computed `date_from`/`date_to`
2. Add custom date range picker with start/end date inputs

---

### TICKET-253: Export to Excel (.xlsx) — DONE
**Backend:** DONE — `backend/src/services/exports/excel-export.ts` (47 lines). Uses ExcelJS. Generates worksheets with formatted headers (bold, gray fill), currency/date/number formatting. Route at `GET /reports/:id/export?format=excel`.
**Frontend:** PARTIAL — Export button exists on report pages but implementation varies. `reportsApi.export(id, format)` calls endpoint with blob response type.
**API Client:** DONE — `desktop/src/lib/api/reports.ts:51-52`
**UX Issues:**
- Export doesn't include report title, date range, or generated timestamp in header rows (ticket requires these)
- No company name/logo in header
- No summary row with totals for numeric columns
- Auto-column-width is hardcoded at 20 instead of content-based
- File name is generic `{id}_export.xlsx` instead of `{report-name}_{date-from}_to_{date-to}.xlsx`
- Max export rows not enforced (ticket specifies 10,000)
**Fix Required:**
1. `backend/src/services/exports/excel-export.ts` — Add title, date range, timestamp rows before data
2. Add auto-column-width based on content length
3. Add summary/totals row for numeric columns

---

### TICKET-254: Export to PDF — DONE
**Backend:** DONE — `backend/src/services/exports/pdf-export.ts` (198 lines). Uses pdf-lib (Cloudflare Workers compatible). A4 landscape, styled table headers (dark blue), alternating row colors, page numbers, proper text truncation. Route at `GET /reports/:id/export?format=pdf`.
**Frontend:** PARTIAL — Same export button as Excel. No separate "Export PDF" trigger on most pages.
**API Client:** DONE — Covered by `reportsApi.export(id, 'pdf')`
**UX Issues:**
- No company logo in header (ticket requires tenant logo + name)
- Currency formatting uses raw numbers instead of ₹ symbol
- No landscape/portrait auto-switch based on column count (always landscape)
- Max 500 rows not enforced with truncation note
- File name is generic
**Fix Required:**
1. `backend/src/services/exports/pdf-export.ts` — Add INR ₹ formatting for currency columns
2. Add tenant name in PDF header
3. Add row limit with truncation notice

---

### TICKET-255: Report Dashboard — Widget Grid Layout — MISSING
**Backend:** MISSING — No `report_dashboard_widgets` table in schema. No `dashboard-widgets.ts` route file. No widget CRUD endpoints.
**Frontend:** MISSING — No `/reports/dashboard` page. The `/reports` hub page shows category cards, not a configurable widget dashboard.
**API Client:** MISSING — No widget-related API methods
**UX Issues:** Entire feature missing — pin/unpin reports as dashboard widgets, drag-and-drop reorder, chart type selection, default 6-widget layout for new users.
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `report_dashboard_widgets` table
2. Create `backend/src/routes/dashboard-widgets.ts` with CRUD + reorder endpoints
3. Create `desktop/src/app/(app)/reports/dashboard/page.tsx` with grid layout
4. Add "Pin to Dashboard" action on each report page

---

### TICKET-256: Report Drill-Down System — MISSING
**Backend:** PARTIAL — `DrillDownConfig` type defined in `backend/src/types/report.ts:38-43` and `drillDown` field on `ReportDefinition` type. But NO drill-down endpoint exists (`GET /reports/:id/drill-down`). No report definitions include drill-down configs.
**Frontend:** MISSING — No clickable cells, no drill-down sheet/modal
**API Client:** MISSING — No drill-down API method
**Fix Required:**
1. `backend/src/routes/reports.ts` — Add `GET /:id/drill-down` endpoint
2. Add drill-down configs to report definitions (e.g., sales_summary → click revenue → see won leads)
3. Desktop — Make numeric table cells clickable with drill-down panel

---

### TICKET-257: Period Comparison Engine — PARTIAL
**Backend:** DONE — `backend/src/utils/period-comparison.ts` (40 lines) has `getPreviousPeriod()` and `computeChanges()`. Report engine supports `compare=true` param and returns `previous_period` data.
**Frontend:** MISSING — No comparison toggle UI on any report page. No display of comparison data or % change arrows.
**API Client:** PARTIAL — API methods don't pass `compare` param
**UX Issues:** Backend fully supports comparison but frontend doesn't expose it
**Fix Required:**
1. Add comparison toggle switch to report page headers
2. Pass `compare=true` to API when enabled
3. Display KPI cards with current vs previous + colored arrows

---

### TICKET-258: Chart Components — Bar, Line, Area Charts — DONE
**Backend:** N/A (frontend-only)
**Frontend:** DONE — All report pages use Recharts `BarChart`, `LineChart`, `AreaChart` with `ResponsiveContainer`, tooltips, legends, color palette. Consistent `CHART_COLORS` array across all pages.
**UX Issues:**
- No loading skeleton for charts during fetch
- No "No data for selected period" empty state in chart areas
- Y-axis currency formatting inconsistent (some pages format, some don't)
- Charts don't animate on load

---

### TICKET-259: Chart Components — Pie, Donut Charts — DONE
**Backend:** N/A
**Frontend:** DONE — `PieChart` and `Pie` from Recharts used in sales (trip type, source), leads (lost reasons, sources), financial (payment methods), marketing (email delivery). Consistent color palette.
**UX Issues:**
- No donut variant (center cutout) used — all are full pies
- No "Others" grouping for >8 segments
- No tap-to-expand segment interaction

---

### TICKET-260: Report Data Table Component — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — Uses standard `Table/TableBody/TableCell/TableHead/TableHeader/TableRow` from shadcn/ui. NOT a reusable `ReportDataTable` component — each page builds its own table.
**UX Issues:**
- No sortable column headers (click to sort)
- No pagination controls ("Showing 1-25 of 150")
- No rows-per-page selector
- No sticky header on scroll
- No total/summary row at bottom
- Currency not formatted in Indian style (₹1,23,456)
- No clickable cells for drill-down
- No row hover highlight on some pages
**Fix Required:**
1. Create shared `ReportDataTable` component with sorting, pagination, formatting
2. Replace individual table implementations across all 12 report pages

---

### TICKET-261: Sales Reports — Summary, Conversion Rate & Monthly Comparison — PARTIAL
**Backend:** PARTIAL — `sales_summary` registered but missing revenue fields (only counts leads, no `total_amount` or `avg_deal_size`). `conversion_rate` and `monthly_comparison` reports NOT registered.
**Frontend:** PARTIAL — Sales page has tabs for Summary, Destinations, Salesperson, Trip Type, Source, Deal Size, Forecast, Win/Loss. But data comes from fallback functions, not API.
**UX Issues:**
- Sales Summary doesn't show revenue — only lead count and conversion rate
- No conversion funnel visualization
- Monthly comparison is just a forecast line on same chart, not side-by-side comparison
**Fix Required:**
1. `backend/src/services/reports/sales-reports.ts` — Add `SUM(budget) as total_revenue`, `AVG(budget) as avg_deal_size` to sales_summary
2. Register `conversion_rate` and `monthly_comparison` reports
3. Wire frontend to API instead of fallback data

---

### TICKET-262: Sales Reports — By Destination, Salesperson, Trip Type & Lead Source — PARTIAL
**Backend:** PARTIAL — `sales_by_destination` and `sales_by_source` registered. `sales_by_salesperson` and `sales_by_trip_type` NOT registered.
**Frontend:** PARTIAL — UI tabs exist for all 4 but use fallback data
**Fix Required:**
1. Register `sales_by_salesperson` and `sales_by_trip_type` in backend
2. Wire frontend to actual API

---

### TICKET-263: Sales Reports — Avg Deal Size, Revenue Forecast & Win/Loss — PARTIAL
**Backend:** PARTIAL — `win_loss_analysis` registered but is minimal (just status + count, no reasons, destinations, or trend). `avg_deal_size` and `revenue_forecast` NOT registered.
**Frontend:** PARTIAL — UI has Deal Size trend tab and Win/Loss tab with mock data
**Fix Required:**
1. Register `avg_deal_size`, `revenue_forecast` reports
2. Enhance `win_loss_analysis` to include `lost_reason`, `won_reason` fields
3. Wire frontend tabs to API

---

### TICKET-264: Lead Reports — Pipeline Summary, Ageing & Velocity — PARTIAL
**Backend:** PARTIAL — All 3 registered but simplified:
- `pipeline_summary` — missing `SUM(budget)` (uses `SUM(budget)` correctly), but missing `avg_days_in_stage`
- `lead_ageing` — groups by `assigned_to` instead of showing individual leads with health status
- `lead_velocity` — shows monthly lead count, not time-to-close metrics
**Frontend:** PARTIAL — UI exists with fallback data
**Fix Required:**
1. Enhance `lead_ageing` to return individual leads with `days_in_stage` and health color coding
2. Enhance `lead_velocity` to compute avg days from creation to won

---

### TICKET-265: Lead Reports — Source Analysis, Response Time & Follow-Up Compliance — PARTIAL
**Backend:** MISSING — None of these 3 reports registered. `lead_source_analysis`, `lead_response_time`, `followup_compliance` don't exist.
**Frontend:** PARTIAL — Tabs exist for Source Analysis, Response Time, Follow-up Compliance with fallback data
**Fix Required:**
1. Register all 3 report definitions in `backend/src/services/reports/lead-reports.ts`

---

### TICKET-266: Lead Reports — Hot Leads, Lost Analysis, Unassigned & Duplicates — PARTIAL
**Backend:** MISSING — None of these 4 reports registered. Hot leads data comes from dashboard endpoint, not report engine.
**Frontend:** PARTIAL — Hot Leads table and Lost Reason pie chart exist in leads report page with fallback data. Unassigned and Duplicate reports not present as separate views.
**Fix Required:**
1. Register `hot_leads`, `lost_analysis`, `unassigned_leads`, `duplicate_leads` reports
2. Add Unassigned and Duplicate views to frontend

---

### TICKET-267: Financial Reports — Revenue, Collections & Outstanding — PARTIAL
**Backend:** PARTIAL — `revenue_summary` and `collections_report` registered. Custom `/outstanding` and `/ageing` endpoints exist with real SQL queries. But these aren't in the report registry (can't use report engine features like export/comparison).
**Frontend:** PARTIAL — Revenue overview, collections chart, outstanding receivables/payables tables exist with fallback data. Financial page imports `client` and `API_ENDPOINTS` directly but also has fallback data.
**Fix Required:**
1. Wire outstanding/ageing to the existing dedicated backend endpoints
2. Register receivables/payables as formal reports for export support

---

### TICKET-268: Financial Reports — P&L, Tax, Payment Methods & Refunds — PARTIAL
**Backend:** PARTIAL — `tax_report` registered (basic: total_tax + total_revenue). Missing: `pnl_by_lead`, `payment_method_breakdown`, `refund_report`.
**Frontend:** PARTIAL — UI tabs exist for P&L, Tax, Payment Methods, Refunds, Daily Cash with fallback data
**Fix Required:**
1. Register `pnl_by_lead`, `payment_method_breakdown`, `refund_report` in backend
2. Wire frontend to API

---

### TICKET-269: Financial Reports — Advances & Daily Cash — MISSING
**Backend:** MISSING — No `advance_payments` or `daily_cash` reports registered
**Frontend:** PARTIAL — Daily Cash tab exists on financial page with fallback bar chart data. No Advance Payments dedicated view.
**Fix Required:**
1. Register `advance_payments` and `daily_cash` report definitions
2. Add Advance Payments tab/view to frontend

---

### TICKET-270: Team Reports — Dashboard & Individual Performance — PARTIAL
**Backend:** PARTIAL — `team_dashboard` registered but very basic (only won_deals + completed_tasks via subqueries, not revenue, conversion, response time, follow-ups)
**Frontend:** PARTIAL — Team page shows individual cards with mock data (Leads, Won, Revenue, Response Time, Completion %). Leaderboard with medals.
**Fix Required:**
1. Enhance `team_dashboard` query to include revenue, conversion rate, response time
2. Register `individual_performance` report
3. Wire frontend to API

---

### TICKET-271: Team Reports — Response Time, Activity & Task Completion — MISSING
**Backend:** MISSING — No `response_time_by_user`, `activity_report`, `task_completion` reports registered
**Frontend:** PARTIAL — Activity and Task Completion charts exist on team page with mock data
**Fix Required:**
1. Register all 3 report definitions
2. Wire frontend to API

---

### TICKET-272: Customer Reports — Repeat, LTV, Birthday & Dormant — PARTIAL
**Backend:** PARTIAL — `repeat_customers` and `customer_ltv` registered. Missing: `birthday_upcoming`, `dormant_customers`
**Frontend:** PARTIAL — Customer page has Segmentation, Top Customers, Repeat Analysis, Birthday table, Dormant table — all with fallback data
**Fix Required:**
1. Register `birthday_upcoming` and `dormant_customers` reports
2. Wire frontend to API

---

### TICKET-273: Visa & Supplier Reports — PARTIAL
**Backend:** PARTIAL — `visa_status_summary` (1 of 3 visa reports) and `supplier_usage` (1 of 3 supplier reports) registered. Missing: `pending_documents`, `visa_success_rate`, `supplier_payment_summary`, `supplier_outstanding`
**Frontend:** PARTIAL — Visa page has status summary, success rate by country, processing time, pending docs, expirations — all with fallback data. Supplier page has usage, category breakdown, payment summary, outstanding, ratings.
**Fix Required:**
1. Register missing visa and supplier report definitions
2. Wire frontend to API

---

### TICKET-274: Fleet & Marketing Reports — PARTIAL
**Backend:** PARTIAL — `fleet_utilization` (1 of 4 fleet) and `campaign_performance` (1 of 3 marketing) registered. Missing: `driver_performance`, `fleet_availability`, `trip_cost_analysis`, `lead_source_roi`, `bulk_message_delivery`
**Frontend:** PARTIAL — Fleet page has utilization, driver performance, trip costs. Marketing page has campaigns, ROI, email delivery, social metrics. All with fallback data.
**Fix Required:**
1. Register missing report definitions
2. Wire frontend to API

---

### TICKET-275: Report Navigation & Routes — PARTIAL
**Backend:** N/A (frontend-only)
**Frontend:** PARTIAL — Report index at `/reports` exists with 8 category cards. Navigation via sidebar "Reports" link under Intelligence section. Individual category pages exist at `/reports/sales`, `/reports/leads`, etc.
**UX Issues:**
- No search bar on Reports Hub to find individual reports
- No recently viewed reports section
- No favorite/pin reports (star icon)
- No breadcrumb navigation (Reports > Sales > Summary)
- Routes exist for categories but not individual report pages (no `/reports/sales-summary`, `/reports/conversion-rate`, etc.)
**Fix Required:**
1. Add search functionality to Reports Hub
2. Add recently viewed tracking (localStorage)
3. Add favorite/pin feature
4. Add breadcrumbs to sub-pages

---

### TICKET-276: Report Repository & Riverpod Providers — N/A (Flutter)
**Note:** This ticket specifies Flutter Riverpod providers and Freezed models. The desktop app uses Next.js, not Flutter. Desktop equivalent is `desktop/src/lib/api/reports.ts` which provides the API client.
**Desktop Equivalent Status:** DONE — API client exists with 18+ methods covering all report categories.
**UX Issues:**
- API methods return `any` types instead of strongly-typed report models
- No auto-refresh when date range changes (manual re-fetch needed)
- No local caching of report metadata

---

### TICKET-277: Report Screen Base Template — PARTIAL
**Note:** Ticket specifies a Flutter `ReportScreenTemplate` widget. Desktop equivalent would be a shared report page layout.
**Frontend:** PARTIAL — All 12 report pages share a common pattern (header with back button + title + date range + export, KPI cards, tabs, charts/tables) but it's **copy-pasted** rather than abstracted into a reusable template component.
**UX Issues:**
- No reusable `ReportPageTemplate` component — each page duplicates the layout
- No chart/table view toggle
- No "Pin to Dashboard" action
- No "Clear Cache" action
- No pull-to-refresh
- Error states show toast + fallback data instead of retry button
**Fix Required:**
1. Extract shared layout into `desktop/src/components/reports/report-page-template.tsx`
2. Include: date range, comparison toggle, export menu, loading/error/empty states
3. Reduce code duplication across 12 report pages

---

## Backend: Registered Reports Inventory

Total reports required by tickets: ~50+
Total reports actually registered: **15**

| Category | Registered | Required by Tickets | Gap |
|----------|-----------|-------------------|-----|
| Sales | 4 (sales_summary, sales_by_destination, win_loss_analysis, sales_by_source) | 10 (+ conversion_rate, monthly_comparison, sales_by_salesperson, sales_by_trip_type, avg_deal_size, revenue_forecast) | 6 missing |
| Leads | 3 (pipeline_summary, lead_ageing, lead_velocity) | 10 (+ lead_source_analysis, lead_response_time, followup_compliance, hot_leads, lost_analysis, unassigned_leads, duplicate_leads) | 7 missing |
| Financial | 3 (revenue_summary, collections_report, tax_report) + 2 custom endpoints | 10 (+ outstanding_receivables, outstanding_payables, pnl_by_lead, payment_method, refund, advance, daily_cash) | 7 missing |
| Team | 1 (team_dashboard) | 4 (+ individual_performance, response_time, activity, task_completion) | 3 missing |
| Customer | 2 (repeat_customers, customer_ltv) | 4 (+ birthday_upcoming, dormant_customers) | 2 missing |
| Visa | 1 (visa_status_summary) | 3 (+ pending_documents, visa_success_rate) | 2 missing |
| Supplier | 1 (supplier_usage) | 3 (+ supplier_payment, supplier_outstanding) | 2 missing |
| Fleet | 1 (fleet_utilization) | 4 (+ driver_performance, fleet_availability, trip_cost) | 3 missing |
| Marketing | 1 (campaign_performance) | 3 (+ lead_source_roi, bulk_delivery) | 2 missing |
| **TOTAL** | **15 + 2 custom** | **~51** | **~34 missing** |

---

## Bug Report

### BUG-1: Reports Hub fetches raw entity lists instead of dashboard endpoint
**File:** `desktop/src/app/(app)/reports/page.tsx:174-175`
**Issue:** Fetches `leadsApi.list({ limit: 500 })` and `invoicesApi.list({ limit: 500 })` to compute KPIs client-side. This is inefficient (transfers hundreds of records) and inaccurate (capped at 500). The backend already has `GET /reports/dashboard` that returns aggregated pipeline, financial, and follow-up data.
**Fix:** Replace with `reportsApi.getDashboard()` call.

### BUG-2: Fallback data silently replaces real data on API error
**File:** All 12 report pages (e.g., `desktop/src/app/(app)/reports/sales/page.tsx:24-89`)
**Issue:** Every report page defines `getFallback*()` functions that return hardcoded sample data. When the API call fails, the page silently shows this fake data with only a brief toast. Users cannot distinguish real data from fake data.
**Fix:** Show proper error states with retry button. Remove or clearly label fallback data as "Sample Data".

### BUG-3: Excel export uses USD formatting instead of INR
**File:** `backend/src/services/exports/excel-export.ts:35`
**Issue:** Currency format is `'"$"#,##0.00'` (USD) instead of `'"₹"#,##0.00'` (INR). The CRM is for Indian travel companies.
**Fix:** Change currency format to `'"₹"#,##0.00'`.

---

## Priority Fix Order

1. **HIGH** — Wire frontend report pages to actual backend APIs (replace fallback data)
2. **HIGH** — Register missing 34+ backend report definitions
3. **HIGH** — Integrate KV cache into reports route handler
4. **HIGH** — Fix Excel currency format (USD → INR)
5. **HIGH** — Fix Reports Hub to use dashboard endpoint
6. **MEDIUM** — Add drill-down endpoint and clickable cells
7. **MEDIUM** — Add period comparison toggle to frontend
8. **MEDIUM** — Create report_dashboard_widgets table + widget dashboard
9. **MEDIUM** — Create shared ReportPageTemplate component
10. **MEDIUM** — Add search, favorites, recently viewed to Reports Hub
11. **LOW** — Enhance PDF/Excel exports with titles, date ranges, summaries
12. **LOW** — Add chart loading skeletons and empty states
