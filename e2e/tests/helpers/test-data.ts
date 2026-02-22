/**
 * Test data factory for generating realistic test data
 */

function randomString(length: number = 8): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

function randomEmail(): string {
  return `test-${randomString()}@example.com`;
}

function randomPhone(): string {
  return `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`;
}

/**
 * Create test contact data — matches backend createContactSchema
 */
export function createTestContact() {
  return {
    name: `Test ${randomString(5)} Contact`,
    email: randomEmail(),
    phone: randomPhone(),
    company: `Company-${randomString(4)}`,
    type: 'customer',
    source: 'manual',
    city: 'Mumbai',
    state: 'MH',
    country: 'India',
    postalCode: '400001',
    tags: ['vip', 'travel'],
    notes: 'Test contact',
  };
}

/**
 * Create test lead data — matches backend createLeadSchema
 */
export function createTestLead(contactId: string) {
  return {
    contactId,
    title: `Trip-${randomString(5)}`,
    destinations: ['Bali'],
    travelDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    returnDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paxAdults: 2,
    paxChildren: 0,
    paxInfants: 0,
    budget: 500000,
    currency: 'INR',
    tripType: 'international',
    source: 'manual',
    priority: 'warm',
    notes: 'Test lead for E2E testing',
  };
}

/**
 * Create test itinerary data
 */
export function createTestItinerary(leadId: string) {
  return {
    leadId,
    title: `Itinerary-${randomString(5)}`,
    notes: 'Test itinerary',
    days: [
      {
        dayNumber: 1,
        title: 'Arrival and Check-in',
        description: 'Welcome to Bali',
        items: [
          {
            type: 'hotel',
            timeStart: '14:00',
            title: 'Hotel Check-in',
            description: 'Check into luxury resort at Seminyak Beach Resort',
          },
        ],
      },
      {
        dayNumber: 2,
        title: 'Beach Day',
        description: 'Relax at the beach',
        items: [
          {
            type: 'activity',
            timeStart: '09:00',
            title: 'Beach Breakfast',
            description: 'Enjoy breakfast on the beach at Seminyak',
          },
        ],
      },
    ],
  };
}

/**
 * Create test invoice data — matches backend createInvoiceSchema
 */
export function createTestInvoice(contactId: string, leadId?: string) {
  return {
    contactId,
    leadId: leadId || null,
    invoiceNumber: `INV-${randomString(8).toUpperCase()}`,
    type: 'tax_invoice',
    status: 'draft',
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Test invoice for E2E testing',
    items: [
      {
        description: 'Flight Booking',
        quantity: 2,
        rate: 50000,
        taxRate: 5,
      },
      {
        description: 'Hotel Accommodation',
        quantity: 4,
        rate: 15000,
        taxRate: 18,
      },
    ],
  };
}

/**
 * Create test payment data
 */
export function createTestPayment(invoiceId: string) {
  return {
    invoiceId,
    amount: 100000,
    method: 'bank_transfer',
    date: new Date().toISOString().split('T')[0],
    reference: `PAY-${randomString(8).toUpperCase()}`,
    notes: 'Test payment',
    type: 'incoming',
  };
}

/**
 * Create test template data
 */
export function createTestTemplate(channel: 'email' | 'whatsapp' | 'sms' = 'email') {
  return {
    channel,
    name: `Template-${randomString(5)}`,
    content:
      'Hello {firstName}, Your travel details: {destination} on {travelDate}. Contact us at {contactPhone}.',
    category: 'booking',
  };
}

/**
 * Create test follow-up data — matches backend follow_ups schema
 */
export function createTestFollowUp(leadId: string, assignedToUserId?: string) {
  return {
    leadId,
    type: 'email',
    scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Test follow-up task',
    status: 'pending',
  };
}

/**
 * Create test notification data
 */
export function createTestNotification(userId: string) {
  return {
    userId,
    title: 'Test Notification',
    message: 'This is a test notification for E2E testing',
    type: 'system',
  };
}

/**
 * Create test communication history data
 */
export function createTestCommunication(
  contactId: string,
  type: 'email' | 'whatsapp' | 'sms' = 'email'
) {
  return {
    contactId,
    channel: type,
    content: 'Test message for communication history',
    status: 'delivered',
  };
}

/**
 * Create test voucher data for each type — matches backend createVoucherSchema
 */
export function createTestHotelVoucher(leadId: string, supplierId?: string) {
  return {
    leadId,
    type: 'hotel',
    title: `Hotel Voucher - ${randomString(5)}`,
    supplierId: supplierId || null,
    language: 'en',
    details: {
      guestNames: ['John Doe', 'Jane Doe'],
      hotelName: 'Grand Hyatt Resort',
      hotelAddress: '123 Beach Road, Bali',
      checkIn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      checkOut: new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      roomType: 'Deluxe',
      roomCount: 1,
      mealPlan: 'MAP',
      specialRequests: 'Honeymoon decoration',
      confirmationNumber: `HC-${randomString(6).toUpperCase()}`,
      emergencyContact: '+91-9876543210',
    },
    notes: 'Test hotel voucher',
  };
}

