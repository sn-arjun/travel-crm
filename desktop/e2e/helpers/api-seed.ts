import { getAuthToken, API_URL } from './auth';
import { localDay } from './date-picker';

let token: string | null = null;

async function ensureToken(forceRefresh = false) {
  if (!token || forceRefresh) token = await getAuthToken();
  return token;
}

export async function api(method: string, path: string, body?: any): Promise<any> {
  let t = await ensureToken();
  const makeReq = (tok: string) => fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let res = await makeReq(t);
  // Retry once with a fresh token if we get a 401
  if (res.status === 401) {
    t = await ensureToken(true);
    res = await makeReq(t);
  }
  return res.json();
}

export async function seedContact(overrides: Record<string, any> = {}) {
  const data = {
    name: `E2E Contact ${Date.now()}`,
    email: `e2e-${Date.now()}@test.com`,
    phone: `+919${Math.floor(100000000 + Math.random() * 900000000)}`,
    type: 'customer',
    ...overrides,
  };
  const res = await api('POST', '/contacts', data);
  if (!res?.data?.id) {
    // Fail here with the server's answer instead of handing back an object without an id.
    throw new Error(`seedContact failed: ${JSON.stringify(res).slice(0, 500)}`);
  }
  return res.data;
}

export async function seedLead(contactId: string, overrides: Record<string, any> = {}) {
  const data = {
    contactId,
    title: `E2E Lead ${Date.now()}`,
    destinations: ['Bali'],
    travelDate: localDay(new Date()),
    tripType: 'domestic',
    source: 'website',
    ...overrides,
  };
  const res = await api('POST', '/leads', data);
  return res.data ?? res;
}

export async function seedItinerary(leadId: string, overrides: Record<string, any> = {}) {
  const data = {
    leadId,
    title: `E2E Itinerary ${Date.now()}`,
    currency: 'INR',
    days: [
      {
        dayNumber: 1,
        title: 'Arrival',
        items: [
          { type: 'hotel', title: 'Hotel Stay', costPrice: 5000, sellingPrice: 7000, quantity: 1, sortOrder: 0 },
        ],
      },
    ],
    ...overrides,
  };
  const res = await api('POST', '/itineraries', data);
  return res.data ?? res;
}

export async function seedInvoice(contactId: string, overrides: Record<string, any> = {}) {
  const data = {
    contactId,
    items: [
      { description: 'E2E Test Item', quantity: 1, rate: 10000, taxRate: 18 },
    ],
    ...overrides,
  };
  const res = await api('POST', '/invoices', data);
  return res.data ?? res;
}

export async function seedSupplier(overrides: Record<string, any> = {}) {
  const data = {
    companyName: `E2E Supplier ${Date.now()}`,
    category: 'hotel',
    email: `supplier-${Date.now()}@test.com`,
    phone: `+919${Math.floor(100000000 + Math.random() * 900000000)}`,
    ...overrides,
  };
  const res = await api('POST', '/suppliers', data);
  return res.data ?? res;
}

export async function seedVoucher(leadId: string, overrides: Record<string, any> = {}) {
  const data = {
    leadId,
    type: 'hotel',
    title: `E2E Hotel Voucher ${Date.now()}`,
    details: {
      guestNames: ['E2E Guest'],
      hotelName: 'E2E Hotel',
      checkIn: localDay(new Date()),
      checkOut: localDay(new Date(Date.now() + 86400000 * 3)),
      roomType: 'standard',
      roomCount: 1,
      mealPlan: 'EP',
    },
    ...overrides,
  };
  const res = await api('POST', '/vouchers', data);
  return res.data ?? res;
}

export async function seedTask(overrides: Record<string, any> = {}) {
  const data = {
    title: `E2E Task ${Date.now()}`,
    status: 'todo',
    priority: 'medium',
    ...overrides,
  };
  const res = await api('POST', '/tasks', data);
  return res.data ?? res;
}

export async function seedTraveller(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const firstName = overrides.firstName ?? overrides.name ?? `E2E Traveller ${ts}`;
  const lastName = overrides.lastName ?? 'E2E';
  const data = {
    firstName,
    lastName,
    fullNamePassport: `${firstName} ${lastName}`,
    passportNumber: overrides.passportNumber ?? `E2E${ts}`.slice(0, 20),
    nationality: overrides.nationality ?? 'Indian',
    ...overrides,
    // Ensure required fields always present
    name: undefined,
  };
  // Remove helper-only fields
  delete data.name;
  const res = await api('POST', '/travellers', data);
  return res.data ?? res;
}

export async function seedVehicle(overrides: Record<string, any> = {}) {
  const data = {
    registrationNumber: `E2E-${Date.now().toString(36).toUpperCase()}`,
    type: 'sedan',
    make: 'Toyota',
    model: 'Camry',
    seatingCapacity: 4,
    ...overrides,
  };
  const res = await api('POST', '/fleet/vehicles', data);
  return res.data ?? res;
}

