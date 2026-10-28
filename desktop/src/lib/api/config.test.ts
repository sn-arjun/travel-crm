import { describe, it, expect, afterEach, vi } from 'vitest';
import { API_ENDPOINTS, getApiBaseUrl } from './config';

describe('API_ENDPOINTS', () => {
  describe('Auth endpoints', () => {
    it('should define all auth endpoints', () => {
      expect(API_ENDPOINTS.auth.login).toBe('/auth/login');
      expect(API_ENDPOINTS.auth.logout).toBe('/auth/logout');
      expect(API_ENDPOINTS.auth.refreshToken).toBe('/auth/refresh-token');
      expect(API_ENDPOINTS.auth.forgotPassword).toBe('/auth/forgot-password');
      expect(API_ENDPOINTS.auth.resetPassword).toBe('/auth/reset-password');
      expect(API_ENDPOINTS.auth.sessions).toBe('/auth/sessions');
    });
  });

  describe('Contact endpoints', () => {
    it('should define CRUD endpoints', () => {
      expect(API_ENDPOINTS.contacts.list).toBe('/contacts');
      expect(API_ENDPOINTS.contacts.create).toBe('/contacts');
    });

    it('should generate dynamic endpoints', () => {
      expect(API_ENDPOINTS.contacts.byId('abc-123')).toBe('/contacts/abc-123');
      expect(API_ENDPOINTS.contacts.timeline('abc-123')).toBe('/contacts/abc-123/timeline');
      expect(API_ENDPOINTS.contacts.share('abc-123')).toBe('/contacts/abc-123/share');
    });
  });

  describe('Lead endpoints', () => {
    it('should define CRUD endpoints', () => {
      expect(API_ENDPOINTS.leads.list).toBe('/leads');
      expect(API_ENDPOINTS.leads.create).toBe('/leads');
    });

    it('should generate dynamic endpoints', () => {
      expect(API_ENDPOINTS.leads.byId('lead-1')).toBe('/leads/lead-1');
      expect(API_ENDPOINTS.leads.status('lead-1')).toBe('/leads/lead-1/status');
      expect(API_ENDPOINTS.leads.assign('lead-1')).toBe('/leads/lead-1/assign');
      expect(API_ENDPOINTS.leads.activities('lead-1')).toBe('/leads/lead-1/activities');
    });

    it('should define bulk action endpoints', () => {
      expect(API_ENDPOINTS.leads.bulkAssign).toBe('/leads/bulk-assign');
      expect(API_ENDPOINTS.leads.bulkStatus).toBe('/leads/bulk-status');
      expect(API_ENDPOINTS.leads.bulkDelete).toBe('/leads/bulk-delete');
    });
  });

  describe('Fleet endpoints', () => {
    it('should define vehicle CRUD', () => {
      expect(API_ENDPOINTS.fleet.vehicles.list).toBe('/fleet/vehicles');
      expect(API_ENDPOINTS.fleet.vehicles.create).toBe('/fleet/vehicles');
      expect(API_ENDPOINTS.fleet.vehicles.byId('v1')).toBe('/fleet/vehicles/v1');
    });

    it('should define driver CRUD', () => {
      expect(API_ENDPOINTS.fleet.drivers.list).toBe('/fleet/drivers');
      expect(API_ENDPOINTS.fleet.drivers.byId('d1')).toBe('/fleet/drivers/d1');
    });

    it('should define trip CRUD', () => {
      expect(API_ENDPOINTS.fleet.trips.list).toBe('/fleet/trips');
      expect(API_ENDPOINTS.fleet.trips.byId('t1')).toBe('/fleet/trips/t1');
    });
  });

  describe('Invoice endpoints', () => {
    it('should define CRUD and action endpoints', () => {
      expect(API_ENDPOINTS.invoices.list).toBe('/invoices');
      expect(API_ENDPOINTS.invoices.byId('inv-1')).toBe('/invoices/inv-1');
      expect(API_ENDPOINTS.invoices.void('inv-1')).toBe('/invoices/inv-1/void');
      expect(API_ENDPOINTS.invoices.duplicate('inv-1')).toBe('/invoices/inv-1/duplicate');
    });
  });

  describe('Visa endpoints', () => {
    it('should define CRUD and checklist endpoints', () => {
      expect(API_ENDPOINTS.visa.list).toBe('/visa');
      expect(API_ENDPOINTS.visa.byId('v1')).toBe('/visa/v1');
      expect(API_ENDPOINTS.visa.checklist('v1', 'item-1')).toBe('/visa/v1/checklist/item-1');
    });
  });

  describe('AI endpoints', () => {
    it('should define AI assistant endpoints', () => {
      expect(API_ENDPOINTS.ai.conversations).toBe('/ai/conversations');
      expect(API_ENDPOINTS.ai.extractLead).toBe('/ai/extract-lead');
      expect(API_ENDPOINTS.ai.generateItinerary).toBe('/ai/generate-itinerary');
    });

    it('should define AI intelligence endpoints', () => {
      expect(API_ENDPOINTS.ai.intelligence.leadScore('lead-1')).toBe('/ai/intelligence/lead-score/lead-1');
      expect(API_ENDPOINTS.ai.intelligence.ocrPassport).toBe('/ai/intelligence/ocr/passport');
    });

    it('should define BI endpoints', () => {
      expect(API_ENDPOINTS.ai.bi.briefings).toBe('/ai/bi/briefings');
      expect(API_ENDPOINTS.ai.bi.healthScore).toBe('/ai/bi/health-score');
    });
  });

  describe('Bookmarks & Sticky Notes', () => {
    it('should define bookmark endpoints', () => {
      expect(API_ENDPOINTS.bookmarks.list).toBe('/bookmarks');
      expect(API_ENDPOINTS.bookmarks.check).toBe('/bookmarks/check');
      expect(API_ENDPOINTS.bookmarks.delete('b1')).toBe('/bookmarks/b1');
    });

    it('should define sticky note endpoints', () => {
      expect(API_ENDPOINTS.stickyNotes.list).toBe('/sticky-notes');
      expect(API_ENDPOINTS.stickyNotes.byId('n1')).toBe('/sticky-notes/n1');
    });
  });
});

describe('getApiBaseUrl', () => {
  afterEach(() => {
    delete window.travelcrmConfig;
    vi.unstubAllEnvs();
  });

  it('prefers the runtime config injected by Electron', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://env.example/api/v1');
    window.travelcrmConfig = { apiUrl: 'https://runtime.example/api/v1' };
    expect(getApiBaseUrl()).toBe('https://runtime.example/api/v1');
  });

  it('falls back to NEXT_PUBLIC_API_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://env.example/api/v1');
    expect(getApiBaseUrl()).toBe('https://env.example/api/v1');
  });

  it('falls back to the localhost default', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(getApiBaseUrl()).toBe('http://localhost:8787/api/v1');
  });
});
