/**
 * Demo dataset for the client videos — "Sahyadri Holidays".
 * Single source of truth (STORYBOARD section A). Imported by demo-seed.ts and by every showcase spec.
 *
 * Written in erasable TypeScript only (no enums / namespaces / parameter properties) so that
 * `node demo-seed.ts` runs without a transpiler (Node >= 22.18 strips types natively).
 *
 * Every date is relative to D0 = "today" in Asia/Kolkata (override with DEMO_D0=YYYY-MM-DD).
 */

// ─── Dates (IST) ─────────────────────────────────────────────────

const IST_OFFSET_MIN = 330;

/** Split "2026-10-03" / "09:30" into three numbers (noUncheckedIndexedAccess-safe). */
function nums(s: string, sep: string): [number, number, number] {
  const p = s.split(sep).map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

/** Shift a Date by the IST offset so UTC getters read IST wall-clock. */
function istWall(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
}

export function nowIST(): { date: string; hhmm: string; minutes: number } {
  const w = istWall(new Date());
  const iso = w.toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16), minutes: w.getUTCHours() * 60 + w.getUTCMinutes() };
}

export function d0(): string {
  return process.env.DEMO_D0 || nowIST().date;
}

/** YYYY-MM-DD for D0 + offset days. */
export function day(offset: number): string {
  const [y, m, dd] = nums(d0(), '-');
  const t = new Date(Date.UTC(y, m - 1, dd + offset));
  return t.toISOString().slice(0, 10);
}

/** UTC ISO instant for D0+offset at the given IST wall-clock time. */
export function at(offset: number, hhmm: string): string {
  const [h, mi] = nums(hhmm, ':');
  const [y, m, dd] = nums(day(offset), '-');
  return new Date(Date.UTC(y, m - 1, dd, h, mi) - IST_OFFSET_MIN * 60_000).toISOString();
}