export async function seedDriver(overrides: Record<string, any> = {}) {
  const data = {
    name: `E2E Driver ${Date.now()}`,
    phone: `+919${Math.floor(100000000 + Math.random() * 900000000)}`,
    licenseNumber: `DL-${Date.now()}`,
    ...overrides,
  };
  const res = await api('POST', '/fleet/drivers', data);
  return res.data ?? res;
}

export async function seedStickyNote(overrides: Record<string, any> = {}) {
  const data = {
    content: `E2E Note ${Date.now()}`,
    color: 'yellow',
    ...overrides,
  };
  const res = await api('POST', '/sticky-notes', data);
  return res.data ?? res;
}

export async function seedBookmark(entityType: string, entityId: string) {
  const res = await api('POST', '/bookmarks', { entityType, entityId });
  return res.data ?? res;
}

export async function seedRateCard(overrides: Record<string, any> = {}) {
  const data = {
    name: `E2E Rate Card ${Date.now()}`,
    serviceType: 'hotel',
    destination: 'Bali',
    season: 'peak',
    costPrice: 5000,
    sellingPrice: 7500,
    currency: 'INR',
    unit: 'per_person',
    validFrom: localDay(new Date()),
    validTo: localDay(new Date(Date.now() + 86400000 * 365)),
    isActive: 1,
    ...overrides,
  };
  const res = await api('POST', '/rate-cards', data);
  return res.data ?? res;
}

export async function seedItineraryTemplate(overrides: Record<string, any> = {}) {
  const data = {
    title: `E2E Template ${Date.now()}`,
    destination: 'Bali',
    durationDays: 3,
    category: 'beach',
    templateData: JSON.stringify({
      days: [
        {
          dayNumber: 1,
          title: 'Arrival Day',
          items: [
            { type: 'hotel', title: 'Beach Resort', costPrice: 5000, sellingPrice: 7000, quantity: 1, sortOrder: 0 },
          ],
        },
        {
          dayNumber: 2,
          title: 'Sightseeing',
          items: [
            { type: 'activity', title: 'Temple Tour', costPrice: 2000, sellingPrice: 3500, quantity: 1, sortOrder: 0 },
          ],
        },
        {
          dayNumber: 3,
          title: 'Departure',
          items: [
            { type: 'transport', title: 'Airport Transfer', costPrice: 1000, sellingPrice: 1500, quantity: 1, sortOrder: 0 },
          ],
        },
      ],
      inclusions: ['Breakfast', 'Airport transfers'],
      exclusions: ['Visa fees', 'Personal expenses'],
      termsConditions: 'Standard terms apply.',
    }),
    ...overrides,
  };
  const res = await api('POST', '/itinerary-templates', data);
  return res.data ?? res;
}

export async function seedPayment(invoiceId: string, overrides: Record<string, any> = {}) {
  const data = {
    invoiceId,
    amount: 5000,
    date: localDay(new Date()),
    method: 'transfer',
    reference: `TEST-PAY-${Date.now()}`,
    ...overrides,
  };
  const res = await api('POST', '/payments', data);
  return res.data ?? res;
}

export async function seedCreditNote(invoiceId: string, overrides: Record<string, any> = {}) {
  const data = {
    invoiceId,
    reason: 'Test credit note',
    items: [{ description: 'Test refund', quantity: 1, rate: 1000 }],
    ...overrides,
  };
  const res = await api('POST', '/credit-notes', data);
  return res.data ?? res;
}

export async function seedCampaign(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const data: Record<string, any> = {
    name: `E2E Campaign ${ts}`,
    type: 'email',
    status: 'draft',
    subject: `Campaign Subject ${ts}`,
    body: `Hello {customer_name}, check out our latest offer!`, // backend uses `body` not `content`
    segmentFilters: {}, // Must be object, NOT JSON string
    ...overrides,
  };
  const res = await api('POST', '/campaigns', data);
  return res.data ?? res;
}

/**
 * Reset the E2E test tenant to a known state via the TEST_MODE-gated
 * POST /test/reset endpoint. Every other slice depends on this for
 * deterministic seeding between spec files.
 */
export async function resetTestData(): Promise<void> {
  const res = await api('POST', '/test/reset');
  if (res?.success === false) {
    throw new Error(`Test data reset failed: ${JSON.stringify(res)}`);
  }
}

export async function seedEmailTemplate(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const data = {
    name: `E2E-ETpl-${ts}`,
    channel: 'email',
    subject: `Test Subject ${ts}`,
    content: `Hello {customer_name}, your trip to {destination} is confirmed.`,
    category: 'booking',
    language: 'en',
    ...overrides,
  };
  const res = await api('POST', '/templates', data);
  return res.data ?? res;
}

