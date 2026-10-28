/** Copy blocks shared by the home page and the region pages (ported from the approved preview). */

export const FACTS = [
  { k: 'INBOX', v: 'WhatsApp, SMS, email and calls in one inbox' },
  { k: 'FLOW', v: 'Quote, invoice and voucher in one flow' },
  { k: 'TOURS', v: 'Group departures sold seat by seat' },
  { k: 'CONTROL', v: 'Roles and permissions for every department' },
];

/** Hero board rows: time, guest, destination, via, status cycle (Q quoted, B booked, P paid), cycle delay seconds. */
export const BOARD: [string, string, string, string, string, number][] = [
  ['10:42', 'MEHTA FAMILY', 'GOA', 'WA', 'QBP', 0], ['10:45', 'R. SHAH', 'DUBAI', 'WEB', 'BPQ', 1.2],
  ['10:47', 'J. SMITH (UK)', 'KERALA', 'MAIL', 'PQB', 2.1], ['10:49', 'A. NAIR', 'BALI', 'WA', 'QBP', 3.3],
  ['10:51', "D. O'BRIEN (AU)", 'RAJASTHAN', 'WEB', 'BPQ', 4.4], ['10:52', 'K. PATEL', 'SINGAPORE', 'WA', 'QBP', 5.6],
];
export const STATUS: Record<string, [string, string]> = { Q: ['QUOTED', '#FFB21A'], B: ['BOOKED', '#5B8DF6'], P: ['PAID ✓', '#2FBF71'] };

export interface SceneRow { a: string; b: string; bg: string; fg: string }
export const TRIP = [
  { no: '01', when: 'TUESDAY · 10:42', title: 'The assistant reads it first.', pm: 'RECEIVED\n10:42\nWHATSAPP', pmColor: 'var(--ink2)', check: 'Enquiry read',
    text: 'The message lands in one inbox, filed under the right customer. Destination, dates, travellers and budget are picked out, and the assistant suggests the lead. You click Apply.',
    scene: [
      { a: '“4 of us, Goa 20–25 Dec, budget around 80k. Pool hotel please!”', b: 'WHATSAPP', bg: '#DCF8C6', fg: '#15181B' },
      { a: 'GOA · 20–25 DEC · 4 TRAVELLERS · ₹80K', b: 'PICKED OUT', bg: 'var(--chip)', fg: 'var(--ink)' },
      { a: 'Suggested: create contact and lead for the Mehta family', b: 'APPLY ▸', bg: 'var(--board)', fg: 'var(--amber)' },
    ] },
  { no: '02', when: 'TUESDAY · 10:58', title: 'A quote from your own rate cards.', pm: 'QUOTED\n10:58\nGOA 5N', pmColor: 'var(--runway)', check: 'Quote sent',
    text: 'Start from the closest template. Prices come from your supplier rate cards. The customer gets a PDF and a link, and accepts the quote from it. Versions keep every change.',
    scene: [
      { a: 'Day 1 · pool resort, 5 nights, 2 rooms', b: '₹64,176', bg: 'transparent', fg: 'var(--ink)' },
      { a: 'Day 2 · North Goa forts and beaches, private cab', b: '₹4,800', bg: 'transparent', fg: 'var(--ink)' },
      { a: 'Day 3 · Dudhsagar jeep safari  ·  Day 6 · airport drop', b: '₹11,500', bg: 'transparent', fg: 'var(--ink)' },
      { a: 'Total for 4, incl. 5% GST', b: '₹84,500', bg: 'var(--board)', fg: 'var(--amber)' },
    ] },
  { no: '03', when: 'THURSDAY', title: 'Invoiced in your tax. Paid.', pm: 'PAID\n14 NOV\nINV-0142', pmColor: 'var(--paid)', check: 'Invoice paid',
    text: 'GST with HSN codes in India, VAT in the UK and Europe, sales tax or none elsewhere, in your currency. Take the deposit online, issue credit notes, and send hotel and transport vouchers from the same booking.',
    scene: [
      { a: 'Goa Family Escape · 5N', b: '₹80,476', bg: 'transparent', fg: 'var(--ink)' },
      { a: 'CGST 2.5% + SGST 2.5%', b: '₹4,024', bg: 'transparent', fg: 'var(--ink2)' },
      { a: 'Paid online · UPI', b: '₹84,500 ✓', bg: 'var(--chip)', fg: 'var(--paid)' },
    ] },
  { no: '04', when: '20 DECEMBER · 06:30', title: 'Your cab is at arrivals.', pm: 'DISPATCHED\n20 DEC\nGOX', pmColor: 'var(--amber)', check: 'Driver assigned',
    text: 'Assign your own vehicle and driver with a double-booking check. The driver accepts in the app and updates the status at each step, so the office sees it as it happens.',
    scene: [
      { a: 'Ravi K. · Innova KA-01 ••• 4821 · 4 pax', b: 'ACCEPTED', bg: 'transparent', fg: 'var(--ink)' },
      { a: 'Goa Airport (GOX) → resort', b: 'EN ROUTE', bg: 'var(--board)', fg: 'var(--paid)' },
    ] },
  { no: '05', when: 'AFTER THE TRIP', title: 'The next trip, drafted for you.', pm: 'DELIVERED\nHOME\nSAFE', pmColor: 'var(--red)', check: 'Follow-up drafted',
    text: 'A review request and a follow-up are drafted for your team. A person reads them and sends them.',
    scene: [
      { a: '“Hi Priya! Shall I send a Kerala backwaters plan for next December?”', b: 'DRAFT', bg: 'var(--chip)', fg: 'var(--ink)' },
      { a: 'Waiting for your approval', b: 'SEND ▸', bg: 'var(--board)', fg: 'var(--amber)' },
    ] },
];

