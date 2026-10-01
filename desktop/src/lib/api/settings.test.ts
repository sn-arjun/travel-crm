import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetState = vi.fn();
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => mockGetState(),
    subscribe: vi.fn(),
  },
}));

vi.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:8787/api/v1',
  API_ENDPOINTS: {
    settings: {
      company: '/settings/company',
      logo: '/settings/logo',
      assignmentRules: '/settings/assignment-rules',
      routingRules: '/settings/routing-rules',
      followUpSequences: '/settings/follow-up-sequences',
      invoiceDefaults: '/settings/invoice-defaults',
      itineraryDefaults: '/settings/itinerary-defaults',
      numbering: '/settings/numbering',
    },
  },
}));

const { settingsApi } = await import('./settings');

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('Settings API Module', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined };
  };

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    mockGetState.mockReturnValue({
      accessToken: 'admin-token',
      refreshToken: null,
      logout: vi.fn(),
      setTokens: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('company settings', () => {
    it('maps the stored company_* keys onto camelCase fields', async () => {
      fetchMock.mockResolvedValue(ok({ company_name: 'Test Co', company_postal_code: '560001', gstin: '29ABCDE1234F1Z5', company_logo: '/files/logo.png' }));

      const result = await settingsApi.company.get();

      expect(lastCall().url).toContain('/settings/company');
      expect(lastCall().method).toBe('GET');
      expect('data' in result && result.data).toMatchObject({
        name: 'Test Co',
        postalCode: '560001',
        gstin: '29ABCDE1234F1Z5',
        logoUrl: '/files/logo.png',
        email: '',
      });
    });

    it('PUTs camelCase fields as the stored company_* keys', async () => {
      fetchMock.mockResolvedValue(ok({ message: 'Settings updated' }));

      await settingsApi.company.update({ name: 'Updated Co', postalCode: '110001', gstin: 'G1' });

      expect(lastCall().method).toBe('PUT');
      expect(lastCall().body).toEqual({ company_name: 'Updated Co', company_postal_code: '110001', gstin: 'G1' });
    });
  });

  describe('logo', () => {
    it('uploads the file under the "logo" form field the backend reads', async () => {
      fetchMock.mockResolvedValue(ok({ logoUrl: '/files/logos/t/logo.png' }));

      await settingsApi.logo.upload({ file: new File(['x'], 'logo.png', { type: 'image/png' }) });

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect((init.body as FormData).get('logo')).toBeInstanceOf(File);
      expect((init.body as FormData).has('file')).toBe(false);
    });
  });

  describe('assignment rules', () => {
    it('GETs and PUTs the mode + members document', async () => {
      fetchMock.mockResolvedValue(ok({ mode: 'round_robin', rules: [] }));
      await settingsApi.assignmentRules.get();
      expect(lastCall().url).toContain('/settings/assignment-rules');

      fetchMock.mockClear();
      fetchMock.mockResolvedValue(ok({ message: 'Assignment rules updated' }));
      await settingsApi.assignmentRules.update({ mode: 'manual', rules: [{ userId: 'u1', weight: 2 }] });
      expect(lastCall().method).toBe('PUT');
      expect(lastCall().body).toEqual({ mode: 'manual', rules: [{ userId: 'u1', weight: 2 }] });
    });
  });

  describe('routing rules', () => {
    it('PUTs the full source -> user list', async () => {
      fetchMock.mockResolvedValue(ok({ message: 'Routing rules updated' }));

      await settingsApi.routingRules.update([{ source: 'website', assignToUserId: 'u1' }]);

      expect(lastCall().url).toContain('/settings/routing-rules');
      expect(lastCall().method).toBe('PUT');
      expect(lastCall().body).toEqual([{ source: 'website', assignToUserId: 'u1' }]);
    });
  });

  describe('follow-up sequences', () => {
    it('lists sequences with boolean isActive and parsed steps', async () => {
      fetchMock.mockResolvedValue(ok([{ id: 's1', name: 'Welcome', triggerStatus: 'new', steps: [{ day: 1, type: 'call' }], isActive: 1 }]));

      const result = await settingsApi.followUpSequences.list();

      expect(lastCall().url).toContain('/settings/follow-up-sequences');
      expect('data' in result && result.data[0]).toMatchObject({ id: 's1', isActive: true, triggerStatus: 'new' });
    });

    it('creates a sequence with trigger status and day-based steps', async () => {
      fetchMock.mockResolvedValue(ok({ id: 'seq1' }, 201));

      await settingsApi.followUpSequences.create({
        name: 'Welcome Sequence',
        triggerStatus: 'new',
        steps: [
          { day: 0, type: 'email', notes: 'Welcome!' },
          { day: 3, type: 'call' },
        ],
      });

      expect(lastCall().method).toBe('POST');
      expect(lastCall().body.steps).toHaveLength(2);
      expect(lastCall().body.triggerStatus).toBe('new');
    });

    it('deletes a sequence', async () => {
      fetchMock.mockResolvedValue(ok({ message: 'Sequence deleted' }));

      await settingsApi.followUpSequences.delete('seq1');

      expect(lastCall().method).toBe('DELETE');
      expect(lastCall().url).toContain('/settings/follow-up-sequences/seq1');
    });
  });

  describe('invoice defaults', () => {
    it('maps the stored snake_case document with defaults', async () => {
      fetchMock.mockResolvedValue(ok({ bank_details: { bankName: 'SBI', ifsc: 'SBIN0001' }, default_due_days: 45, upi_id: 'a@upi' }));

      const result = await settingsApi.invoiceDefaults.get();

      expect('data' in result && result.data).toMatchObject({
        bankName: 'SBI',
        ifsc: 'SBIN0001',
        defaultDueDays: 45,
        upiId: 'a@upi',
        taxSystem: 'gst',
        defaultTaxRate: 18,
      });
    });

    it('PUTs bank details nested and numbers as numbers', async () => {
      fetchMock.mockResolvedValue(ok({ message: 'Invoice defaults updated' }));

      await settingsApi.invoiceDefaults.update({
        bankName: 'SBI', accountNumber: '1', ifsc: 'X', branch: 'B', accountHolderName: 'H', upiId: 'u@upi',
        gstin: 'G', companyState: 'Karnataka', taxSystem: 'vat', defaultTaxRate: 5, defaultDueDays: 15, defaultPaymentTerms: 'Net 15',
      });

      expect(lastCall().body).toMatchObject({
        bank_details: { bankName: 'SBI', accountNumber: '1', ifsc: 'X', branch: 'B', accountHolderName: 'H' },
        tax_system: 'vat',
        default_tax_rate: 5,
        default_due_days: 15,
        default_payment_terms: 'Net 15',
      });
    });
  });

  describe('numbering', () => {
    it('round-trips prefixes through snake_case keys', async () => {
      fetchMock.mockResolvedValue(ok({ invoice_prefix: 'BILL', fy_start_month: 1, reset_yearly: false }));
      const result = await settingsApi.numberingConfig.get();
      expect('data' in result && result.data).toMatchObject({ invoicePrefix: 'BILL', fyStartMonth: 1, resetYearly: false, receiptPrefix: 'RCP' });

      fetchMock.mockClear();
      fetchMock.mockResolvedValue(ok({}));
      await settingsApi.numberingConfig.update({
        invoicePrefix: 'BILL', proformaPrefix: 'P', receiptPrefix: 'R', creditNotePrefix: 'C', debitNotePrefix: 'D', voucherPrefix: 'V', fyStartMonth: 1, resetYearly: false,
      });
      expect(lastCall().body).toMatchObject({ invoice_prefix: 'BILL', fy_start_month: 1, reset_yearly: false });
    });
  });

  describe('itinerary defaults', () => {
    it('fills missing fields with backend defaults', async () => {
      fetchMock.mockResolvedValue(ok({ validityDays: 14, defaultInclusions: ['Meals'] }));

      const result = await settingsApi.itineraryDefaults.get();

      expect('data' in result && result.data).toMatchObject({ validityDays: 14, defaultInclusions: ['Meals'], defaultExclusions: [], childPricePercent: 50 });
    });
  });
});
