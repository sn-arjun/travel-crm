import { expect } from '@playwright/test';
import { API_URL } from './auth';
import { type Agency, completeFirstLogin, createAgency, createSuperAdminToken } from './tenants';

/**
 * A euro agency (Germany) provisioned through the admin API, with its display settings saved, plus a small
 * authenticated API caller. Needs the multi-tenant stack (`fix-stack up --slot N --reset-db --multi`).
 */
export async function createEuroAgency(tag: string): Promise<{ agency: Agency; call: (method: string, path: string, payload?: unknown) => Promise<any> }> {
  const sa = await createSuperAdminToken(API_URL);
  const created = await createAgency(API_URL, sa, {
    plan: 'pro',
    slug: `eur-${tag}-${Date.now().toString(36)}`,
    companyName: `Euro Travel ${tag}`,
    country: 'Germany',
    currency: 'EUR',
    timezone: 'Europe/Berlin',
    taxSystem: 'vat',
    region: 'eu',
  });
  const agency = await completeFirstLogin(API_URL, created);
  const call = async (method: string, path: string, payload?: unknown) => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agency.accessToken}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await res.text();
    expect(res.status, `${method} ${path}: ${text.slice(0, 300)}`).toBeLessThan(300);
    return JSON.parse(text);
  };
  await call('PUT', '/settings/company', {
    company_name: agency.companyName,
    currency: 'EUR',
    locale: 'en-IE',
    timezone: 'Europe/Berlin',
    country: 'DE',
    phone_default_country: 'DE',
    tax_system: 'vat',
  });
  return { agency, call };
}

/** A contact and a lead with no currency given: the lead must come out in the agency currency. */
export async function seedEuroLead(call: (method: string, path: string, payload?: unknown) => Promise<any>): Promise<{ contactId: string; leadId: string; leadCurrency: string }> {
  const contact = await call('POST', '/contacts', { name: `Euro Client ${Date.now()}`, type: 'customer', phone: '+4915112345678' });
  const lead = await call('POST', '/leads', {
    contactId: contact.data.id, title: `Euro Lead ${Date.now()}`, destinations: ['Lisbon'], travelDate: '2027-03-01', tripType: 'international', source: 'manual',
  });
  return { contactId: contact.data.id, leadId: lead.data.id, leadCurrency: lead.data.currency };
}
