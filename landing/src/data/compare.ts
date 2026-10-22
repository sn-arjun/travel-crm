/**
 * Comparison pages compare TravelCRM Pro with kinds of tool, never with a named product, so no claim about another
 * company can go stale. Each row is a job an agency does every week.
 */
export interface Comparison {
  slug: string;
  name: string;
  title: string;
  description: string;
  verdict: string;
  dayOne: string[];
  rows: [job: string, them: string, us: string][];
}

export const COMPARISONS: Comparison[] = [
  {
    slug: 'excel-and-whatsapp', name: 'Excel and WhatsApp',
    title: 'TravelCRM Pro vs Excel and WhatsApp',
    description: 'Moving a travel agency off spreadsheets and phone chats: what changes on day one, job by job.',
    verdict: 'Spreadsheets and chats cost nothing to start, and they stop scaling the day a second person answers enquiries. TravelCRM Pro keeps the WhatsApp your customers already use and puts every message, quote and payment on one record.',
    dayOne: ['Every WhatsApp and email enquiry lands on a customer record, not on one person’s phone.', 'Quotes come from your rate cards, so two people quote the same price.', 'Invoices carry your tax rules and numbering automatically.', 'You see who owes what without asking the accountant.'],
    rows: [
      ['Capture an enquiry', 'Copied from chat into a sheet, if someone remembers', 'Read from WhatsApp, email or your website and filed as a lead'],
      ['Quote from your rates', 'Rates in a file; totals typed by hand', 'Rate cards picked in the builder; totals, markup and tax worked out'],
      ['Tax invoice', 'Made in a separate tool or a template', 'One click from the quote, with GST, VAT or sales tax and your numbering'],
      ['Vouchers', 'Typed for each hotel and cab', 'Generated from the booking'],
      ['Group departures', 'A seat list in a sheet', 'Seats, holds, waitlist, manifests and rooming lists'],
      ['Driver and cab', 'Phone calls on the day', 'Driver app with trip status and check-in'],
      ['Follow-up', 'Whoever remembers', 'Reminders and sequences, drafted for you'],
      ['Price', 'Free, paid in staff hours', 'One price per agency per year, users included'],
    ],
  },
  {
    slug: 'generic-crm', name: 'a generic CRM',
    title: 'TravelCRM Pro vs a generic CRM',
    description: 'Why a sales CRM built for every industry leaves travel agencies doing quotes, invoices and vouchers somewhere else.',
    verdict: 'A general CRM tracks deals well and stops at the deal. A travel agency’s work starts there: the itinerary, the supplier rates, the tax invoice, the voucher and the driver. TravelCRM Pro covers the trip, not only the sale.',
    dayOne: ['Quotes are day-by-day itineraries, not line items.', 'Supplier rate cards and contracts feed the price.', 'Invoices follow travel tax rules, including margin schemes.', 'Operations, vouchers and drivers live on the same booking.'],
    rows: [
      ['Capture an enquiry', 'Forms and email; WhatsApp often an add-on', 'WhatsApp, email, SMS, calls and website in one inbox'],
      ['Quote from your rates', 'Generic product catalogue', 'Day-wise itineraries priced from your hotel and transport rate cards'],
      ['Tax invoice', 'Usually through a separate accounting tool', 'Built in: GST with HSN/SAC, VAT, margin scheme, sales tax'],
      ['Vouchers', 'Not part of a sales CRM', 'Hotel, transport, flight and activity vouchers'],
      ['Group departures', 'Not part of a sales CRM', 'Tours, dated departures, seats and manifests'],
      ['Driver and cab', 'Not part of a sales CRM', 'Fleet, double-booking check and a driver app'],
      ['Follow-up', 'Sequences and tasks', 'Sequences and tasks, plus trip-based follow-ups'],
      ['Price', 'Usually per user per month', 'One price per agency per year, users included'],
    ],
  },
  {
    slug: 'travel-back-office', name: 'travel back-office software',
    title: 'TravelCRM Pro vs travel back-office software',
    description: 'Back-office and accounting systems for travel handle the books. Here is what changes when sales, operations and the books share one record.',
    verdict: 'Back-office systems are strong on accounting and weak at the front desk, where enquiries arrive on WhatsApp at ten at night. TravelCRM Pro starts from the enquiry and carries it to the invoice, so nothing is typed twice.',
    dayOne: ['Sales and accounts look at the same booking.', 'Enquiries from WhatsApp and email become leads without retyping.', 'Customers accept quotes and pay deposits online.', 'Setup takes a 30-minute call, not a project.'],
    rows: [
      ['Capture an enquiry', 'Often outside the system', 'WhatsApp, email and website enquiries become leads'],
      ['Quote from your rates', 'Varies; often separate from sales', 'Rate cards inside the itinerary builder'],
      ['Tax invoice', 'Strong', 'Built in, from the quote or booking'],
      ['Vouchers', 'Usually available', 'Generated from the booking'],
      ['Group departures', 'Varies', 'Seats, holds, waitlist, extras and manifests'],
      ['Driver and cab', 'Rarely included', 'Fleet and a driver app'],
      ['Follow-up', 'Rarely included', 'Reminders, sequences and campaigns'],
      ['Price', 'Often setup fees and per-seat licences', 'One yearly price per agency, onboarding call included'],
    ],
  },
];