/** UTC ISO instant for "now + minutes". */
export function inMinutes(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

/** Round "now + leadMin" up to the next quarter hour (IST wall clock). Returns UTC ISO + HH:MM IST. */
export function pickupTime(leadMin = 50): { iso: string; hhmm: string; minutesOfDay: number } {
  // DEMO_PICKUP=HH:MM pins the flight to a daytime slot (IST) when the take is recorded outside 08:00-20:30; still "today".
  const pinned = process.env.DEMO_PICKUP;
  if (pinned && /^\d{1,2}:\d{2}$/.test(pinned)) {
    const [h, m] = nums(pinned, ':');
    const [y, mo, dd] = nums(d0(), '-');
    const when = new Date(Date.UTC(y, mo - 1, dd, h, m) - IST_OFFSET_MIN * 60_000);
    return { iso: when.toISOString(), hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, minutesOfDay: h * 60 + m };
  }
  const t = Date.now() + leadMin * 60_000;
  const q = 15 * 60_000;
  const rounded = new Date(Math.ceil(t / q) * q);
  const w = istWall(rounded);
  const hhmm = w.toISOString().slice(11, 16);
  return { iso: rounded.toISOString(), hhmm, minutesOfDay: w.getUTCHours() * 60 + w.getUTCMinutes() };
}

export const TRAVEL_START_OFFSET = 76;

// ─── Identity ────────────────────────────────────────────────────

export const TENANT_ID = '01960000-0000-7000-8000-000000000001';
export const ADMIN_ID = '01960000-0000-7000-8000-0000000000a1';
/** The signed-in demo user's email (STORYBOARD A.9 #2). seed-demo.mjs renames the account to this after /test/reset. */
export const DEMO_EMAIL = 'ananya.menon@example.com';
/** What /test/reset creates before the rename. Only the seeder's first login uses it. */
export const BOOTSTRAP_EMAIL = 'admin@demo.com';
export const DEMO_PASSWORD = 'Admin@123';

export const COMPANY = {
  company_name: 'Sahyadri Holidays Pvt. Ltd.',
  company_email: 'hello@sahyadriholidays.in',
  company_phone: '+91 80 4718 2290',
  company_website: 'www.sahyadriholidays.in',
  gstin: '29AAPCS7341M1Z8',
  company_address: '2nd Floor, 14 HAL 100 Feet Road, Indiranagar',
  company_city: 'Bengaluru',
  company_state: 'Karnataka',
  company_postal_code: '560038',
  company_country: 'India',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  language: 'en',
};

export const NUMBERING = {
  invoice_prefix: 'SH-INV',
  proforma_prefix: 'SH-PI',
  receipt_prefix: 'SH-RCP',
  credit_note_prefix: 'SH-CN',
  debit_note_prefix: 'SH-DN',
  voucher_prefix: 'SH-VCH',
};

export const INVOICE_DEFAULTS = {
  bank_details: {
    bankName: 'HDFC Bank, Indiranagar Branch',
    accountName: 'Sahyadri Holidays Pvt. Ltd.',
    accountNumber: '50200081234567',
    ifsc: 'HDFC0001234',
  },
  default_payment_terms: '50% advance to confirm; balance due 21 days before travel.',
  default_tax_rate: 5,
  default_tax_type: 'gst',
  gstin: '29AAPCS7341M1Z8',
  company_state: 'Karnataka',
};

export const ITINERARY_DEFAULTS = {
  defaultCurrency: 'INR',
  defaultTerms:
    '50% advance confirms the booking; balance 21 days before departure. Cancellation: 30+ days 10%, 15–29 days 25%, under 15 days 50%, no-show 100%. Hotel check-in 14:00, check-out 11:00.',
  defaultInclusions: [
    'Accommodation as specified',
    'Daily breakfast',
    'Private air-conditioned vehicle with chauffeur',
    'All transfers and sightseeing as per itinerary',
    'GST',
  ],
  defaultExclusions: ['Airfare unless stated', 'Monument and camera fees not listed', 'Personal expenses', 'Travel insurance'],
};

// ─── Staff ───────────────────────────────────────────────────────

export interface Staff {
  key: string;
  name: string;
  role: 'admin' | 'sales_manager' | 'salesperson' | 'operations' | 'accountant';
  title: string;
  email: string;
  phone: string;
  department: string;
}
export const STAFF: Staff[] = [
  { key: 'ananya', name: 'Ananya Menon', role: 'admin', title: 'Founder & Director', email: DEMO_EMAIL, phone: '+919845011820', department: 'Management' },
  { key: 'rahul', name: 'Rahul Nair', role: 'sales_manager', title: 'Sales Manager', email: 'rahul.nair@example.com', phone: '+919845022931', department: 'Sales' },
  { key: 'sneha', name: 'Sneha Iyer', role: 'salesperson', title: 'Senior Travel Consultant (Domestic)', email: 'sneha.iyer@example.com', phone: '+919845033042', department: 'Sales' },
  { key: 'farhan', name: 'Farhan Qureshi', role: 'salesperson', title: 'Travel Consultant (International)', email: 'farhan.qureshi@example.com', phone: '+919845044153', department: 'Sales' },
  { key: 'deepa', name: 'Deepa Thomas', role: 'operations', title: 'Operations Lead, Kochi desk', email: 'deepa.thomas@example.com', phone: '+919447055264', department: 'Operations' },
  { key: 'vikram', name: 'Vikram Rao', role: 'accountant', title: 'Accounts', email: 'vikram.rao@example.com', phone: '+919845066375', department: 'Accounts' },
];

// ─── Contacts ────────────────────────────────────────────────────

export interface ContactSeed {
  key: string;
  name: string;
  city: string;
  state?: string;
  country: string;
  phone: string;
  email: string;
  source: 'manual' | 'website' | 'referral' | 'ad' | 'facebook' | 'google' | 'walkin';
  tags: string[];
  company?: string;
  type?: 'customer' | 'agent';
  /** days ago the contact was created (SQL backdating) */
  age: number;
  extra?: Record<string, unknown>;
}

const IN = 'India';
export const CONTACTS: ContactSeed[] = [
  { key: 'C01', name: 'Priya Nair', city: 'Bengaluru', state: 'Karnataka', country: IN, phone: '+919845023117', email: 'priya.nair@example.com', source: 'website', tags: ['family', 'kerala', 'whatsapp-enquiry'], age: 2,
    extra: { address: 'Prestige Shantiniketan, Whitefield', notes: 'Travels with husband Vivek and children Aditi (11) and Kabir (8). Vegetarian.' } },
  { key: 'C02', name: 'Arjun Mehta', city: 'Mumbai', state: 'Maharashtra', country: IN, phone: '+919820144562', email: 'arjun.mehta@example.com', source: 'referral', tags: ['honeymoon'], age: 40, extra: { address: 'Bandra West' } },
  { key: 'C03', name: 'Kavya Mehta', city: 'Mumbai', state: 'Maharashtra', country: IN, phone: '+919820377815', email: 'kavya.mehta@example.com', source: 'referral', tags: ['honeymoon'], age: 40 },
  { key: 'C04', name: 'Rohan Desai', city: 'Pune', state: 'Maharashtra', country: IN, phone: '+919822051934', email: 'rohan.desai@example.com', source: 'referral', tags: ['repeat', 'family'], age: 150 },
  { key: 'C05', name: 'Neha Kapoor', city: 'New Delhi', state: 'Delhi', country: IN, phone: '+919811064270', email: 'neha.kapoor@example.com', source: 'google', tags: ['honeymoon', 'maldives'], age: 14 },
  { key: 'C06', name: 'Vikram Singh Rathore', city: 'Jaipur', state: 'Rajasthan', country: IN, phone: '+919414028816', email: 'vikram.rathore@example.com', source: 'referral', tags: ['heritage'], age: 95 },
  { key: 'C07', name: 'Ananya Krishnan', city: 'Chennai', state: 'Tamil Nadu', country: IN, phone: '+919840017325', email: 'ananya.krishnan@example.com', source: 'google', tags: ['japan'], age: 3 },
  { key: 'C08', name: 'Siddharth Rao', city: 'Hyderabad', state: 'Telangana', country: IN, phone: '+919849033618', email: 'siddharth.rao@example.com', source: 'referral', tags: ['corporate'], company: 'Northstar Analytics Pvt Ltd', age: 30 },
  { key: 'C09', name: 'Meenakshi Sundaram', city: 'Coimbatore', state: 'Tamil Nadu', country: IN, phone: '+919443056271', email: 'meenakshi.s@example.com', source: 'walkin', tags: ['pilgrimage', 'senior-citizens'], age: 55 },
  { key: 'C10', name: 'Aditya Joshi', city: 'Ahmedabad', state: 'Gujarat', country: IN, phone: '+919825041896', email: 'aditya.joshi@example.com', source: 'website', tags: ['family'], age: 21 },
  { key: 'C11', name: 'Fatima Sheikh', city: 'Lucknow', state: 'Uttar Pradesh', country: IN, phone: '+919415072638', email: 'fatima.sheikh@example.com', source: 'website', tags: ['family', 'kashmir'], age: 5 },
  { key: 'C12', name: 'Harpreet Kaur', city: 'Chandigarh', state: 'Chandigarh', country: IN, phone: '+919814029573', email: 'harpreet.kaur@example.com', source: 'facebook', tags: ['adventure', 'ladakh'], age: 19 },
  { key: 'C13', name: 'Karan Malhotra', city: 'Gurugram', state: 'Haryana', country: IN, phone: '+919810085412', email: 'karan.malhotra@example.com', source: 'google', tags: ['family', 'dubai'], age: 36 },
  { key: 'C14', name: 'Divya Menon', city: 'Kochi', state: 'Kerala', country: IN, phone: '+919447061825', email: 'divya.menon@example.com', source: 'walkin', tags: ['weekend'], age: 28 },
  { key: 'C15', name: 'Suresh Pillai', city: 'Thiruvananthapuram', state: 'Kerala', country: IN, phone: '+919446038214', email: 'suresh.pillai@example.com', source: 'referral', tags: ['repeat'], age: 210 },
  { key: 'C16', name: 'Ishaan Chatterjee', city: 'Kolkata', state: 'West Bengal', country: IN, phone: '+919830047192', email: 'ishaan.c@example.com', source: 'google', tags: ['europe'], age: 17 },
  { key: 'C17', name: 'Pooja Agarwal', city: 'Indore', state: 'Madhya Pradesh', country: IN, phone: '+919826053017', email: 'pooja.agarwal@example.com', source: 'facebook', tags: ['family'], age: 60 },
  { key: 'C18', name: 'Manish Tiwari', city: 'Bhopal', state: 'Madhya Pradesh', country: IN, phone: '+919425061740', email: 'manish.tiwari@example.com', source: 'referral', tags: ['pilgrimage'], age: 45 },
  { key: 'C19', name: 'Dr. Lakshmi Raghavan', city: 'Kochi', state: 'Kerala', country: IN, phone: '+919447122958', email: 'lakshmi.raghavan@example.com', source: 'referral', tags: ['repeat'], age: 240 },
  { key: 'C20', name: 'Sanjay Kulkarni', city: 'Nashik', state: 'Maharashtra', country: IN, phone: '+919823014675', email: 'sanjay.kulkarni@example.com', source: 'website', tags: [], age: 120 },
  { key: 'C21', name: 'Ritu Sharma', city: 'Noida', state: 'Uttar Pradesh', country: IN, phone: '+919811830264', email: 'ritu.sharma@example.com', source: 'facebook', tags: ['adventure', 'andaman'], age: 2 },
  { key: 'C22', name: 'Nikhil Bansal', city: 'Bengaluru', state: 'Karnataka', country: IN, phone: '+919845177230', email: 'nikhil.bansal@example.com', source: 'facebook', tags: ['corporate'], company: 'Brightpath Software', age: 4 },
  { key: 'C23', name: 'Tanvi Deshpande', city: 'Mumbai', state: 'Maharashtra', country: IN, phone: '+919819260417', email: 'tanvi.deshpande@example.com', source: 'facebook', tags: ['anniversary', 'bali'], age: 22 },
  { key: 'C24', name: 'Arvind Iyer', city: 'Bengaluru', state: 'Karnataka', country: IN, phone: '+919845290136', email: 'arvind.iyer@example.com', source: 'referral', tags: ['family'], age: 180 },
  { key: 'C25', name: 'Shalini Verma', city: 'Jaipur', state: 'Rajasthan', country: IN, phone: '+919414155790', email: 'shalini.verma@example.com', source: 'website', tags: ['anniversary'], age: 1 },
  { key: 'C26', name: 'Gaurav Saxena', city: 'Gurugram', state: 'Haryana', country: IN, phone: '+919810147783', email: 'gaurav.saxena@example.com', source: 'google', tags: [], age: 70 },
  { key: 'C27', name: 'Zoya Khan', city: 'Hyderabad', state: 'Telangana', country: IN, phone: '+919849126354', email: 'zoya.khan@example.com', source: 'website', tags: [], age: 9 },
  { key: 'C28', name: 'Anil Hegde', city: 'Mangaluru', state: 'Karnataka', country: IN, phone: '+919448031672', email: 'anil.hegde@example.com', source: 'referral', tags: ['repeat'], age: 260 },
  { key: 'C29', name: 'Kavitha Reddy', city: 'Bengaluru', state: 'Karnataka', country: IN, phone: '+919845563021', email: 'kavitha.reddy@example.com', source: 'referral', tags: ['corporate'], company: 'Meridian Pharma Ltd', age: 33 },
  { key: 'C30', name: 'James Carter', city: 'London', country: 'United Kingdom', phone: '+447700900412', email: 'james.carter@example.co.uk', source: 'website', tags: ['international'], age: 62 },
  { key: 'C31', name: 'Emily Carter', city: 'London', country: 'United Kingdom', phone: '+447700900518', email: 'emily.carter@example.co.uk', source: 'website', tags: ['international'], age: 62 },
  { key: 'C32', name: 'Ahmed Al Mansoori', city: 'Dubai', country: 'United Arab Emirates', phone: '+971501234567', email: 'ahmed.almansoori@example.com', source: 'referral', tags: ['international'], age: 100 },
  { key: 'C33', name: 'Sophie Martin', city: 'Paris', country: 'France', phone: '+33612345678', email: 'sophie.martin@example.com', source: 'website', tags: ['international'], age: 26 },
  { key: 'C34', name: 'Kenji Watanabe', city: 'Osaka', country: 'Japan', phone: '+819012345678', email: 'kenji.watanabe@example.com', source: 'google', tags: ['international'], age: 90 },
  { key: 'C35', name: 'Daniel Fernandes', city: 'Toronto', country: 'Canada', phone: '+14165550143', email: 'daniel.fernandes@example.com', source: 'referral', tags: ['nri', 'goa'], age: 85 },
  { key: 'C36', name: 'Olivia Brown', city: 'Sydney', country: 'Australia', phone: '+61491570156', email: 'olivia.brown@example.com', source: 'website', tags: ['international'], age: 7 },
  { key: 'C37', name: 'Hannah Müller', city: 'Munich', country: 'Germany', phone: '+4915123456789', email: 'hannah.mueller@example.com', source: 'website', tags: ['ayurveda'], age: 48 },
  { key: 'C38', name: 'Rajesh Nair', city: 'Singapore', country: 'Singapore', phone: '+6591234567', email: 'rajesh.nair@example.com', source: 'referral', tags: ['nri'], age: 130 },
  { key: 'C39', name: "Joseph D'Souza", city: 'Mangaluru', state: 'Karnataka', country: IN, phone: '+919448170356', email: 'joseph.dsouza@example.com', source: 'referral', tags: [], company: 'Coastal Trails Travels', type: 'agent', age: 200, extra: { notes: 'B2B sub-agent' } },
];

// ─── Leads ───────────────────────────────────────────────────────

export type LeadStatus =
  | 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiation' | 'won' | 'lost' | 'on_hold';

export interface LeadSeed {
  key: string;
  title: string;
  contact: string;
  destinations: string[];
  tripType: 'domestic' | 'international' | 'honeymoon' | 'family' | 'group' | 'corporate' | 'adventure' | 'pilgrimage';
  travel: number; // D0 + n
  ret?: number;
  adults: number;
  children: number;
  budget: number;
  status: LeadStatus;
  priority: 'hot' | 'warm' | 'cold';
  source: 'manual' | 'website' | 'facebook' | 'google' | 'referral' | 'walkin';
  assignee?: string; // staff key
  lostReason?: string;
  /** days ago the lead was created (SQL backdating) */
  age: number;
}
export const LEADS: LeadSeed[] = [
  { key: 'L01', title: 'Kerala Honeymoon — Kochi & Kumarakom', contact: 'C02', destinations: ['Kochi', 'Kumarakom'], tripType: 'honeymoon', travel: 0, ret: 4, adults: 2, children: 0, budget: 95000, status: 'won', priority: 'hot', source: 'referral', assignee: 'sneha', age: 45 },
  { key: 'L02', title: 'Maldives Overwater Villa Honeymoon', contact: 'C05', destinations: ['Maldives'], tripType: 'honeymoon', travel: 45, adults: 2, children: 0, budget: 320000, status: 'proposal_sent', priority: 'hot', source: 'google', assignee: 'farhan', age: 13 },
  { key: 'L03', title: 'Rajasthan Royal Heritage — 8 days', contact: 'C30', destinations: ['Jaipur', 'Jodhpur', 'Udaipur'], tripType: 'international', travel: 62, adults: 2, children: 0, budget: 280000, status: 'negotiation', priority: 'hot', source: 'website', assignee: 'farhan', age: 30 },
  { key: 'L04', title: 'Goa Beach Escape — Desai family', contact: 'C04', destinations: ['Goa'], tripType: 'family', travel: 34, adults: 2, children: 2, budget: 85000, status: 'qualified', priority: 'warm', source: 'referral', assignee: 'sneha', age: 9 },
  { key: 'L05', title: 'Ladakh Bike Expedition', contact: 'C12', destinations: ['Leh', 'Nubra Valley', 'Pangong'], tripType: 'adventure', travel: 250, adults: 4, children: 0, budget: 240000, status: 'contacted', priority: 'warm', source: 'facebook', assignee: 'rahul', age: 12 },
  { key: 'L06', title: 'Dubai Shopping Festival Break', contact: 'C13', destinations: ['Dubai'], tripType: 'international', travel: 95, adults: 2, children: 1, budget: 160000, status: 'proposal_sent', priority: 'warm', source: 'google', assignee: 'farhan', age: 24 },
  { key: 'L07', title: 'Bali Island Bliss — Anniversary', contact: 'C23', destinations: ['Bali'], tripType: 'international', travel: 70, adults: 2, children: 0, budget: 190000, status: 'qualified', priority: 'hot', source: 'facebook', assignee: 'farhan', age: 15 },
  { key: 'L08', title: 'Singapore Family Fun — Universal & Sentosa', contact: 'C10', destinations: ['Singapore'], tripType: 'family', travel: 58, adults: 2, children: 2, budget: 260000, status: 'negotiation', priority: 'warm', source: 'website', assignee: 'farhan', age: 19 },
  { key: 'L09', title: 'Europe Highlights — Paris, Swiss Alps, Rome', contact: 'C16', destinations: ['Paris', 'Interlaken', 'Rome'], tripType: 'international', travel: 200, adults: 2, children: 0, budget: 650000, status: 'contacted', priority: 'warm', source: 'google', assignee: 'farhan', age: 11 },
  { key: 'L10', title: 'Kashmir Paradise — Gulmarg & Pahalgam', contact: 'C11', destinations: ['Srinagar', 'Gulmarg', 'Pahalgam'], tripType: 'family', travel: 150, adults: 3, children: 1, budget: 140000, status: 'new', priority: 'warm', source: 'website', age: 4 },
  { key: 'L11', title: 'Madurai & Rameswaram Temple Trail', contact: 'C09', destinations: ['Madurai', 'Rameswaram', 'Kanyakumari'], tripType: 'pilgrimage', travel: 40, adults: 4, children: 0, budget: 75000, status: 'qualified', priority: 'warm', source: 'walkin', assignee: 'sneha', age: 10 },
  { key: 'L12', title: 'Northstar Analytics Offsite — Coorg', contact: 'C08', destinations: ['Coorg'], tripType: 'corporate', travel: 28, adults: 24, children: 0, budget: 720000, status: 'proposal_sent', priority: 'hot', source: 'referral', assignee: 'rahul', age: 18 },
  { key: 'L13', title: 'Meridian Pharma Sales Meet — Goa', contact: 'C29', destinations: ['Goa'], tripType: 'corporate', travel: 55, adults: 60, children: 0, budget: 1800000, status: 'negotiation', priority: 'hot', source: 'referral', assignee: 'rahul', age: 27 },
  { key: 'L14', title: 'Andaman Scuba & Beaches', contact: 'C21', destinations: ['Port Blair', 'Havelock'], tripType: 'adventure', travel: 80, adults: 2, children: 0, budget: 130000, status: 'new', priority: 'hot', source: 'facebook', age: 1 },
  { key: 'L15', title: 'Munnar Tea Trails Weekend', contact: 'C14', destinations: ['Munnar'], tripType: 'domestic', travel: 12, adults: 2, children: 0, budget: 32000, status: 'won', priority: 'warm', source: 'walkin', assignee: 'sneha', age: 24 },
  { key: 'L16', title: 'Golden Triangle — Delhi, Agra, Jaipur', contact: 'C33', destinations: ['Delhi', 'Agra', 'Jaipur'], tripType: 'international', travel: 110, adults: 2, children: 0, budget: 220000, status: 'contacted', priority: 'warm', source: 'website', assignee: 'farhan', age: 8 },
  { key: 'L17', title: 'Japan Cherry Blossom — Tokyo & Kyoto', contact: 'C07', destinations: ['Tokyo', 'Kyoto', 'Osaka'], tripType: 'international', travel: 180, adults: 2, children: 0, budget: 480000, status: 'new', priority: 'warm', source: 'google', age: 2 },
  { key: 'L18', title: 'Hampi & Badami Heritage Drive', contact: 'C24', destinations: ['Hampi', 'Badami'], tripType: 'domestic', travel: 20, adults: 2, children: 1, budget: 45000, status: 'won', priority: 'warm', source: 'referral', assignee: 'sneha', age: 21 },
  { key: 'L19', title: 'Kerala Ayurveda Retreat — Kovalam', contact: 'C37', destinations: ['Kovalam'], tripType: 'international', travel: 65, adults: 1, children: 0, budget: 110000, status: 'qualified', priority: 'warm', source: 'website', assignee: 'sneha', age: 16 },
  { key: 'L20', title: 'Thailand — Phuket & Krabi', contact: 'C26', destinations: ['Phuket', 'Krabi'], tripType: 'international', travel: 48, adults: 2, children: 0, budget: 145000, status: 'lost', priority: 'cold', source: 'google', assignee: 'farhan', lostReason: 'Chose a cheaper online package', age: 40 },
  { key: 'L21', title: 'Darjeeling & Gangtok Family Holiday', contact: 'C17', destinations: ['Darjeeling', 'Gangtok'], tripType: 'family', travel: 90, adults: 2, children: 2, budget: 120000, status: 'on_hold', priority: 'cold', source: 'facebook', assignee: 'sneha', age: 35 },
  { key: 'L22', title: 'Char Dham Yatra by Helicopter', contact: 'C18', destinations: ['Kedarnath', 'Badrinath'], tripType: 'pilgrimage', travel: 210, adults: 2, children: 0, budget: 350000, status: 'contacted', priority: 'warm', source: 'referral', assignee: 'rahul', age: 7 },
  { key: 'L23', title: 'Goa Christmas Homecoming', contact: 'C35', destinations: ['Goa'], tripType: 'international', travel: 83, adults: 4, children: 0, budget: 180000, status: 'won', priority: 'warm', source: 'referral', assignee: 'sneha', age: 28 },
  { key: 'L24', title: 'Udaipur Lake Palace Anniversary', contact: 'C25', destinations: ['Udaipur'], tripType: 'domestic', travel: 38, adults: 2, children: 0, budget: 125000, status: 'new', priority: 'hot', source: 'website', age: 1 },
  { key: 'L25', title: 'Spiti Valley Road Trip', contact: 'C22', destinations: ['Spiti', 'Manali'], tripType: 'adventure', travel: 240, adults: 4, children: 0, budget: 160000, status: 'new', priority: 'cold', source: 'facebook', age: 3 },
];

/** The backend refuses proposal_sent without an itinerary, so every lead that passes through it gets one (from a template). */
export const LEAD_ITINERARIES: Record<string, { template: string; title: string }> = {
  L01: { template: 'T-KER', title: 'Mehta Honeymoon — Kochi & Kumarakom' },
  L02: { template: 'T-MLD', title: 'Kapoor — Maldives Overwater Honeymoon' },
  L03: { template: 'T-RAJ', title: 'Carter — Rajasthan Royal Heritage' },
  L06: { template: 'T-DXB', title: 'Malhotra — Dubai Shopping Festival' },
  L08: { template: 'T-SIN', title: 'Joshi — Singapore Family Fun' },
  L12: { template: 'T-GOA', title: 'Northstar Analytics — Coorg Offsite' },
  L13: { template: 'T-GOA', title: 'Meridian Pharma — Goa Sales Meet' },
  L15: { template: 'T-KER', title: 'Menon — Munnar Tea Trails Weekend' },
  L18: { template: 'T-RAJ', title: 'Iyer — Hampi & Badami Heritage Drive' },
  L23: { template: 'T-GOA', title: 'Fernandes — Goa Christmas Homecoming' },
};

export const LEAD_NOTES: Record<string, string> = {
  L02: 'Neha opened the quote 3 times — prefers a sunset water villa.',
  L03: 'Carters want a heritage-hotel night in Jodhpur; asked for a 5% discount.',
  L12: 'PO expected after the leadership review on Friday.',
  L13: 'Need 30 rooms at one property; shortlisting Candolim.',
};
export const LEAD_ACTIVITIES: { lead: string; type: 'call' | 'email'; content: string }[] = [
  { lead: 'L08', type: 'call', content: 'Call — discussed Universal Studios add-on' },
  { lead: 'L06', type: 'email', content: 'Email — sent Dubai options' },
];

/** Priya's lead is created live in Scene 2; kept here so story specs share the exact values. */
export const PRIYA = {
  contactKey: 'C01',
  title: 'Kerala Backwaters Family Holiday',
  destinations: ['Munnar', 'Thekkady', 'Alleppey', 'Kumarakom'],
  travelOffset: TRAVEL_START_OFFSET,
  returnOffset: TRAVEL_START_OFFSET + 5,
  adults: 2,
  children: 2,
  budget: 125000,
  specialRequirements: 'Kids aged 8 and 11. One houseboat night, a tea-estate stay in Munnar, vegetarian meals.',
  whatsapp: (startLabel: string) =>
    `Hi! We're a family of four from Bengaluru (kids aged 8 and 11) planning a 5-night Kerala trip from ${startLabel}. We'd love Munnar, one houseboat night and some backwater time. Budget around ₹1.25 lakh. Could you share a plan?`,
};

// ─── Suppliers ───────────────────────────────────────────────────

export interface SupplierSeed {
  key: string; companyName: string; category: 'hotel' | 'transport' | 'airline' | 'activity_provider' | 'visa_agent';
  contactPerson: string; phone: string; email: string; city: string; state: string; country?: string; gst?: string; preferred: boolean;
}
export const SUPPLIERS: SupplierSeed[] = [
  { key: 'S01', companyName: 'Misty Hills Tea Resort', category: 'hotel', contactPerson: 'Joseph Mathew', phone: '+914865230118', email: 'reservations@mistyhills.example.com', city: 'Munnar', state: 'Kerala', gst: '32AAKFM4821K1Z5', preferred: true },
  { key: 'S02', companyName: 'Cardamom County Retreat', category: 'hotel', contactPerson: 'Reshma Varghese', phone: '+914869224410', email: 'stay@cardamomcounty.example.com', city: 'Kumily', state: 'Kerala', gst: '32AACFC5530L1Z2', preferred: true },
  { key: 'S03', companyName: 'Lakes & Lagoons Houseboats', category: 'hotel', contactPerson: 'Biju Antony', phone: '+919447301122', email: 'bookings@lakeslagoons.example.com', city: 'Alappuzha', state: 'Kerala', gst: '32AAEFL6612M1Z9', preferred: true },
  { key: 'S04', companyName: 'Vembanad Lake Resort', category: 'hotel', contactPerson: 'Anitha George', phone: '+914812524400', email: 'frontdesk@vembanadresort.example.com', city: 'Kumarakom', state: 'Kerala', gst: '32AABCV7721N1Z3', preferred: true },
  { key: 'S05', companyName: 'Fort Kochi Heritage Inn', category: 'hotel', contactPerson: 'Thomas Kurian', phone: '+914842215870', email: 'hello@fortkochiinn.example.com', city: 'Kochi', state: 'Kerala', gst: '32AADFF8812P1Z6', preferred: false },
  { key: 'S06', companyName: 'Aravalli Palace Hotels', category: 'hotel', contactPerson: 'Mahendra Singh', phone: '+912942430011', email: 'sales@aravallipalace.example.com', city: 'Udaipur', state: 'Rajasthan', gst: '08AAGCA1123Q1Z4', preferred: true },
  { key: 'S07', companyName: 'Candolim Sands Resort', category: 'hotel', contactPerson: 'Lorraine Pereira', phone: '+918322489900', email: 'groups@candolimsands.example.com', city: 'Candolim', state: 'Goa', gst: '30AAHCC2234R1Z7', preferred: true },
  { key: 'S08', companyName: 'IndiGo', category: 'airline', contactPerson: 'Corporate Desk', phone: '+911246173838', email: 'corporate@indigo.example.com', city: 'Gurugram', state: 'Haryana', preferred: true },
  { key: 'S09', companyName: 'Emirates', category: 'airline', contactPerson: 'Trade Desk', phone: '+912266318888', email: 'trade.india@emirates.example.com', city: 'Mumbai', state: 'Maharashtra', preferred: false },
  { key: 'S10', companyName: 'Malabar Cabs & Coaches', category: 'transport', contactPerson: 'Shibu Paul', phone: '+919446620031', email: 'ops@malabarcabs.example.com', city: 'Kochi', state: 'Kerala', gst: '32AAIFM3345S1Z1', preferred: true },
  { key: 'S11', companyName: 'Rajputana Travels Coaches', category: 'transport', contactPerson: 'Dinesh Choudhary', phone: '+919414433210', email: 'fleet@rajputanacoaches.example.com', city: 'Jaipur', state: 'Rajasthan', gst: '08AAJFR4456T1Z8', preferred: false },
  { key: 'S12', companyName: 'Kerala Kathakali Centre', category: 'activity_provider', contactPerson: 'Unni Krishnan', phone: '+914842217552', email: 'shows@kathakalicentre.example.com', city: 'Kochi', state: 'Kerala', preferred: false },
  { key: 'S13', companyName: 'Arabian Dunes Safaris', category: 'activity_provider', contactPerson: 'Imran Patel', phone: '+971502233445', email: 'b2b@arabiandunes.example.com', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', preferred: true },
  { key: 'S14', companyName: 'VisaEase Services', category: 'visa_agent', contactPerson: 'Neeta Shah', phone: '+912240040400', email: 'desk@visaease.example.com', city: 'Mumbai', state: 'Maharashtra', gst: '27AAKCV5567U1Z2', preferred: false },
];

// ─── Rate cards ──────────────────────────────────────────────────

export interface RateCardSeed {
  key: string; name: string; serviceType: 'hotel' | 'transport' | 'activity' | 'flight' | 'meal'; destination: string;
  season: 'peak' | 'off_peak' | 'shoulder'; cost: number; selling: number; unit: 'per_room' | 'per_day' | 'per_vehicle' | 'per_person'; supplier?: string;
}
export const RATE_CARDS: RateCardSeed[] = [
  { key: 'R01', name: 'Misty Hills Tea Resort — Family Suite (CP)', serviceType: 'hotel', destination: 'Munnar, Kerala', season: 'peak', cost: 9500, selling: 12000, unit: 'per_room', supplier: 'S01' },
  { key: 'R02', name: 'Cardamom County Retreat — Plantation Villa (MAP)', serviceType: 'hotel', destination: 'Thekkady, Kerala', season: 'peak', cost: 12500, selling: 15500, unit: 'per_room', supplier: 'S02' },
  { key: 'R03', name: 'Lakes & Lagoons — Premium 2-Bedroom Houseboat, all meals', serviceType: 'hotel', destination: 'Alleppey, Kerala', season: 'peak', cost: 24000, selling: 29000, unit: 'per_day', supplier: 'S03' },
  { key: 'R04', name: 'Vembanad Lake Resort — Lake View Villa (MAP)', serviceType: 'hotel', destination: 'Kumarakom, Kerala', season: 'peak', cost: 14000, selling: 17500, unit: 'per_room', supplier: 'S04' },
  { key: 'R05', name: 'Innova Crysta with chauffeur — Kerala circuit', serviceType: 'transport', destination: 'Kerala', season: 'peak', cost: 3200, selling: 3800, unit: 'per_day', supplier: 'S10' },
  { key: 'R06', name: 'Eravikulam National Park + Tea Museum (family of 4)', serviceType: 'activity', destination: 'Munnar, Kerala', season: 'peak', cost: 2400, selling: 3200, unit: 'per_vehicle' },
  { key: 'R07', name: 'Periyar boat cruise + spice plantation walk', serviceType: 'activity', destination: 'Thekkady, Kerala', season: 'peak', cost: 2800, selling: 3600, unit: 'per_vehicle' },
  { key: 'R08', name: 'Kumarakom bird sanctuary sunrise walk', serviceType: 'activity', destination: 'Kumarakom, Kerala', season: 'peak', cost: 1200, selling: 1800, unit: 'per_vehicle' },
  { key: 'R09', name: 'Kathakali performance — Fort Kochi', serviceType: 'activity', destination: 'Kochi, Kerala', season: 'peak', cost: 450, selling: 650, unit: 'per_person', supplier: 'S12' },
  { key: 'R10', name: 'Vembanad Lake Resort — Lake View Villa (MAP)', serviceType: 'hotel', destination: 'Kumarakom, Kerala', season: 'off_peak', cost: 10500, selling: 13500, unit: 'per_room', supplier: 'S04' },
  { key: 'R11', name: 'Candolim Sands Resort — Deluxe Sea View (CP)', serviceType: 'hotel', destination: 'Goa', season: 'peak', cost: 6500, selling: 8200, unit: 'per_room', supplier: 'S07' },
  { key: 'R12', name: 'Aravalli Palace — Heritage Room (MAP)', serviceType: 'hotel', destination: 'Udaipur, Rajasthan', season: 'peak', cost: 9000, selling: 11500, unit: 'per_room', supplier: 'S06' },
  { key: 'R13', name: 'Tempo Traveller 12-seater — Rajasthan circuit', serviceType: 'transport', destination: 'Rajasthan', season: 'peak', cost: 4200, selling: 5000, unit: 'per_day', supplier: 'S11' },
  { key: 'R14', name: 'Desert safari with BBQ dinner', serviceType: 'activity', destination: 'Dubai', season: 'peak', cost: 2600, selling: 3400, unit: 'per_person', supplier: 'S13' },
  { key: 'R15', name: 'Ubud pool villa (breakfast)', serviceType: 'hotel', destination: 'Bali', season: 'shoulder', cost: 7800, selling: 9600, unit: 'per_room' },
  { key: 'R16', name: 'Universal Studios Singapore ticket', serviceType: 'activity', destination: 'Singapore', season: 'peak', cost: 5600, selling: 6400, unit: 'per_person' },
  { key: 'R17', name: 'Sunset Water Villa (half board)', serviceType: 'hotel', destination: 'Maldives', season: 'peak', cost: 38000, selling: 46000, unit: 'per_room' },
  { key: 'R18', name: 'IndiGo BLR–COK return (economy)', serviceType: 'flight', destination: 'Kochi', season: 'peak', cost: 6800, selling: 7600, unit: 'per_person', supplier: 'S08' },
  { key: 'R19', name: 'Emirates BOM–DXB return (economy)', serviceType: 'flight', destination: 'Dubai', season: 'peak', cost: 28000, selling: 31500, unit: 'per_person', supplier: 'S09' },
  { key: 'R20', name: 'Mandovi sunset cruise', serviceType: 'activity', destination: 'Goa', season: 'off_peak', cost: 1600, selling: 2200, unit: 'per_person' },
];

// ─── Itinerary templates ─────────────────────────────────────────

export interface TplItem { type: 'hotel' | 'transport' | 'activity' | 'flight' | 'meal' | 'other'; title: string; cost: number; sell: number; qty: number }
export interface TplDay { title: string; city: string; description?: string; items: TplItem[] }
export interface TemplateSeed {
  key: string; title: string; destination: string; durationDays: number;
  category: 'beach' | 'mountain' | 'heritage' | 'adventure' | 'honeymoon' | 'family' | 'corporate' | 'pilgrimage' | 'custom';
  description?: string; days: TplDay[];
}

export const T_KER: TemplateSeed = {
  key: 'T-KER', title: 'Kerala Backwaters & Hills — 5N/6D', destination: 'Kerala', durationDays: 6, category: 'family',
  description: 'Tea hills of Munnar, spice country in Thekkady, a private houseboat night and a lake-view finale in Kumarakom.',
  days: [
    { title: 'Arrive Kochi — drive to Munnar', city: 'Munnar', items: [
      { type: 'transport', title: 'Innova Crysta with chauffeur — 6 days (Kochi–Munnar–Thekkady–Alleppey–Kumarakom–Kochi)', cost: 3200, sell: 3800, qty: 6 },
      { type: 'hotel', title: 'Misty Hills Tea Resort — Family Suite (CP), 2 nights', cost: 9500, sell: 12000, qty: 2 } ] },
    { title: 'Munnar tea country', city: 'Munnar', items: [
      { type: 'activity', title: 'Eravikulam National Park + Tea Museum (family of 4)', cost: 2400, sell: 3200, qty: 1 } ] },
    { title: 'Thekkady spice trails', city: 'Thekkady', items: [
      { type: 'hotel', title: 'Cardamom County Retreat — Plantation Villa (MAP)', cost: 12500, sell: 15500, qty: 1 },
      { type: 'activity', title: 'Periyar boat cruise + spice plantation walk', cost: 2800, sell: 3600, qty: 1 } ] },
    { title: 'Alleppey houseboat', city: 'Alleppey', items: [
      { type: 'hotel', title: 'Lakes & Lagoons — Premium 2-Bedroom Houseboat, all meals', cost: 24000, sell: 29000, qty: 1 } ] },
    { title: 'Kumarakom backwaters', city: 'Kumarakom', items: [
      { type: 'hotel', title: 'Vembanad Lake Resort — Lake View Villa (MAP)', cost: 14000, sell: 17500, qty: 1 },
      { type: 'activity', title: 'Kumarakom bird sanctuary sunrise walk', cost: 1200, sell: 1800, qty: 1 } ] },
    { title: 'Depart Kochi', city: 'Kochi', description: 'Drop at Cochin International Airport.', items: [] },
  ],
};

function lite(dest: string, titles: string[], priced: [number, number][]): TplDay[] {
  return titles.map((t, i) => ({
    title: t, city: dest,
    items: (priced[i]?.[1] ?? 0) > 0
      ? [{ type: (i % 2 === 0 ? 'hotel' : 'activity') as 'hotel' | 'activity', title: t, cost: priced[i]?.[0] ?? 0, sell: priced[i]?.[1] ?? 0, qty: 1 }]
      : [],
  }));
}
export const OTHER_TEMPLATES: TemplateSeed[] = [
  { key: 'T-RAJ', title: 'Rajasthan Royal Heritage — 7N/8D', destination: 'Rajasthan', durationDays: 8, category: 'heritage',
    days: lite('Rajasthan', ['Jaipur arrival', 'Amber Fort & City Palace', 'Drive to Jodhpur', 'Mehrangarh', 'Ranakpur to Udaipur', 'Lake Pichola', 'Udaipur leisure', 'Depart'], [[9000, 11500], [1800, 2400], [4200, 5000], [1500, 2100]]) },
  { key: 'T-GOA', title: 'Goa Beach Escape — 4N/5D', destination: 'Goa', durationDays: 5, category: 'beach',
    days: lite('Goa', ['Arrive North Goa', 'Old Goa & Panjim', 'South Goa beaches', 'Spice farm & cruise', 'Depart'], [[6500, 8200], [1400, 1900], [0, 0], [1600, 2200]]) },
  { key: 'T-LAD', title: 'Ladakh High Passes — 6N/7D', destination: 'Ladakh', durationDays: 7, category: 'adventure',
    days: lite('Ladakh', ['Leh acclimatisation', 'Monasteries', 'Khardung La to Nubra', 'Nubra to Pangong', 'Pangong to Leh', 'Leh leisure', 'Depart'], [[7200, 9000], [1200, 1800], [8500, 10500], [8800, 11000]]) },
  { key: 'T-DXB', title: 'Dubai City & Desert — 4N/5D', destination: 'Dubai', durationDays: 5, category: 'family',
    days: lite('Dubai', ['Arrival & Marina cruise', 'Burj Khalifa & Dubai Mall', 'Desert safari', 'Abu Dhabi day trip', 'Depart'], [[16000, 19500], [4200, 5200], [2600, 3400], [3800, 4800]]) },
  { key: 'T-BAL', title: 'Bali Island Bliss — 6N/7D', destination: 'Bali', durationDays: 7, category: 'honeymoon',
    days: lite('Bali', ['Arrive Seminyak', 'Ubud rice terraces', 'Kintamani', 'Nusa Penida', 'Spa day', 'Uluwatu sunset', 'Depart'], [[7800, 9600], [1500, 2200], [2200, 3000], [3400, 4200]]) },
  { key: 'T-SIN', title: 'Singapore Family Fun — 4N/5D', destination: 'Singapore', durationDays: 5, category: 'family',
    days: lite('Singapore', ['Arrival & Night Safari', 'Universal Studios', 'Sentosa', 'Gardens by the Bay', 'Depart'], [[11000, 13500], [5600, 6400], [3000, 3800], [2200, 2900]]) },
  { key: 'T-MLD', title: 'Maldives Overwater Honeymoon — 4N/5D', destination: 'Maldives', durationDays: 5, category: 'honeymoon',
    days: lite('Maldives', ['Seaplane arrival', 'Snorkel safari', 'Sandbank picnic', 'Spa & sunset cruise', 'Depart'], [[38000, 46000], [4500, 5800], [6000, 7500], [5200, 6600]]) },
  { key: 'T-EUR', title: 'Europe Highlights — Paris, Swiss Alps, Rome — 9N/10D', destination: 'Europe', durationDays: 10, category: 'custom',
    days: lite('Europe', ['Paris arrival', 'Paris — Louvre & Seine', 'Paris — Versailles', 'Train to Interlaken', 'Jungfraujoch', 'Lake Brienz', 'Fly to Rome', 'Colosseum & Vatican', 'Rome leisure', 'Depart'], [[14000, 17500], [3200, 4200], [2800, 3600], [9500, 11800]]) },
  { key: 'T-KAS', title: 'Kashmir Paradise — 5N/6D', destination: 'Kashmir', durationDays: 6, category: 'mountain',
    days: lite('Kashmir', ['Srinagar houseboat', 'Gulmarg gondola', 'Pahalgam', 'Betaab Valley', 'Shikara ride', 'Depart'], [[7500, 9500], [2400, 3200], [6200, 7800], [1800, 2400]]) },
];

export function templateData(t: TemplateSeed): string {
  return JSON.stringify({
    days: t.days.map((d, i) => ({
      dayNumber: i + 1, title: d.title, description: d.description ?? '', city: d.city,
      items: d.items.map((it, j) => ({
        type: it.type, title: it.title, description: '', costPrice: it.cost, sellingPrice: it.sell, quantity: it.qty, taxRate: 5, sortOrder: j,
      })),
    })),
    inclusions: ITINERARY_DEFAULTS.defaultInclusions,
    exclusions: ITINERARY_DEFAULTS.defaultExclusions,
    termsConditions: ITINERARY_DEFAULTS.defaultTerms,
  });
}
/** T-KER totals promised by the storyboard (asserted by the seeder). */
export const T_KER_TOTALS = { cost: 95100, selling: 117400, tax: 5870, grand: 123270 };

// ─── Invoices / payments / credit note / vouchers ────────────────

export interface InvoiceSeed {
  key: string; contact: string; lead?: string; type: 'tax_invoice' | 'proforma';
  lines: { description: string; rate: number; qty?: number }[];
  /** days ago created */ age: number; due?: number;
  target: 'paid' | 'partially_paid' | 'sent' | 'overdue' | 'draft' | 'void';
}
export const INVOICES: InvoiceSeed[] = [
  { key: 'I-01', contact: 'C02', lead: 'L01', type: 'tax_invoice', lines: [{ description: 'Kerala Honeymoon — 4N/5D, Kochi & Kumarakom', rate: 88000 }, { description: 'Airport transfers & sightseeing — Innova Crysta', rate: 7000 }], age: 32, due: -2, target: 'paid' },
  { key: 'I-02', contact: 'C14', lead: 'L15', type: 'tax_invoice', lines: [{ description: 'Munnar Tea Trails — 2N weekend package', rate: 32000 }], age: 9, due: 3, target: 'paid' },
  { key: 'I-03', contact: 'C24', lead: 'L18', type: 'tax_invoice', lines: [{ description: 'Hampi & Badami heritage drive — 3N', rate: 45000 }], age: 6, due: 5, target: 'paid' },
  { key: 'I-04', contact: 'C35', lead: 'L23', type: 'proforma', lines: [{ description: 'Goa Christmas Homecoming — villa 5N + transfers', rate: 171430 }], age: 21, due: 40, target: 'partially_paid' },
  { key: 'I-05', contact: 'C04', type: 'tax_invoice', lines: [{ description: 'Coorg coffee estate weekend — 2N (May)', rate: 38000 }], age: 140, due: -110, target: 'paid' },
  { key: 'I-06', contact: 'C08', lead: 'L12', type: 'proforma', lines: [{ description: 'Northstar Analytics offsite — 25% advance', rate: 190476 }], age: 4, due: 10, target: 'sent' },
  { key: 'I-07', contact: 'C13', lead: 'L06', type: 'proforma', lines: [{ description: 'Dubai Shopping Festival — 30% deposit', rate: 45714 }], age: 20, due: -6, target: 'overdue' },
  { key: 'I-08', contact: 'C05', lead: 'L02', type: 'proforma', lines: [{ description: 'Maldives water villa — booking deposit', rate: 47619 }], age: 12, due: 15, target: 'partially_paid' },
  { key: 'I-09', contact: 'C21', lead: 'L14', type: 'tax_invoice', lines: [{ description: 'Andaman scuba week — 5N', rate: 120000 }], age: 1, due: 30, target: 'draft' },
  { key: 'I-10', contact: 'C06', type: 'tax_invoice', lines: [{ description: 'Jaisalmer desert camp — 2N (July)', rate: 52000 }], age: 80, due: -55, target: 'paid' },
  { key: 'I-11', contact: 'C26', lead: 'L20', type: 'tax_invoice', lines: [{ description: 'Phuket & Krabi package — 5N', rate: 138095 }], age: 25, target: 'void' },
  { key: 'I-12', contact: 'C09', lead: 'L11', type: 'proforma', lines: [{ description: 'Temple trail — advance', rate: 30000 }], age: 10, due: 20, target: 'partially_paid' },
];
export const PAYMENTS: { invoice: string; amount: number; daysAgo: number; method: string; reference: string }[] = [
  { invoice: 'I-01', amount: 50000, daysAgo: 30, method: 'transfer', reference: 'UTR 361800211547' },
  { invoice: 'I-01', amount: 49750, daysAgo: 7, method: 'transfer', reference: 'UTR 362000874412' },
  { invoice: 'I-02', amount: 33600, daysAgo: 1, method: 'other', reference: 'UPI 6291 4408 1732' },
  { invoice: 'I-03', amount: 47250, daysAgo: 0, method: 'card', reference: 'POS 448812' },
  { invoice: 'I-04', amount: 90000, daysAgo: 18, method: 'transfer', reference: 'UTR 361900553201' },
  { invoice: 'I-05', amount: 39900, daysAgo: 138, method: 'transfer', reference: 'UTR 358700112908' },
  { invoice: 'I-08', amount: 25000, daysAgo: 10, method: 'other', reference: 'UPI 6288 1023 5521' },
  { invoice: 'I-10', amount: 54600, daysAgo: 78, method: 'check', reference: 'CHQ 004417' },
  { invoice: 'I-12', amount: 15000, daysAgo: 8, method: 'cash', reference: 'Receipt 0912' },
  { invoice: 'I-04', amount: 20000, daysAgo: 2, method: 'transfer', reference: 'UTR 362100104455' },
];
export const CREDIT_NOTE = { invoice: 'I-05', reason: 'Coffee plantation tour cancelled due to rain', items: [{ description: 'Plantation tour refund', quantity: 1, rate: 2500 }] };

export interface VoucherSeed { key: string; lead: string; type: 'hotel' | 'transport' | 'flight' | 'activity'; supplier?: string; title: string; status: 'draft' | 'sent' | 'confirmed'; details: (n: typeof day, at: typeof atFn) => Record<string, unknown> }
const atFn = at;
export const VOUCHERS: VoucherSeed[] = [
  { key: 'V-01', lead: 'L01', type: 'hotel', supplier: 'S04', title: 'Vembanad Lake Resort — Mehta honeymoon', status: 'confirmed',
    details: (n) => ({ hotelName: 'Vembanad Lake Resort, Kumarakom', checkIn: n(0), checkOut: n(2), roomType: 'Villa', roomCount: 1, mealPlan: 'MAP', confirmationNumber: 'VLR-26-88102', guestNames: ['Arjun Mehta', 'Kavya Mehta'], specialRequests: 'Honeymoon cake and flower bed decoration' }) },
  { key: 'V-02', lead: 'L01', type: 'transport', supplier: 'S10', title: 'Airport pickup & local sightseeing — Mehta', status: 'sent',
    details: (n, a) => ({ vehicleType: 'Innova', pickupLocation: 'Cochin International Airport (COK)', dropLocation: 'Vembanad Lake Resort, Kumarakom', pickupTime: a(0, '12:30') }) },
  { key: 'V-03', lead: 'L15', type: 'hotel', supplier: 'S01', title: 'Misty Hills Tea Resort — Menon weekend', status: 'confirmed',
    details: (n) => ({ hotelName: 'Misty Hills Tea Resort, Munnar', checkIn: n(12), checkOut: n(14), roomType: 'Deluxe', roomCount: 1, mealPlan: 'CP', confirmationNumber: 'MHT-26-4410', guestNames: ['Divya Menon', 'Guest'] }) },
  { key: 'V-04', lead: 'L23', type: 'flight', supplier: 'S08', title: 'IndiGo 6E 2715 — Fernandes family', status: 'sent',
    details: (n, a) => ({ airline: 'IndiGo', flightNumber: '6E 2715', departureAirport: 'BOM', departureTime: a(83, '07:10'), arrivalAirport: 'GOI', arrivalTime: a(83, '08:25'), pnr: 'Q7XK2M', travelClass: 'economy',
      passengers: ['Daniel Fernandes', 'Maria Fernandes', 'Joel Fernandes', 'Anna Fernandes'].map((name) => ({ name, pnr: 'Q7XK2M' })) }) },
  { key: 'V-05', lead: 'L18', type: 'hotel', title: 'Hampi heritage stay — Iyer family', status: 'draft',
    details: (n) => ({ hotelName: 'Kishkinda Heritage Resort, Hampi', checkIn: n(20), checkOut: n(22), roomType: 'Heritage Room', roomCount: 1, mealPlan: 'CP', guestNames: ['Arvind Iyer', 'Family'] }) },
  { key: 'V-06', lead: 'L04', type: 'activity', title: 'Mandovi sunset cruise — Desai family', status: 'draft',
    details: (n, a) => ({ activityName: 'Mandovi sunset cruise', dateTime: a(35, '17:30'), meetingPoint: 'Santa Monica Jetty, Panaji' }) },
];

// ─── Fleet ───────────────────────────────────────────────────────

export interface VehicleSeed { key: string; reg: string; type: 'sedan' | 'suv' | 'muv' | 'tempo_traveller' | 'mini_bus'; make: string; model: string; year: number; seats: number; color: string; notes: string; status?: 'under_maintenance' }
export const VEHICLES: VehicleSeed[] = [
  { key: 'VH1', reg: 'KA 05 MN 4521', type: 'muv', make: 'Toyota', model: 'Innova Crysta', year: 2023, seats: 7, color: 'Silver', notes: 'AIT permit · stationed at Kochi desk' },
  { key: 'VH2', reg: 'KA 03 AB 7788', type: 'muv', make: 'Toyota', model: 'Innova Crysta', year: 2022, seats: 7, color: 'White', notes: 'Suresh' },
  { key: 'VH3', reg: 'KA 51 C 2210', type: 'tempo_traveller', make: 'Force', model: 'Tempo Traveller 12-seater', year: 2022, seats: 12, color: 'White', notes: 'Insurance renewal due this month' },
  { key: 'VH4', reg: 'KA 01 AH 9034', type: 'sedan', make: 'Maruti Suzuki', model: 'Dzire', year: 2024, seats: 4, color: 'Pearl White', notes: 'Bengaluru' },
  { key: 'VH5', reg: 'KA 05 ND 6612', type: 'sedan', make: 'Hyundai', model: 'Aura', year: 2023, seats: 4, color: 'Grey', notes: 'Bengaluru' },
  { key: 'VH6', reg: 'MH 02 EZ 6127', type: 'suv', make: 'Toyota', model: 'Fortuner', year: 2023, seats: 7, color: 'Black', notes: 'Mumbai branch' },
  { key: 'VH7', reg: 'MH 12 RT 3390', type: 'muv', make: 'Maruti Suzuki', model: 'Ertiga', year: 2021, seats: 6, color: 'Grey', notes: 'Brake service', status: 'under_maintenance' },
  { key: 'VH8', reg: 'MH 04 KP 1845', type: 'mini_bus', make: 'Tata', model: 'Winger 20-seater', year: 2020, seats: 20, color: 'White', notes: 'Group movements' },
];
export interface DriverSeed { key: string; name: string; phone: string; license: string; expiry: string | number; status?: 'off_duty' | 'on_leave'; extra?: Record<string, unknown> }
export const DRIVERS: DriverSeed[] = [
  { key: 'DR1', name: 'Ravi Kumar', phone: '+919876543210', license: 'KA05 20190012345', expiry: '2029-03-14',
    extra: { email: 'ravi.kumar@example.com', address: 'Aluva, Kochi, Kerala', emergencyContactName: 'Lakshmi Kumar (Wife)', emergencyContactPhone: '+919447158302', dateOfJoining: '2021-06-01', notes: 'Malayalam, English, Hindi. All-India tourist permit vehicles.' } },
  { key: 'DR2', name: 'Suresh Babu', phone: '+919845012345', license: 'KL07 20170034567', expiry: '2028-08-30' },
  { key: 'DR3', name: 'Manjunath Gowda', phone: '+919900112233', license: 'KA01 20180056789', expiry: '2030-01-11' },
  { key: 'DR4', name: 'Abdul Rasheed', phone: '+919447123456', license: 'KL43 20160078901', expiry: '2027-05-19' },
  { key: 'DR5', name: 'Prakash Shinde', phone: '+919820456789', license: 'MH12 20150090123', expiry: '2027-12-02', status: 'off_duty' },
  { key: 'DR6', name: 'Joseph Varghese', phone: '+919496234567', license: 'KL39 20140012345', expiry: 20, status: 'on_leave' },
];
export const FLEET_RATE_CARDS = [
  { name: 'Innova Crysta — Airport pickup (Kochi)', vehicleType: 'muv', tripType: 'airport_pickup', baseFare: 1500, perKmRate: 18, minKm: 40 },
  { name: 'Dzire — Airport transfer (Bengaluru)', vehicleType: 'sedan', tripType: 'airport_drop', flatRate: 1400 },
  { name: 'Innova Crysta — Outstation', vehicleType: 'muv', tripType: 'outstation', perKmRate: 18, minKm: 250, driverAllowance: 400, nightCharge: 250 },
  { name: 'Tempo Traveller 12 — Outstation', vehicleType: 'tempo_traveller', tripType: 'outstation', perKmRate: 24, minKm: 300, driverAllowance: 500 },
  { name: 'Dzire — Local 8hr/80km', vehicleType: 'sedan', tripType: 'local_8h80km', flatRate: 2200, extraKmRate: 14, extraHourRate: 180 },
  { name: 'Fortuner — Local 12hr/120km', vehicleType: 'suv', tripType: 'local_12h120km', flatRate: 5500, extraKmRate: 24, extraHourRate: 300 },
];
export const MAINTENANCE = { vehicle: 'VH7', serviceType: 'brake_service', description: 'Brake service', serviceDateOffset: -1, odometerAtService: 61240, cost: 8400, vendor: 'Sri Lakshmi Motors, Pune', nextServiceDueOffset: 180 };

export interface TripSeed {
  key: string; driver: string; vehicle: string; from: string; to: string; start: [number, string] | 'live'; end: [number, string] | 'live';
  passenger: string; tripType: string; km: number; fare: number; final: 'completed' | 'started' | 'accepted' | 'assigned' | 'cancelled'; rating?: number; cancelReason?: string;
}
export const TRIPS: TripSeed[] = [
  { key: 'T01', driver: 'DR1', vehicle: 'VH1', from: 'Cochin International Airport (COK)', to: 'Fort Kochi Heritage Inn', start: [-1, '10:30'], end: [-1, '11:45'], passenger: 'C30', tripType: 'airport_pickup', km: 42, fare: 1900, final: 'completed', rating: 5 },
  { key: 'T02', driver: 'DR1', vehicle: 'VH1', from: 'Fort Kochi Heritage Inn', to: 'Misty Hills Tea Resort, Munnar', start: [-2, '08:00'], end: [-2, '12:30'], passenger: 'C14', tripType: 'one_way', km: 130, fare: 5200, final: 'completed', rating: 5 },
  { key: 'T03', driver: 'DR3', vehicle: 'VH4', from: 'Kempegowda International Airport (BLR), T2', to: 'Indiranagar, Bengaluru', start: [-1, '21:10'], end: [-1, '22:20'], passenger: 'C24', tripType: 'airport_pickup', km: 38, fare: 1400, final: 'completed', rating: 4 },
  { key: 'T04', driver: 'DR2', vehicle: 'VH2', from: 'Fort Kochi Heritage Inn', to: 'Cochin International Airport (COK)', start: 'live', end: 'live', passenger: 'C19', tripType: 'airport_drop', km: 45, fare: 1950, final: 'started' },
  { key: 'T05', driver: 'DR4', vehicle: 'VH3', from: 'Ernakulam South Railway Station', to: 'Guruvayur Temple', start: [1, '06:00'], end: [1, '09:00'], passenger: 'C09', tripType: 'one_way', km: 85, fare: 4600, final: 'accepted' },
  { key: 'T06', driver: 'DR5', vehicle: 'VH6', from: 'Bandra West, Mumbai', to: 'Chhatrapati Shivaji Maharaj International Airport (BOM), T2', start: [3, '04:45'], end: [3, '05:45'], passenger: 'C23', tripType: 'airport_drop', km: 18, fare: 1600, final: 'assigned' },
  { key: 'T07', driver: 'DR1', vehicle: 'VH1', from: 'Cochin International Airport (COK)', to: 'Cardamom County Retreat, Thekkady', start: [5, '13:00'], end: [5, '17:30'], passenger: 'C37', tripType: 'outstation', km: 145, fare: 5600, final: 'assigned' },
  { key: 'T08', driver: 'DR4', vehicle: 'VH3', from: 'Kochi', to: 'Munnar', start: [-3, '09:00'], end: [-3, '14:00'], passenger: 'C26', tripType: 'outstation', km: 130, fare: 6800, final: 'cancelled', cancelReason: 'Client postponed travel' },
  { key: 'T09', driver: 'DR6', vehicle: 'VH7', from: 'Pune Station', to: 'Lonavala', start: [-6, '09:00'], end: [-6, '19:00'], passenger: 'C20', tripType: 'round_trip', km: 140, fare: 4900, final: 'completed', rating: 4 },
  { key: 'T10', driver: 'DR1', vehicle: 'VH1', from: 'Vembanad Lake Resort, Kumarakom', to: 'Cochin International Airport (COK)', start: [-9, '08:30'], end: [-9, '10:30'], passenger: 'C38', tripType: 'airport_drop', km: 80, fare: 3100, final: 'completed', rating: 5 },
];
export const TRIP_COSTS = [
  { trip: 'T02', costType: 'fuel', amount: 1850, description: 'Diesel — Aluva' },
  { trip: 'T02', costType: 'toll', amount: 215, description: 'Kochi bypass toll' },
  { trip: 'T09', costType: 'parking', amount: 200, description: 'Parking' },
];

/** H5 — the live airport trip (Scene 6). Created by the story spec, or by `demo-seed --live-trip`. */
export function liveAirportTrip(vehicleId: string, driverId: string, contactId?: string, leadId?: string) {
  const p = pickupTime(50);
  const end = new Date(new Date(p.iso).getTime() + (2 * 60 + 15) * 60_000).toISOString();
  return {
    pickupHHMM: p.hhmm,
    body: {
      vehicleId, driverId, ...(leadId ? { leadId } : {}), ...(contactId ? { contactId } : {}),
      pickupLocation: 'Cochin International Airport (COK), Arrival Gate 2',
      dropLocation: 'Vembanad Lake Resort, Kumarakom',
      pickupDatetime: p.iso, dropDatetime: end,
      passengerName: 'Arjun Mehta', passengerPhone: '9820144562',
      specialInstructions: `IndiGo 6E 6171 lands ${p.hhmm}. Meet at Gate 2 with a Mehta name board. Honeymooners, 3 bags.`,
      tripType: 'airport_pickup', estimatedDistanceKm: 82, estimatedCost: 3200,
      pickupLat: 10.152, pickupLng: 76.4019, dropLat: 9.6177, dropLng: 76.4285,
      autoCreateVoucher: false,
    },
  };
}

// ─── Tasks, follow-ups, events, notes ────────────────────────────

export const TASKS = [
  { title: 'Send revised Maldives quote to Neha Kapoor', priority: 'high', due: [0, '12:00'], assignee: 'ananya', lead: 'L02', status: 'todo' },
  { title: "Call Vembanad Lake Resort to confirm the Mehtas' honeymoon cake", priority: 'medium', due: [0, '16:00'], assignee: 'deepa', lead: 'L01', status: 'in_progress' },
  { title: 'Collect passport copies — Malhotra family (Dubai)', priority: 'high', due: [0, '18:00'], assignee: 'farhan', lead: 'L06', status: 'todo' },
  { title: 'Follow up on Northstar offsite PO', priority: 'medium', due: [1, '11:00'], assignee: 'rahul', lead: 'L12', status: 'todo' },
  { title: 'Renew insurance — KA 51 C 2210 Tempo Traveller', priority: 'medium', due: [7, '11:00'], assignee: 'deepa', status: 'todo' },
  { title: 'Reconcile September supplier payments', priority: 'low', due: [-1, '17:00'], assignee: 'vikram', status: 'todo' },
  { title: 'Publish Diwali Getaways flyer on Instagram', priority: 'low', due: [-1, '12:00'], assignee: 'ananya', status: 'done' },
] as const;
export const TASK_COMMENT = { task: 'Send revised Maldives quote to Neha Kapoor', content: 'Neha prefers a sunset villa — use the second option.' };

export const FOLLOW_UPS = [
  { lead: 'L02', when: [0, '11:30'], type: 'call', notes: 'Discuss seaplane timing and villa choice' },
  { lead: 'L07', when: [0, '15:00'], type: 'whatsapp', notes: 'Share Ubud villa photos' },
  { lead: 'L03', when: [0, '18:00'], type: 'email', notes: 'Send revised Rajasthan quote with 5% discount' },
  { lead: 'L08', when: [-1, '10:00'], type: 'call', notes: 'Universal Studios add-on' },
  { lead: 'L12', when: [2, '11:00'], type: 'visit', notes: 'Meet Siddharth at Northstar office, HITEC City' },
] as const;

export const EVENTS = [
  { title: 'Team stand-up', start: [0, '09:30'], end: [0, '09:45'], type: 'meeting', location: 'Indiranagar office' },
  { title: 'Supplier call — Lakes & Lagoons Houseboats', start: [0, '11:00'], end: [0, '11:30'], type: 'call' },
  { title: 'Diwali campaign review', start: [0, '17:00'], end: [0, '17:30'], type: 'meeting' },
  { title: 'Northstar site visit — Coorg', start: [4, '09:00'], end: [4, '18:00'], type: 'other', allDay: true },
] as const;
export const STICKY_NOTES = [
  { content: 'Diwali flyers go live Monday', color: 'yellow' },
  { content: 'Ask Deepa about houseboat availability for Christmas week', color: 'blue' },
];

export const MESSAGE_TEMPLATES = [
  { name: 'Quotation — Kerala family package', channel: 'email', category: 'quotation', subject: 'Your Kerala holiday plan — {{destination}}',
    content: 'Dear {{customer_name}},\n\nThank you for choosing Sahyadri Holidays. Your personalised {{destination}} plan is ready.\nThe total for your family is {{amount}}, including stays, private car and sightseeing.\nHappy to tweak anything — just reply to this email.\n\nWarm regards,\n{{agent_name}}' },
  { name: 'Booking confirmed', channel: 'whatsapp', category: 'booking', content: "Hi {{first_name}}, your {{destination}} trip is confirmed for {{travel_date}}. We'll share vouchers shortly. — Sahyadri Holidays" },
  { name: 'Payment reminder — gentle', channel: 'email', category: 'reminder', subject: 'A gentle reminder — {{destination}} trip',
    content: 'Hi {{first_name}},\n\nA gentle reminder that {{amount}} is due for your {{destination}} trip. Please let us know if you need our bank details again.\n\nThank you,\nSahyadri Holidays' },
  { name: 'Driver details — hotel pickup', channel: 'whatsapp', category: 'booking', content: 'Hi {{first_name}}, your driver {{driver_name}} ({{driver_phone}}) will meet you at the hotel lobby with a name board.' },
  { name: 'Happy anniversary', channel: 'whatsapp', category: 'wish', content: 'Happy anniversary, {{first_name}}! Wishing you many more journeys together. — Team Sahyadri' },
  { name: 'Visa documents checklist', channel: 'email', category: 'visa', subject: 'Documents needed for your {{destination}} visa',
    content: 'Hi {{first_name}},\n\nFor your {{destination}} visa please share: passport (first and last page), two recent photographs, 6 months bank statement and your confirmed itinerary.\n\nSahyadri Holidays' },
] as const;

export const NOTIFICATIONS = [
  { title: 'Payment received', message: '₹47,250 received against SH-INV for Arvind Iyer', type: 'payment_received', ref: ['invoice', 'I-03'], read: false },
  { title: 'Follow-up due at 11:30', message: 'Call Neha Kapoor about the Maldives quote', type: 'follow_up_reminder', ref: ['lead', 'L02'], read: false },
  { title: 'Insurance renewal due in 12 days', message: 'KA 51 C 2210 · Force Tempo Traveller', type: 'system', ref: null, read: false },
  { title: 'Task assigned to you', message: 'Send revised Maldives quote to Neha Kapoor', type: 'task_assigned', ref: ['task', 'x'], read: false },
  { title: 'Overdue invoice', message: 'Dubai deposit for Karan Malhotra is 6 days overdue', type: 'system', ref: ['invoice', 'I-07'], read: false },
  { title: 'Lead assigned to you', message: 'Udaipur Lake Palace Anniversary', type: 'lead_assigned', ref: ['lead', 'L24'], read: true },
] as const;

export const MESSAGE_LOG = [
  { dir: 'outgoing', channel: 'whatsapp', contact: 'C05', status: 'read', content: 'Hi Neha, sharing two sunset water-villa options for your dates. Shall I hold one?', ago: 3 * 1440 },
  { dir: 'incoming', channel: 'whatsapp', contact: 'C05', status: 'delivered', content: 'The second one looks perfect! Can you check the seaplane timing?', ago: 3 * 1440 - 40 },
  { dir: 'outgoing', channel: 'email', contact: 'C30', status: 'delivered', content: 'Your Rajasthan heritage itinerary (revised)', ago: 2 * 1440 },
  { dir: 'incoming', channel: 'sms', contact: 'C23', status: 'delivered', content: 'Can we add one more night in Ubud?', ago: 1440 + 180 },
  { dir: 'outgoing', channel: 'whatsapp', contact: 'C02', status: 'delivered', content: 'Your driver Ravi Kumar (+91 98765 43210) will meet you at Arrival Gate 2 — KA 05 MN 4521.', ago: 20 },
  { dir: 'outgoing', channel: 'email', contact: 'C13', status: 'read', content: 'Dubai Shopping Festival — options and deposit details', ago: 5 * 1440 },
  { dir: 'outgoing', channel: 'whatsapp', contact: 'C12', status: 'delivered', content: 'Hi Harpreet, the Ladakh bike expedition brochure is attached. Any questions?', ago: 1440 },
  { dir: 'incoming', channel: 'whatsapp', contact: 'C12', status: 'delivered', content: 'Thanks! Is the riding gear included?', ago: 1440 - 55 },
  { dir: 'outgoing', channel: 'email', contact: 'C08', status: 'delivered', content: 'Coorg offsite — proforma invoice and itinerary', ago: 4 * 1440 },
  { dir: 'incoming', channel: 'email', contact: 'C08', status: 'delivered', content: 'Received. PO to follow after the leadership review on Friday.', ago: 3 * 1440 + 300 },
  { dir: 'outgoing', channel: 'whatsapp', contact: 'C35', status: 'read', content: 'Hi Daniel, your Goa Christmas villa advance has been received. Thank you!', ago: 2 * 1440 + 60 },
  { dir: 'incoming', channel: 'whatsapp', contact: 'C14', status: 'delivered', content: 'Can we get a late check-out at Munnar?', ago: 600 },
] as const;

// ─── Six months of trading history ───────────────────────────────
// Repeat customers and closed sales spread over the last six calendar months, so the dashboard KPIs, the revenue
// trend and the sales / team reports have real, non-zero figures in the current month and a visible trend.
// Appended to the base arrays above (the seeder, the SQL backdating and the verifier all iterate those arrays).

/** Days before D0 for "day `dom` of the calendar month `monthsBack` months ago"; the current month never lands in the future. */
export function monthDay(monthsBack: number, dom: number): number {
  const [y, m, dd] = nums(d0(), '-');
  const target = Date.UTC(y, m - 1 - monthsBack, monthsBack === 0 ? Math.min(dom, dd) : Math.min(dom, 28));
  return Math.max(0, Math.round((Date.UTC(y, m - 1, dd) - target) / 86_400_000));
}

interface HistorySale {
  key: string; contact: ContactSeed; title: string; destinations: string[]; tripType: LeadSeed['tripType']; adults: number; children: number;
  budget: number; assignee: string; source: LeadSeed['source']; template: string; invoiceLine: string; rate: number;
  monthsBack: number; dom: number; method: string; reference: string;
}
const repeat = (key: string, name: string, city: string, state: string, phone: string, tags: string[], age: number): ContactSeed =>
  ({ key, name, city, state, country: IN, phone, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, source: 'referral', tags, age });

const HISTORY_CONTACTS: ContactSeed[] = [
  repeat('C40', 'Anjali Bhat', 'Mysuru', 'Karnataka', '+919845611201', ['family', 'repeat'], 230),
  repeat('C41', 'Mohan Krishnan', 'Chennai', 'Tamil Nadu', '+919840622312', ['repeat', 'kerala'], 210),
  repeat('C42', 'Lavanya Rao', 'Hyderabad', 'Telangana', '+919849633423', ['family', 'international'], 190),
  repeat('C43', 'Deepak Nambiar', 'Kozhikode', 'Kerala', '+919447644534', ['family'], 170),
  repeat('C44', 'Aarti Bose', 'Kolkata', 'West Bengal', '+919830655645', ['honeymoon'], 150),
  repeat('C45', 'Pradeep Hegde', 'Udupi', 'Karnataka', '+919448666756', ['weekend'], 135),
  repeat('C46', 'Swati Kulkarni', 'Pune', 'Maharashtra', '+919822677867', ['heritage', 'international'], 120),
  repeat('C47', 'Gopal Menon', 'Thrissur', 'Kerala', '+919446688978', ['family', 'repeat'], 105),
];
const c = (k: string): ContactSeed => HISTORY_CONTACTS.find((x) => x.key === k)!;

const HISTORY_SALES: HistorySale[] = [
  { key: 'W01', contact: c('C40'), title: 'Coorg Coffee Estate Retreat — Bhat family', destinations: ['Coorg'], tripType: 'family', adults: 2, children: 2, budget: 80000, assignee: 'sneha', source: 'referral', template: 'T-GOA', invoiceLine: 'Coorg coffee estate retreat — 3N', rate: 75000, monthsBack: 0, dom: 2, method: 'transfer', reference: 'UTR 362300118840' },
  { key: 'W02', contact: c('C41'), title: 'Wayanad Monsoon Escape — Krishnan', destinations: ['Wayanad'], tripType: 'domestic', adults: 2, children: 0, budget: 56000, assignee: 'sneha', source: 'walkin', template: 'T-KER', invoiceLine: 'Wayanad monsoon escape — 2N', rate: 52000, monthsBack: 0, dom: 3, method: 'other', reference: 'UPI 6301 7742 1180' },
  { key: 'W03', contact: c('C42'), title: 'Sri Lanka Coastal Circuit — Rao family', destinations: ['Colombo', 'Galle'], tripType: 'international', adults: 2, children: 2, budget: 230000, assignee: 'farhan', source: 'google', template: 'T-DXB', invoiceLine: 'Sri Lanka coastal circuit — 5N', rate: 215000, monthsBack: 0, dom: 4, method: 'transfer', reference: 'UTR 362000417733' },
  { key: 'W04', contact: c('C43'), title: 'Andaman Family Break — Nambiar', destinations: ['Port Blair', 'Havelock'], tripType: 'family', adults: 2, children: 1, budget: 150000, assignee: 'sneha', source: 'website', template: 'T-GOA', invoiceLine: 'Andaman family break — 4N', rate: 140000, monthsBack: 1, dom: 19, method: 'card', reference: 'POS 447190' },
  { key: 'W05', contact: c('C44'), title: 'Kashmir Houseboat Honeymoon — Bose', destinations: ['Srinagar', 'Gulmarg'], tripType: 'honeymoon', adults: 2, children: 0, budget: 165000, assignee: 'rahul', source: 'facebook', template: 'T-KAS', invoiceLine: 'Kashmir honeymoon — 5N', rate: 155000, monthsBack: 2, dom: 8, method: 'transfer', reference: 'UTR 361600294410' },
  { key: 'W06', contact: c('C45'), title: 'Ooty & Coonoor Weekend — Hegde', destinations: ['Ooty'], tripType: 'domestic', adults: 2, children: 0, budget: 40000, assignee: 'sneha', source: 'referral', template: 'T-KER', invoiceLine: 'Ooty & Coonoor weekend — 2N', rate: 38000, monthsBack: 2, dom: 23, method: 'other', reference: 'UPI 6283 5510 4467' },
  { key: 'W07', contact: c('C46'), title: 'Bhutan Cultural Circuit — Kulkarni', destinations: ['Paro', 'Thimphu'], tripType: 'international', adults: 2, children: 0, budget: 250000, assignee: 'farhan', source: 'google', template: 'T-RAJ', invoiceLine: 'Bhutan cultural circuit — 6N', rate: 238000, monthsBack: 3, dom: 11, method: 'transfer', reference: 'UTR 361300772096' },
  { key: 'W08', contact: c('C47'), title: 'Rajasthan Fort & Desert — Menon family', destinations: ['Jaipur', 'Jaisalmer'], tripType: 'family', adults: 4, children: 0, budget: 200000, assignee: 'rahul', source: 'referral', template: 'T-RAJ', invoiceLine: 'Rajasthan fort & desert circuit — 6N', rate: 190000, monthsBack: 4, dom: 15, method: 'transfer', reference: 'UTR 361000338821' },
  { key: 'W09', contact: c('C41'), title: 'Kerala Ayurveda Escape — Krishnan', destinations: ['Kovalam'], tripType: 'domestic', adults: 2, children: 0, budget: 120000, assignee: 'sneha', source: 'referral', template: 'T-KER', invoiceLine: 'Kerala Ayurveda escape — 5N', rate: 114000, monthsBack: 5, dom: 10, method: 'card', reference: 'POS 439027' },
  { key: 'W10', contact: c('C42'), title: 'Dubai Family Holiday — Rao family', destinations: ['Dubai'], tripType: 'international', adults: 2, children: 2, budget: 320000, assignee: 'farhan', source: 'referral', template: 'T-DXB', invoiceLine: 'Dubai family holiday — 5N', rate: 305000, monthsBack: 2, dom: 15, method: 'transfer', reference: 'UTR 361600571829' },
  { key: 'W11', contact: c('C47'), title: 'Thailand Island Hopping — Menon family', destinations: ['Phuket', 'Krabi'], tripType: 'international', adults: 4, children: 0, budget: 240000, assignee: 'farhan', source: 'google', template: 'T-DXB', invoiceLine: 'Thailand island hopping — 6N', rate: 228000, monthsBack: 3, dom: 24, method: 'card', reference: 'POS 441873' },
  { key: 'W13', contact: c('C45'), title: 'Nandi Hills Team Offsite — Hegde & Co', destinations: ['Nandi Hills'], tripType: 'corporate', adults: 24, children: 0, budget: 320000, assignee: 'rahul', source: 'referral', template: 'T-GOA', invoiceLine: 'Nandi Hills team offsite — 2N, 24 guests', rate: 300000, monthsBack: 1, dom: 22, method: 'transfer', reference: 'UTR 362200645117' },
  { key: 'W14', contact: c('C43'), title: 'Chikmagalur Coffee Retreat — Nambiar', destinations: ['Chikmagalur'], tripType: 'family', adults: 2, children: 2, budget: 90000, assignee: 'rahul', source: 'website', template: 'T-GOA', invoiceLine: 'Chikmagalur coffee retreat — 3N', rate: 85000, monthsBack: 0, dom: 1, method: 'other', reference: 'UPI 6310 2290 5518' },
  { key: 'W12', contact: c('C40'), title: 'Goa Beach Week — Bhat family', destinations: ['Goa'], tripType: 'family', adults: 2, children: 2, budget: 140000, assignee: 'sneha', source: 'referral', template: 'T-GOA', invoiceLine: 'Goa beach week — 6N', rate: 133000, monthsBack: 4, dom: 4, method: 'other', reference: 'UPI 6276 4419 0083' },
];

CONTACTS.push(...HISTORY_CONTACTS);
for (const s of HISTORY_SALES) {
  const age = monthDay(s.monthsBack, s.dom);
  LEADS.push({
    key: s.key, title: s.title, contact: s.contact.key, destinations: s.destinations, tripType: s.tripType, travel: -Math.max(1, age - 10), ret: -Math.max(0, age - 14),
    adults: s.adults, children: s.children, budget: s.budget, status: 'won', priority: 'warm', source: s.source, assignee: s.assignee, age,
  });
  LEAD_ITINERARIES[s.key] = { template: s.template, title: s.title };
  const total = Math.round(s.rate * 1.05);
  INVOICES.push({ key: `I-${s.key}`, contact: s.contact.key, lead: s.key, type: 'tax_invoice', lines: [{ description: s.invoiceLine, rate: s.rate }], age, due: -age + 14, target: 'paid' });
  PAYMENTS.push({ invoice: `I-${s.key}`, amount: total, daysAgo: Math.max(0, age - 2), method: s.method, reference: s.reference });
}

// ─── Visa desk ───────────────────────────────────────────────────

export interface TravellerSeed { key: string; contact: string; firstName: string; lastName: string; passportNumber: string; dateOfBirth: string; gender: 'male' | 'female'; nationality: string; passportExpiryDate: string }
export const TRAVELLERS: TravellerSeed[] = [
  { key: 'TR1', contact: 'C13', firstName: 'Karan', lastName: 'Malhotra', passportNumber: 'Z1234567', dateOfBirth: '1986-04-12', gender: 'male', nationality: 'Indian', passportExpiryDate: '2033-08-19' },
  { key: 'TR2', contact: 'C16', firstName: 'Ishaan', lastName: 'Chatterjee', passportNumber: 'P7740192', dateOfBirth: '1988-09-03', gender: 'male', nationality: 'Indian', passportExpiryDate: '2031-02-27' },
  { key: 'TR3', contact: 'C07', firstName: 'Ananya', lastName: 'Krishnan', passportNumber: 'K5521830', dateOfBirth: '1991-01-22', gender: 'female', nationality: 'Indian', passportExpiryDate: '2032-11-05' },
  { key: 'TR4', contact: 'C23', firstName: 'Tanvi', lastName: 'Deshpande', passportNumber: 'M3308815', dateOfBirth: '1993-06-30', gender: 'female', nationality: 'Indian', passportExpiryDate: '2030-07-14' },
];
export interface VisaSeed { traveller: string; lead?: string; country: string; type: 'tourist' | 'business'; status: 'documents_collecting' | 'applied' | 'processing' | 'approved'; appliedAgo?: number; expectedIn?: number; applicationNumber?: string; visaNumber?: string; embassy?: string; expiresIn?: number }
export const VISAS: VisaSeed[] = [
  { traveller: 'TR1', lead: 'L06', country: 'United Arab Emirates', type: 'tourist', status: 'documents_collecting', expectedIn: 40, embassy: 'UAE e-Visa Service' },
  { traveller: 'TR2', lead: 'L09', country: 'France', type: 'tourist', status: 'applied', appliedAgo: 6, expectedIn: 12, applicationNumber: 'FRA-BLR-26-48213', embassy: 'VFS Global, Bengaluru' },
  { traveller: 'TR3', lead: 'L17', country: 'Japan', type: 'tourist', status: 'processing', appliedAgo: 12, expectedIn: 8, applicationNumber: 'JPN-CHE-26-11094', embassy: 'Consulate General of Japan, Chennai' },
  { traveller: 'TR4', lead: 'L07', country: 'Indonesia', type: 'tourist', status: 'approved', appliedAgo: 9, applicationNumber: 'IDN-EV-26-775201', visaNumber: 'IDN-VOA-9930412', embassy: 'Indonesia e-Visa', expiresIn: 170 },
];

// ─── Marketing: segments + campaigns ─────────────────────────────

const rule = (field: string, operator: string, value: string) => ({ field, operator, value });
export const SEGMENTS: { key: string; name: string; description: string; filters: Record<string, unknown> }[] = [
  { key: 'families', name: 'Families with kids', description: 'Contacts tagged family', filters: { logic: 'OR', rules: [rule('tags', 'contains', 'family')] } },
  { key: 'honeymooners', name: 'Honeymooners', description: 'Couples planning a honeymoon', filters: { logic: 'OR', rules: [rule('tags', 'contains', 'honeymoon')] } },
  { key: 'repeat', name: 'Repeat travellers', description: 'Guests who have travelled with us before', filters: { logic: 'OR', rules: [rule('tags', 'contains', 'repeat')] } },
  { key: 'kerala', name: 'Kerala enquiries', description: 'Kerala-bound families and couples', filters: { logic: 'OR', rules: [rule('tags', 'contains', 'kerala')] } },
  { key: 'corporate', name: 'Corporate accounts', description: 'Offsites and sales meets', filters: { logic: 'OR', rules: [rule('tags', 'contains', 'corporate')] } },
];
export const CAMPAIGNS: { name: string; type: 'email' | 'whatsapp'; segment: string; subject?: string; body: string; final: 'sent' | 'scheduled' | 'draft'; stats?: [number, number, number, number]; agoDays?: number; inDays?: number }[] = [
  { name: 'Diwali Getaways 2026 — Goa & Udaipur', type: 'email', segment: 'families', subject: 'Diwali getaways from ₹24,999 — Goa & Udaipur',
    body: 'Hi {{first_name}},\n\nThis Diwali, give the family a break. Goa beach stays and Udaipur lake palaces, hand-picked by our team, from ₹24,999 per person.\n\nReply to this email and we will hold your dates.\n\nSahyadri Holidays', final: 'sent', stats: [412, 188, 47, 6], agoDays: 6 },
  { name: 'Winter in Europe — early bird', type: 'email', segment: 'repeat', subject: 'Early-bird Europe departures for next winter',
    body: 'Hi {{first_name}},\n\nOur early-bird Europe departures are open: Paris, the Swiss Alps and Rome, with limited seats.\n\nSahyadri Holidays', final: 'scheduled', inDays: 5 },
  { name: 'Monsoon Munnar weekends', type: 'whatsapp', segment: 'kerala', body: 'Hi {{first_name}}, tea-estate weekends in Munnar are open for the coming weeks. Reply YES and we will share the plan. — Sahyadri Holidays', final: 'draft' },
];

// ─── Banned strings (A.13) — also asserted against everything seeded ─────

export const BANNED_PATTERNS: RegExp[] = [
  /\bE2E\b/, /Showcase/, /\bTest\s/, /lorem/i, /e2e\.test/, /Demo Admin/, /Demo Travels/, /Test Agency/,
  /Seed (Origin|Destination)/, /\[object Object\]/, /Invalid Date/, /\bNaN\b/, /\bundefined\b/,
  /\[(Destination|Amount|Travel Date|Pax Count|\.\.\.)\]/,
];
