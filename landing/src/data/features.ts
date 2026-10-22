/**
 * Every feature the site lists, in the order a trip moves. This list is the public promise: launch waits until every
 * row is done (see the launch readiness tracker). `plan` is the first plan that includes the feature:
 * 1 = every plan, 2 = Pro and up, 3 = Enterprise. Placements set in the pricing catalogue
 * (backend/drizzle/master/0026, 0030) are fixed; the rest are the owner's to confirm.
 */
export type PlanLevel = 1 | 2 | 3;
export interface FeatureModule {
  k: string;
  label: string;
  title: string;
  line: string;
  items: [name: string, plan: PlanLevel][];
}

export const MODULES: FeatureModule[] = [
      { k: 'SAL', label: 'SALES', title: 'Sales', line: 'Every enquiry captured, assigned and followed up until it is won.', items: [
        ['Enquiries from WhatsApp, email, SMS, calls, forms and webhooks', 1], ['Leads assigned automatically by weight, round-robin or source', 1],
        ['Bulk assign and reassign leads', 1], ['Customer profiles with history, tags and custom fields', 1],
        ['End-to-end lead management, from enquiry to won', 1], ['Drag-and-drop sales pipeline and live dashboard', 1],
        ['Lead status that moves on its own as the trip moves', 2], ['Instant first reply to every new enquiry', 2],
        ['Tasks and reminders for every person', 1], ['Follow-up sequences you set per status', 1],
        ['Response-time targets (SLA) with alerts', 2], ['Direct WhatsApp Business integration', 1],
        ['One email inbox, with replies sent from it', 1], ['Turn an email into an enquiry in one click', 1],
        ['Email open and click tracking', 1], ['Calling from the app, with IVR menu and voicemail', 1],
        ['Call tracking and recordings on the lead', 1], ['Team notes, @mentions and shared contacts', 1],
        ['Documents stored on each customer and trip', 1], ['Live view of every trip running today', 1],
        ['Auto-costing with rates and totals', 1], ['Markup and tax per component', 1],
        ['Branded quotation PDFs in your layout', 1], ['Reuse and clone old quotations', 1],
        ['AI itinerary builder', 2], ['Payment gateway: Razorpay, Stripe, UPI, iDEAL, SEPA', 1],
        ['Payment schedules and instalments', 1], ['Hotel sourcing through supplier APIs', 3],
        ['Sub-agent markup and branding', 3],
      ] },
      { k: 'QUO', label: 'QUOTES', title: 'Quotation', line: 'Day-by-day quotes from your own rates, accepted and paid online.', items: [
        ['Day-wise itineraries with photos', 1], ['Inclusions and exclusions on every quote', 1],
        ['Totals per component: hotel, transport, activities', 1], ['Age-band prices for adults, children and infants', 1],
        ['Share by WhatsApp, email, PDF or link', 1], ['Accept and book on the quote link, with a deposit', 1],
        ['Export to Word', 1], ['Content library of hotels, sights and images', 2],
        ['White-label quotes for sub-agents', 3], ['Sub-agent self-service quoting', 3],
      ] },
      { k: 'OPS', label: 'OPERATIONS', title: 'Operations', line: 'Contracts, suppliers, vouchers and vehicles for every booking.', items: [
        ['Booking management for every trip', 1], ['Instant vouchers and invoices from a booking', 1],
        ['Assign hotels, cabs and guides to each service', 1], ['Ground operations with the driver app', 1],
        ['Cab and transport scheduling with a double-booking check', 1], ['Per-day transport billing', 1],
        ['Hotel and trip vouchers', 1], ['Booking status and quote validity', 1],
        ['Supplier contracts with expiry reminders', 1], ['Hotel rate contracting by season', 1],
        ['Room-type and meal-plan rates', 1], ['Contracted rates inside the itinerary builder', 1],
        ['Auto-costing from your contracts', 1], ['Bulk upload of hotels and services', 1],
        ['CSV import for every list', 1], ['Availability queries to suppliers', 1],
        ['Supplier ledger', 1], ['Smart tour calendar', 2],
        ['Operational insights from AI', 2], ['Blackout dates and stop-sale', 2],
        ['Supplier inventory and allotments', 2], ['Holiday and event supplements', 2],
        ['Day-of-week pricing', 2], ['Combo activities', 2],
        ['One builder for B2C, B2B and DMC rates', 3],
      ] },
      { k: 'DEP', label: 'DEPARTURES', title: 'Fixed & group departures', line: 'Dated departures sold seat by seat and run from one board.', items: [
        ['Coach trips with stops and passenger check-in', 1], ['Group and fixed departures', 2],
        ['Many dates created in one go', 2], ['Seat control with holds and a waitlist', 2],
        ['Departures dashboard with live seats', 2], ['Extras and add-ons with cut-off dates', 2],
        ['Shareable booking page with a deposit', 2], ['Automatic invoice for every seat', 2],
        ['Automatic vouchers after payment', 2], ['Payment collection and tracking', 2],
        ['Manifests and rooming lists in PDF and CSV', 2], ['Secure traveller documents', 2],
        ['Smart tasks when seats run low', 2], ['Messages sent days before and after each departure', 2],
        ['Supplier messages per departure', 2], ['Departure sales and seat reports', 2],
      ] },
      { k: 'FIN', label: 'FINANCE', title: 'Finance & accounting', line: 'Invoices in your tax, payments in, suppliers paid, profit per trip.', items: [
        ['One-click invoices from a quote or booking', 1], ['GST, VAT or sales-tax invoices with HSN/SAC', 1],
        ['Margin-scheme invoices for UK and EU tour operators', 1], ['Proforma invoices', 1],
        ['Credit and debit notes', 1], ['Online payments for travellers', 1],
        ['Real-time payment tracking', 1], ['Collection dashboard', 1],
        ['Receivables and payables with ageing', 1], ['Supplier bills and payments ledger', 1],
        ['Supplier and collection tracking', 1], ['Financial view of every booking', 1],
        ['Trip-level accounting', 1], ['Profit per trip and per lead', 1],
        ['Multi-currency with exchange rates', 1], ['GST return reports (GSTR-1, GSTR-3B)', 1],
      ] },
      { k: 'MKT', label: 'MARKETING', title: 'Marketing', line: 'Leads from every source, and campaigns that bring travellers back.', items: [
        ['Website and landing-page lead sync', 1], ['Email lead sync', 1],
        ['Facebook and Instagram lead ads sync', 2], ['Travel portal lead sync', 2],
        ['WhatsApp campaigns', 2], ['Email campaigns to customer segments', 2],
        ['Website chatbot that captures contacts', 3], ['Custom webhooks in and out', 3],
      ] },
      { k: 'WEB', label: 'WEBSITE', title: 'Website & self-service', line: 'Your website and portals, run from the same data as your CRM.', items: [
        ['A website for your agency, run from the CRM', 1], ['Live tours and prices on your website', 2],
        ['Online holiday package booking', 2], ['Customer self-service portal', 2],
        ['Live trip tracking for travellers', 2], ['Your own domain', 2],
        ['B2B website for agents', 3], ['B2B sub-agent portal', 3],
        ['Markup by agent category', 3], ['B2B guest management', 3],
        ['Hotel booking engine', 3],
      ] },
      { k: 'REP', label: 'REPORTS', title: 'Reports', line: 'Every number on the dashboard opens the list behind it.', items: [
        ['Real-time dashboard and reports', 1], ['Sales reports', 1],
        ['Collection reports', 1], ['Supplier database and ledger reports', 1],
        ['Trip check-in and check-out reports', 1], ['Bulk payment clearance', 1],
        ['Profit and loss statement', 2], ['AI business insights', 2],
      ] },
      { k: 'PLT', label: 'PLATFORM', title: 'Platform', line: 'One secure workspace for every team, brand and language.', items: [
        ['Roles and permissions for every department', 1], ['Two-factor sign-in and activity log', 1],
        ['A separate database for every agency', 1], ['Built for high volumes of enquiries', 1],
        ['Desktop app for Windows and Mac, driver app for phones', 1], ['English, Hindi, Arabic and Dutch', 1],
        ['One yearly price with users included', 1], ['Free updates', 1],
        ['Several brands under one login', 3], ['White label', 3],
        ['API access', 3],
      ] },
      { k: 'SUP', label: 'SUPPORT', title: 'Support', line: 'We move you in and stay with you after.', items: [
        ['Guided onboarding call', 1], ['Data migration from Excel or your old CRM', 1],
        ['Help centre, tickets and chat', 1], ['Priority support', 3],
      ] },
    ];

export const FEATURE_TOTAL = MODULES.reduce((n, m) => n + m.items.length, 0);
export const featuresInPlan = (lvl: PlanLevel) => MODULES.reduce((n, m) => n + m.items.filter(([, p]) => p <= lvl).length, 0);
export const slug = (m: FeatureModule) => m.title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const PLAN_TAG: Record<PlanLevel, string> = { 1: 'ALL PLANS', 2: 'PRO +', 3: 'ENTERPRISE' };
