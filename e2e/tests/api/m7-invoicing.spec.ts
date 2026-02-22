import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  createTestContact,
  createTestLead,
  TEST_ADMIN,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M7: Invoicing & Tax Management', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Invoice CRUD Operations', () => {
    let contactId: string;
    let invoiceId: string;

    test('should create contact and invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
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

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response).toHaveProperty('id');
      expect(response.contactId).toBe(contactId);
      expect(response.invoiceNumber).toBeDefined();
      expect(response.type).toBe('tax_invoice');
      expect(response.status).toBe('draft');

      invoiceId = response.id;
    });

    test('should retrieve invoice by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.INVOICES}/${invoiceId}`);

      expect(response.id).toBe(invoiceId);
      expect(response.contactId).toBe(contactId);
      expect(Array.isArray(response.items)).toBe(true);
      expect(response.items.length).toBeGreaterThan(0);
    });

    test('should list all invoices', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.INVOICES);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const invoice = response.find((inv: any) => inv.id === invoiceId);
      expect(invoice).toBeDefined();
    });

    test('should update invoice notes', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        notes: 'Updated invoice notes with additional details',
      };

      const response = await client.put(`${API_ENDPOINTS.INVOICES}/${invoiceId}`, updateData);

      expect(response.notes).toBe(updateData.notes);
    });

    test('should update invoice items', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        items: [
          {
            description: 'Updated Flight Booking',
            quantity: 2,
            rate: 55000,
            taxRate: 5,
          },
        ],
      };

      const response = await client.put(`${API_ENDPOINTS.INVOICES}/${invoiceId}`, updateData);

      expect(response).toHaveProperty('total');
      expect(response.total).toBeGreaterThan(0);
    });

    test('should delete draft invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        items: [
          {
            description: 'Service',
            quantity: 1,
            rate: 10000,
            taxRate: 0,
          },
        ],
      };
      const createResponse = await client.post(API_ENDPOINTS.INVOICES, invoiceData);
      const tempInvoiceId = createResponse.id;

      const deleteResponse = await client.delete(`${API_ENDPOINTS.INVOICES}/${tempInvoiceId}`);
      expect(deleteResponse).toBeDefined();

      // After deletion, invoice may return 404 or 200 with cancelled status (soft delete)
      const getResponse = await client.raw('GET', `${API_ENDPOINTS.INVOICES}/${tempInvoiceId}`);
      if (getResponse.status() === 200) {
        const body = await getResponse.json();
        const data = body?.data || body;
        expect(data.status).toBe('cancelled');
      } else {
        expect(getResponse.status()).toBe(404);
      }
    });
  });

  test.describe.serial('Invoice Tax Calculations', () => {
    let contactId: string;

    test('should create contact for tax tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;
    });

    test('should calculate total amount with tax correctly', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Travel Service',
            quantity: 1,
            rate: 100000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('total');
      // With 18% tax: 100000 + (100000 * 0.18) = 118000
      expect(response.total).toBe(118000);
    });

    test('should handle multiple items with different tax rates', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Flight',
            quantity: 2,
            rate: 50000,
            taxRate: 5,
          },
          {
            description: 'Hotel',
            quantity: 4,
            rate: 15000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response).toHaveProperty('total');
      // Flight: 50000 * 2 * 1.05 = 105000
      // Hotel: 15000 * 4 * 1.18 = 70800
      // Total: 175800
      expect(response.total).toBe(175800);
    });

    test('should handle zero tax rate', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Exempt Service',
            quantity: 1,
            rate: 50000,
            taxRate: 0,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response.total).toBe(50000);
    });

    test('should calculate proforma invoice correctly', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'proforma',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Tour Package',
            quantity: 1,
            rate: 200000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response.type).toBe('proforma');
      expect(response).toHaveProperty('total');
    });

    test('should calculate receipt correctly', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'receipt',
        dueDate: new Date().toISOString().split('T')[0],
        items: [
          {
            description: 'Payment Received',
            quantity: 1,
            rate: 100000,
            taxRate: 0,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response.type).toBe('receipt');
      expect(response.status).toBe('draft');
    });
  });

  test.describe.serial('Invoice Status Management', () => {
    let contactId: string;
    let statusInvoiceId: string;

    test('should create contact and invoice in draft status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        items: [
          {
            description: 'Service',
            quantity: 1,
            rate: 10000,
            taxRate: 0,
          },
        ],
      };
      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);

      expect(response.status).toBe('draft');
      statusInvoiceId = response.id;
    });

    test('should update invoice with notes', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = { notes: 'Updated notes' };
      const response = await client.put(`${API_ENDPOINTS.INVOICES}/${statusInvoiceId}`, updateData);

      expect(response.notes).toBe('Updated notes');
    });

    test('should retrieve invoice with current status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.INVOICES}/${statusInvoiceId}`);

      expect(['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled']).toContain(
        response.status
      );
    });
  });

  test.describe.serial('Payment Recording', () => {
    let contactId: string;
    let paymentInvoiceId: string;
    let paymentId: string;

    test('should create contact and invoice for payment testing', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Tour Service',
            quantity: 1,
            rate: 100000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);
      paymentInvoiceId = response.id;
    });

    test('should record partial payment against invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const paymentData = {
        invoiceId: paymentInvoiceId,
        amount: 50000,
        method: 'bank_transfer',
        date: new Date().toISOString().split('T')[0],
        reference: `PAY-${Math.random().toString(36).substring(7).toUpperCase()}`,
        notes: 'Partial payment for tour',
      };

      const response = await client.post(API_ENDPOINTS.PAYMENTS, paymentData);

      expect(response).toHaveProperty('id');
      expect(response.invoiceId).toBe(paymentInvoiceId);
      expect(response.amount).toBe(50000);
      paymentId = response.id;
    });

    test('should update invoice status to partially_paid', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.INVOICES}/${paymentInvoiceId}`);

      expect(response.status).toBe('partially_paid');
    });

    test('should record payment with different methods', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const methods = ['cash', 'bank_transfer', 'upi'];

      for (const method of methods) {
        const paymentData = {
          invoiceId: paymentInvoiceId,
          amount: 5000,
          method,
          date: new Date().toISOString().split('T')[0],
          reference: `PAY-${method.toUpperCase()}-${Math.random().toString(36).substring(7)}`,
        };

        const response = await client.post(API_ENDPOINTS.PAYMENTS, paymentData);

        expect(response).toHaveProperty('id');
        expect(response.method).toBe(method);
      }
    });

    test('should list all payments for invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.PAYMENTS}?invoiceId=${paymentInvoiceId}`);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const payment = response.find((p: any) => p.id === paymentId);
      expect(payment).toBeDefined();
    });

    test('should retrieve payment by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.PAYMENTS}/${paymentId}`);

      expect(response.id).toBe(paymentId);
      expect(response.invoiceId).toBe(paymentInvoiceId);
    });
  });

  test.describe.serial('Credit Notes', () => {
    let contactId: string;
    let creditInvoiceId: string;
    let creditNoteId: string;

    test('should create contact and invoice for credit note testing', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Tour Service',
            quantity: 1,
            rate: 100000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);
      creditInvoiceId = response.id;
    });

    test('should create credit note for invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const creditData = {
        invoiceId: creditInvoiceId,
        reason: 'Service discount applied',
        notes: 'Customer discount for bulk booking',
        items: [
          {
            description: 'Discount applied',
            quantity: 1,
            rate: 10000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.CREDIT_NOTES, creditData);

      expect(response).toHaveProperty('id');
      expect(response.type).toBe('credit_note');
      creditNoteId = response.id;
    });

    test('should list all credit notes', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.CREDIT_NOTES);

      expect(Array.isArray(response)).toBe(true);

      const creditNote = response.find((cn: any) => cn.id === creditNoteId);
      expect(creditNote).toBeDefined();
    });

    test('should apply credit note to invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const applyData = {
        amount: 5000,
      };

      const response = await client.post(
        `${API_ENDPOINTS.CREDIT_NOTES}/${creditNoteId}/apply`,
        applyData
      );

      expect(response).toHaveProperty('appliedAmount');
    });
  });

  test.describe.serial('Invoice Duplicate & Void Operations', () => {
    let contactId: string;
    let duplicateSourceInvoiceId: string;

    test('should create contact and invoice for duplication testing', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Service',
            quantity: 1,
            rate: 50000,
            taxRate: 18,
          },
        ],
      };

      const response = await client.post(API_ENDPOINTS.INVOICES, invoiceData);
      duplicateSourceInvoiceId = response.id;
    });

    test('should duplicate invoice with auto-generated invoice number', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post(
        `${API_ENDPOINTS.INVOICES}/${duplicateSourceInvoiceId}/duplicate`,
        {}
      );

      expect(response).toHaveProperty('id');
      expect(response.id).not.toBe(duplicateSourceInvoiceId);
      expect(response.invoiceNumber).toBeDefined();
      expect(response.status).toBe('draft');
    });

    test('should void invoice', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post(
        `${API_ENDPOINTS.INVOICES}/${duplicateSourceInvoiceId}/void`,
        {}
      );

      expect(response.status).toBe('cancelled');
    });
  });

  test.describe.serial('Invoice Validation', () => {
    let contactId: string;

    test('should create contact for validation tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;
    });

    test('should validate required fields on invoice creation', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        // Missing contactId, items
      };

      const response = await client.raw('POST', API_ENDPOINTS.INVOICES, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate payment amount does not exceed invoice balance', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invoiceData = {
        contactId,
        type: 'tax_invoice',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            description: 'Service',
            quantity: 1,
            rate: 10000,
            taxRate: 0,
          },
        ],
      };

      const invoiceResponse = await client.post(API_ENDPOINTS.INVOICES, invoiceData);
      const testInvoiceId = invoiceResponse.id;
      const invoiceTotal = invoiceResponse.total;

      const paymentData = {
        invoiceId: testInvoiceId,
        amount: invoiceTotal + 1000,
        method: 'bank_transfer',
        date: new Date().toISOString().split('T')[0],
        reference: 'OVERPAY',
      };

      const paymentResponse = await client.raw('POST', API_ENDPOINTS.PAYMENTS, {
        data: paymentData,
      });

      // Should reject overpayment
      expect([400, 409]).toContain(paymentResponse.status());
    });
  });
});