export const AGENCIES = [
  { k: 'retail', code: 'ROUTE 01', label: 'Retail agency', sub: 'Holidays, honeymoons, family trips', plan: 'BASIC OR PRO',
    promise: 'Answer every enquiry fast, quote from your own rates, get paid.',
    features: ['One inbox for WhatsApp, email, SMS and calls', 'Quotes from your rate cards, accepted online', 'GST or VAT invoices, payment links and instalments', 'Hotel and cab vouchers, with the driver app', 'Follow-ups and campaigns for the next trip'],
    sceneTitle: 'INBOX → QUOTE', sceneMeta: 'TUESDAY · 10:42', sceneLabel: 'Example: a WhatsApp enquiry becoming a quote', seats: null as null | [number, number, number],
    scene: [['“4 of us, Goa 20–25 Dec, pool hotel please”', 'WHATSAPP', '#DCF8C6', '#15181B'], ['Lead created · Mehta family · 4 pax', 'APPLIED', 'var(--flap)', 'var(--boardtext)'],
      ['Quote GOA-5N v2 · from your rate cards', '₹84,500', 'var(--flap)', 'var(--boardtext)'], ['Accepted on the link · deposit invoice raised', 'BOOKED ✓', 'var(--flap)', 'var(--paid)']] },
  { k: 'tour', code: 'ROUTE 02', label: 'Tour operator', sub: 'Fixed and group departures, coach tours', plan: 'PRO AND ENTERPRISE',
    promise: 'Sell dated departures seat by seat, and run them to the last check-in.',
    features: ['Tours with dated departures, seats and a waitlist', 'A booking page with deposit, on your own website', 'Extras, age-band prices, rooming lists and manifests', 'Coach stops and passenger check-in in the driver app', 'Messages sent days before every departure'],
    sceneTitle: 'RAJASTHAN FORTS · 14 MAR', sceneMeta: 'COACH · 8 DAYS', sceneLabel: 'Example: a departure with 32 of 40 seats taken', seats: [29, 3, 40] as null | [number, number, number],
    scene: [['Rooming list · 16 twin, 4 single', 'PDF', 'var(--flap)', 'var(--boardtext)'], ['Extras · camel safari · 22 sold', 'CUT-OFF 7 MAR', 'var(--flap)', 'var(--amber)'],
      ['Reminder to 32 travellers · 3 days before', 'SCHEDULED', 'var(--flap)', 'var(--boardtext)'], ['Jaipur stop · 31 of 32 checked in', 'ON BOARD', 'var(--flap)', 'var(--paid)']] },
  { k: 'dmc', code: 'ROUTE 03', label: 'DMC & B2B', sub: 'Selling through agents and partners', plan: 'ENTERPRISE',
    promise: 'Sell through agents under their brand, with markup set per agent category.',
    features: ['A B2B portal for sub-agents with their own logins', 'Markup by agent category and white-label quotes', 'Hotel contracts with allotments, blackouts and supplements', 'Supplier queries, bills, ledger and payables', 'Several brands under one login, with API and webhooks'],
    sceneTitle: 'B2B PORTAL', sceneMeta: 'AGENT BOOKINGS · TODAY', sceneLabel: 'Example: sub-agent bookings with category markup', seats: null as null | [number, number, number],
    scene: [['Horizon Travels · GOLD · markup 8%', 'KERALA 6N', 'var(--flap)', 'var(--boardtext)'], ['Sunrise Holidays · SILVER · markup 12%', 'GOA 4N', 'var(--flap)', 'var(--boardtext)'],
      ['Allotment · Taj Exotica · 6 of 10 rooms left', 'HOLD', 'var(--flap)', 'var(--amber)'], ['Quote sent under Horizon Travels brand', 'SENT ✓', 'var(--flap)', 'var(--paid)']] },
];