export function createTestTransportVoucher(leadId: string) {
  return {
    leadId,
    type: 'transport',
    title: `Transport Voucher - ${randomString(5)}`,
    details: {
      vehicleType: 'SUV',
      driverName: 'Rajesh Kumar',
      driverPhone: '+91-9988776655',
      pickupLocation: 'Airport Terminal 2',
      pickupTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      dropLocation: 'Grand Hyatt Resort',
      route: 'Airport → Seminyak → Resort',
      sightseeing: ['Tanah Lot Temple', 'Uluwatu Temple'],
      terms: 'AC vehicle, fuel included, toll extra',
    },
  };
}

export function createTestFlightVoucher(leadId: string) {
  return {
    leadId,
    type: 'flight',
    title: `Flight Voucher - ${randomString(5)}`,
    details: {
      airline: 'Air India',
      flightNumber: 'AI-302',
      departureAirport: 'DEL',
      departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      departureTerminal: 'T3',
      arrivalAirport: 'DPS',
      arrivalTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString(),
      arrivalTerminal: 'International',
      passengers: [
        { name: 'John Doe', pnr: 'ABC123' },
        { name: 'Jane Doe', pnr: 'ABC124' },
      ],
      pnr: 'ABC123',
      baggageAllowance: '15kg check-in + 7kg cabin',
      seatNumbers: '12A, 12B',
      travelClass: 'economy',
      mealPreference: 'Vegetarian',
    },
  };
}

export function createTestActivityVoucher(leadId: string) {
  return {
    leadId,
    type: 'activity',
    title: `Activity Voucher - ${randomString(5)}`,
    details: {
      activityName: 'Snorkeling at Nusa Penida',
      dateTime: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      meetingPoint: 'Sanur Beach Harbour',
      duration: '3 hours',
      whatToBring: ['Swimwear', 'Sunscreen', 'Camera'],
      inclusions: ['Equipment', 'Guide', 'Lunch', 'Insurance'],
      emergencyContact: '+91-9876543210',
      operatorContact: 'Bali Adventures +62-812-3456789',
    },
  };
}

/**
 * Test user credentials — tenantId is valid UUID matching our seed data
 */
export const TEST_TENANT_ID = '01960000-0000-7000-8000-000000000001';

export const TEST_ADMIN = {
  email: 'admin@test.com',
  password: 'Admin@123',
  tenantId: TEST_TENANT_ID,
};

export const TEST_SALESPERSON = {
  email: 'sales@test.com',
  password: 'Admin@123',
  tenantId: TEST_TENANT_ID,
};

export const TEST_MANAGER = {
  email: 'manager@test.com',
  password: 'Admin@123',
  tenantId: TEST_TENANT_ID,
};

/**
 * API endpoints — using /api/ prefix (backend serves both /api/ and /api/v1/)
 */
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  AUTH_REFRESH: '/api/auth/refresh-token',
  AUTH_RESOLVE_TENANT: '/api/auth/resolve-tenant',
  AUTH_LOGOUT: '/api/auth/logout',

  // Contacts
  CONTACTS: '/api/contacts',
  CONTACTS_SEARCH: '/api/contacts/search',

  // Leads
  LEADS: '/api/leads',
  LEADS_SEARCH: '/api/leads/search',

  // Follow-ups
  FOLLOWUPS: '/api/follow-ups',

  // Itineraries
  ITINERARIES: '/api/itineraries',
  ITINERARIES_CLONE: '/api/itineraries/:id/clone',
  ITINERARIES_TEMPLATES: '/api/itinerary-templates',

  // Invoices
  INVOICES: '/api/invoices',
  INVOICES_VOID: '/api/invoices/:id/void',
  INVOICES_DUPLICATE: '/api/invoices/:id/duplicate',

  // Payments
  PAYMENTS: '/api/payments',

  // Communications
  COMMUNICATIONS: '/api/communications',
  COMMUNICATIONS_HISTORY: '/api/communications/history/:contactId',
  COMMUNICATIONS_SEND: '/api/communications/send',

  // Templates
  TEMPLATES: '/api/message-templates',

  // Credit/Debit Notes
  CREDIT_NOTES: '/api/credit-notes',
  DEBIT_NOTES: '/api/debit-notes',

  // Reports
  REPORTS_OUTSTANDING: '/api/reports/outstanding',
  REPORTS_AGEING: '/api/reports/ageing',

  // Notifications
  NOTIFICATIONS: '/api/notifications',
  NOTIFICATIONS_PREFERENCES: '/api/notification-preferences',

  // Push Tokens
  PUSH_TOKENS: '/api/push-tokens',

  // Campaigns
  CAMPAIGNS: '/api/campaigns',

  // Vouchers
  VOUCHERS: '/api/vouchers',
  VOUCHERS_BY_LEAD: '/api/vouchers/by-lead',
  VOUCHERS_FROM_ITINERARY: '/api/vouchers/from-itinerary-item',
  VOUCHERS_BULK_SEND: '/api/vouchers/bulk-send',
};