export type Topic = 'start' | 'price' | 'msg' | 'ops' | 'data';
export const TOPICS: [Topic | 'all', string][] = [['all', 'All topics'], ['start', 'Getting started'], ['price', 'Pricing & tax'], ['msg', 'WhatsApp & email'], ['ops', 'Operations & departures'], ['data', 'Data & security']];
export const TOPIC_TAG: Record<Topic, string> = { start: 'START', price: 'PRICE', msg: 'MSG', ops: 'OPS', data: 'DATA' };

export const FAQS: { t: Topic; q: string; a: string }[] = [
  { t: 'start', q: 'How long does it take to start?', a: 'We set you up together in a 30-minute call: your company details, tax and invoice numbering, your first team members, and your contacts imported from a spreadsheet.' },
  { t: 'start', q: 'Can you move my data from Excel or another CRM?', a: 'Yes. The import wizard takes contacts, leads, suppliers, rate cards and travellers from a spreadsheet, and we help you map the columns. You can export every list again at any time.' },
  { t: 'start', q: 'Which devices does it run on?', a: 'A desktop app for Windows and Mac for the office, and a driver app on the phone for trips, stops and passenger check-in.' },
  { t: 'start', q: 'Which languages can my team use?', a: 'English, Hindi, Arabic and Dutch screens. Invoices, emails and PDFs follow the language you set for your agency.' },
  { t: 'price', q: 'Is the price per user?', a: 'No. One price per agency per year with a number of users included. You can add more users at any time at the price shown on each plan.' },
  { t: 'price', q: 'What does the founding price mean?', a: 'Agencies that sign before 1 April 2027 pay 20% less, and that price is locked for 24 months.' },
  { t: 'price', q: 'What if we use up our AI credits or WhatsApp messages?', a: 'Buy a pack, priced from our cost. If AI credits run out, the assistant keeps working on fixed rules: it still files messages, creates leads and schedules follow-ups.' },
  { t: 'price', q: 'Which plan do I need for group departures?', a: 'Pro or Enterprise. Coach trips with check-in, age-band prices, margin-scheme invoices and accepting quotes online are on every plan.' },
  { t: 'price', q: 'Do invoices follow my tax rules?', a: 'Yes. GST with HSN/SAC codes in India, VAT in the UK and Europe, GST in Australia, sales tax or none in the US. UK and EU tour operators can issue margin-scheme invoices.' },
  { t: 'msg', q: 'Does the assistant message my customers?', a: 'Replies it drafts wait for a person to read and send them. Automatic messages, such as the first reply, departure reminders and campaigns, go out only when an admin switches them on, to customers who agreed, within daily limits.' },
  { t: 'msg', q: 'Is it the official WhatsApp Business API?', a: 'Yes. You connect your own number to the WhatsApp Business Platform. Template messages are approved by Meta and counted in your monthly allowance.' },
  { t: 'msg', q: 'Can I call customers from the app?', a: 'Yes. Calls, a keypad menu (IVR), voicemail and recordings sit on the lead. Phone numbers are available in the UK, US, Australia and Europe; in India you log calls made from your own phone.' },
  { t: 'msg', q: 'Can I see if a customer opened my email?', a: 'Yes. Every email shows delivered, opened and clicked, and replies land in the same customer thread.' },
  { t: 'ops', q: 'Can I run fixed departures and group tours?', a: 'Yes. Create tours with dated departures, sell seats with holds and a waitlist, add extras, and print manifests and rooming lists. Each departure has a booking page that takes a deposit.' },
  { t: 'ops', q: 'Do you support B2B sub-agents?', a: 'On Enterprise. Sub-agents get their own portal and logins, you set the markup per agent category, and quotes go out under their brand.' },
  { t: 'ops', q: 'Can customers accept and pay online?', a: 'Yes. The customer accepts the quote from its link, which books it and raises the deposit invoice. They pay through your own Razorpay or Stripe account, including UPI, iDEAL and SEPA.' },
  { t: 'ops', q: 'How deep are hotel contracts?', a: 'Rate cards by season with room types and meal plans, allotments, blackout dates and stop-sale, holiday supplements and day-of-week prices. The builder picks the contracted rate for you.' },
  { t: 'data', q: 'Where is my data kept?', a: 'Every agency has its own separate database. Nobody outside your team sees it, and our support only signs in to your workspace when you ask.' },
  { t: 'data', q: 'Who can see costs and margins?', a: 'Only the roles you allow. Each department gets its own permissions, and the activity log shows who changed what.' },
  { t: 'data', q: 'Can I take my data with me?', a: 'Yes. Export any list to a spreadsheet, or the whole workspace at once.' },
];
