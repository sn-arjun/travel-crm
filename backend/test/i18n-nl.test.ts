import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { renderTemplate, type TemplateName } from '../src/services/mail/templates';
import { signUnsubscribeToken } from '../src/utils/unsubscribe-token';
import { t, pickLanguage, isUiLanguage, textLanguage } from '../src/i18n';
import { seedTenant } from '../src/services/tenancy/seed-tenant';
import { en } from '../src/i18n/en';
import { nl } from '../src/i18n/nl';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
// No SendGrid key: system email lands in the local outbox.
const outboxEnv = { ...testEnv, SENDGRID_API_KEY: '' };

interface Json {
  status: number;
  body: any;
}

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Json> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    outboxEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // an HTML or PDF response: keep the text
  }
  return { status: res.status, body: parsed };
}

const api = (method: string, path: string, token: string | null, body?: unknown) => call(method, `/api/v1${path}`, token, body);

async function outboxFor(to: string): Promise<any[]> {
  return (await api('GET', `/test/outbox?to=${encodeURIComponent(to)}`, null)).body.data;
}

/** All text a PDF draws: inflate every stream and read the hex or literal strings of its Tj operators. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const raw = new TextDecoder('latin1').decode(bytes);
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const data = Uint8Array.from(m[1], (ch) => ch.charCodeAt(0));
    let text: string;
    try {
      const inflated = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')));
      text = new TextDecoder('latin1').decode(await inflated.arrayBuffer());
    } catch {
      continue;
    }
    for (const tj of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      if (tj[1]) out.push(tj[1].match(/../g)!.map((h) => String.fromCharCode(parseInt(h, 16))).join(''));
      else if (tj[2] !== undefined) out.push(tj[2]);
    }
  }
  return out.join('\n');
}

describe('Dutch backend texts (R136)', () => {
  let admin = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await api('POST', '/test/reset', null)).status).toBe(200);
    const login = await api('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = login.body.data.accessToken;
    await api('DELETE', '/test/outbox', null);
  });

  afterAll(async () => {
    // leave the shared agency the way it was found
    await api('PUT', '/settings/company', admin, { default_language: 'en' });
  });

  describe('the catalogue', () => {
    it('Dutch has every English key with the same {placeholders}', () => {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      expect(Object.keys(nl).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(names(nl[key]), key).toBe(names(en[key]));
        expect(nl[key].trim().length, key).toBeGreaterThan(0);
      }
    });

    it('t() fills placeholders, picks plural forms and falls back to English for other languages', () => {
      expect(t('nl', 'mail.invite.subject', { agency: 'Reisbureau Zon' })).toBe('U bent uitgenodigd voor Reisbureau Zon');
      expect(t('en', 'mail.invite.subject', { agency: 'Sun Travel' })).toBe('You have been invited to Sun Travel');
      expect(t('hi', 'mail.invite.subject', { agency: 'X' })).toBe('You have been invited to X');
      expect(t('ar', 'voucher.section.notes')).toBe('Notes');
      expect(t('nl', 'mail.trial.subject', { count: 1 })).toBe('Uw TravelCRM Pro-proefperiode eindigt over 1 dag');
      expect(t('nl', 'mail.trial.subject', { count: 3 })).toBe('Uw TravelCRM Pro-proefperiode eindigt over 3 dagen');
      expect(t('nl', 'no.such.key')).toBe('no.such.key');
    });

    it('picks the recipient language when it is en or nl, else the agency default, else English', () => {
      expect(pickLanguage('nl', 'en')).toBe('nl');
      expect(pickLanguage('en', 'nl')).toBe('en');
      expect(pickLanguage('hi', 'nl')).toBe('nl');
      expect(pickLanguage(null, 'nl')).toBe('nl');
      expect(pickLanguage('ar', 'hi')).toBe('en');
      expect(pickLanguage(undefined, undefined)).toBe('en');
      expect(isUiLanguage('nl')).toBe(true);
      expect(isUiLanguage('fr')).toBe(false);
      expect(textLanguage('hi')).toBe('en');
    });
  });

  describe('system emails', () => {
    const base = { appUrl: 'https://app.example.test' };
    const samples: Array<[TemplateName, Record<string, unknown>]> = [
      ['welcome_admin', { agencyName: 'Reisbureau Zon', adminName: 'Sanne', email: 'a@x.nl', temporaryPassword: 'Pw123', loginUrl: 'https://app.example.test' }],
      ['invite_user', { name: 'Daan', role: 'sales_manager', setupUrl: 'https://app.example.test/setup', agencyName: 'Reisbureau Zon', inviterName: 'Sanne' }],
      ['reset_password', { name: 'Daan', resetUrl: 'https://app.example.test/reset' }],
      ['password_changed', { name: 'Daan' }],
      ['two_factor_enabled', { name: 'Daan' }],
      ['two_factor_disabled', { name: 'Daan' }],
      ['payment_receipt', { agencyName: 'Reisbureau Zon', invoiceNumber: 'INV-1', amount: 'EUR 49,00', paidUntil: '2026-11-21' }],
      ['payment_failed', { agencyName: 'Reisbureau Zon', graceDays: 7, graceEnds: '2026-11-01' }],
      ['trial_ending', { agencyName: 'Reisbureau Zon', daysLeft: 3, endsOn: '2026-11-01' }],
      ['number_release_notice', { agencyName: 'Reisbureau Zon', numbers: ['+31201234567'], releaseOn: '2026-11-01', reason: 'unpaid' }],
      ['website_ready', { agencyName: 'Reisbureau Zon', siteUrl: 'https://zon.example.test', adminUrl: 'https://zon.example.test/wp-admin' }],
      ['usage_alert', { label: 'e-mails', threshold: 80, used: 80, allowance: 100 }],
    ];

    it.each(samples)('%s renders in Dutch with no leftover placeholder and in English by default', (template, data) => {
      const dutch = renderTemplate(template, { ...base, ...data }, 'nl');
      const english = renderTemplate(template, { ...base, ...data });
      for (const mail of [dutch, english]) {
        expect(mail.subject).not.toMatch(/\{\w+\}/);
        expect(mail.html).not.toMatch(/\{\w+\}/);
        expect(mail.text).not.toMatch(/\{\w+\}/);
      }
      expect(dutch.html).toContain('<html lang="nl">');
      expect(english.html).toContain('<html lang="en">');
      expect(dutch.subject).not.toBe(english.subject);
      expect(dutch.text).not.toBe(english.text);
      // unknown languages read English, byte for byte
      expect(renderTemplate(template, { ...base, ...data }, 'hi')).toEqual(english);
    });

    it('keeps the English invitation exactly as it was', () => {
      const mail = renderTemplate('invite_user', { ...base, name: 'Asha', role: 'sales_manager', setupUrl: 'https://u.test/s', agencyName: 'Sun Travel', inviterName: 'Ravi' });
      expect(mail.subject).toBe('You have been invited to Sun Travel');
      expect(mail.html).toContain('<p>Hello Asha,</p>');
      expect(mail.html).toContain('Ravi invited you to join <strong>Sun Travel</strong> on TravelCRM Pro as sales manager.');
      expect(mail.text).toBe('Ravi invited you to join Sun Travel on TravelCRM Pro as sales manager.\n\nSet up your account (valid for 7 days):\nhttps://u.test/s\n');
    });

    it('escapes values in Dutch mail too', () => {
      const mail = renderTemplate('invite_user', { ...base, name: '<b>x</b>', setupUrl: 'https://u.test/s', agencyName: 'A&B', inviterName: 'Sanne' }, 'nl');
      expect(mail.html).toContain('Hallo &lt;b&gt;x&lt;/b&gt;,');
      expect(mail.html).toContain('<strong>A&amp;B</strong>');
    });

    it('an invitation for a user with language nl is Dutch; the default is English', async () => {
      const dutch = await api('POST', '/users', admin, { email: 'invitee-nl-r136@e2e.test', name: 'Daan', role: 'salesperson', language: 'nl' });
      expect(dutch.status).toBe(201);
      const english = await api('POST', '/users', admin, { email: 'invitee-en-r136@e2e.test', name: 'Dan', role: 'salesperson' });
      expect(english.status).toBe(201);

      const nlMail = (await outboxFor('invitee-nl-r136@e2e.test'))[0];
      expect(nlMail.template).toBe('invite_user');
      expect(nlMail.subject).toContain('U bent uitgenodigd voor');
      expect(nlMail.html).toContain('<html lang="nl">');
      expect(nlMail.html).toContain('Hallo Daan,');
      expect(nlMail.text).toContain('Stel uw account in (7 dagen geldig)');
      expect(nlMail.text).toContain(`${testEnv.APP_URL}/setup-account?token=`);

      const enMail = (await outboxFor('invitee-en-r136@e2e.test'))[0];
      expect(enMail.subject).toContain('You have been invited to');
      expect(enMail.html).toContain('<html lang="en">');
    });

    it('a password reset for a user with language nl is Dutch', async () => {
      expect((await api('POST', '/auth/forgot-password', null, { email: 'invitee-nl-r136@e2e.test' })).status).toBe(200);
      const reset = (await outboxFor('invitee-nl-r136@e2e.test')).find((m) => m.template === 'reset_password');
      expect(reset.subject).toBe('Stel uw TravelCRM Pro-wachtwoord opnieuw in');
      expect(reset.html).toContain('<html lang="nl">');
      expect(reset.html).toContain(`${testEnv.APP_URL}/reset-password?token=`);
      expect(reset.text).toContain('Deze link verloopt over 1 uur');
    });

    it('a user without en or nl gets the agency default language', async () => {
      expect((await api('PUT', '/settings/company', admin, { default_language: 'nl' })).status).toBe(200);
      const created = await api('POST', '/users', admin, { email: 'invitee-hi-r136@e2e.test', name: 'Hari', role: 'salesperson', language: 'hi' });
      expect(created.status).toBe(201);
      const mail = (await outboxFor('invitee-hi-r136@e2e.test'))[0];
      expect(mail.subject).toContain('U bent uitgenodigd voor');

      // an invitee with no language of their own takes the agency default as their own language
      const plain = await api('POST', '/users', admin, { email: 'invitee-plain-r136@e2e.test', name: 'Pim', role: 'salesperson' });
      expect(plain.status).toBe(201);
      expect((await outboxFor('invitee-plain-r136@e2e.test'))[0].html).toContain('<html lang="nl">');
      await api('PUT', '/settings/company', admin, { default_language: 'en' });
    });
  });

  describe('a new agency starts in its language', () => {
    async function seeded(country: string) {
      const statements: Array<{ sql: string; params: unknown[] }> = [];
      const provisioner = { execute: async (_target: unknown, list: Array<{ sql: string; params: unknown[] }>) => void statements.push(...list) };
      await seedTenant(provisioner as any, {} as any, { adminEmail: 'a@x.test', adminName: 'A', company: 'C', country, currency: 'EUR', timezone: 'Europe/Amsterdam', taxSystem: 'vat' });
      const settings = Object.fromEntries(statements.filter((s) => /INTO settings/.test(s.sql)).map((s) => [s.params[0], s.params[1]]));
      const user = statements.find((s) => /INSERT INTO users/.test(s.sql))!;
      return { settings, adminLanguage: user.params[4] };
    }

    it('a Netherlands agency gets default_language nl, locale nl-NL and a Dutch admin', async () => {
      const r = await seeded('Netherlands');
      expect(r.settings).toMatchObject({ default_language: 'nl', locale: 'nl-NL', phone_default_country: 'NL' });
      expect(r.adminLanguage).toBe('nl');
    });

    it('other agencies stay English and write no default_language', async () => {
      const r = await seeded('Belgium');
      expect(r.settings).not.toHaveProperty('default_language');
      expect(r.settings).toMatchObject({ locale: 'en-BE' });
      expect(r.adminLanguage).toBe('en');
    });
  });

  describe('validation lists accept nl', () => {
    it('users.language and default_language accept nl and reject an unknown language', async () => {
      expect((await api('PUT', '/users/me', admin, { language: 'nl' })).status).toBe(200);
      expect(((await api('GET', '/users/me', admin)).body.data as any).language).toBe('nl');
      expect((await api('PUT', '/users/me', admin, { language: 'en' })).status).toBe(200);
      expect((await api('PUT', '/users/me', admin, { language: 'klingon' })).status).toBe(400);

      expect((await api('PUT', '/settings/company', admin, { default_language: 'nl' })).status).toBe(200);
      expect((await api('PUT', '/settings/company', admin, { default_language: 'klingon' })).status).toBe(400);
      await api('PUT', '/settings/company', admin, { default_language: 'en' });
    });
  });

  describe('voucher PDF', () => {
    async function voucherPdf(language: string | undefined): Promise<string> {
      const contact = await api('POST', '/contacts', admin, { name: `Reiziger ${language ?? 'x'}`, type: 'customer' });
      expect(contact.status, JSON.stringify(contact.body)).toBe(201);
      const lead = await api('POST', '/leads', admin, {
        contactId: contact.body.data.id,
        title: 'Voucher trip',
        destinations: ['Texel'],
        travelDate: '2027-01-15',
        tripType: 'domestic',
        source: 'website',
      });
      expect(lead.status, JSON.stringify(lead.body)).toBe(201);
      const voucher = await api('POST', '/vouchers', admin, {
        leadId: lead.body.data.id,
        type: 'hotel',
        title: 'Hotel Texel',
        ...(language ? { language } : {}),
        details: { guestNames: ['Sanne'], hotelName: 'Hotel Duinroos', checkIn: '2027-01-15', checkOut: '2027-01-17', roomType: 'Dubbel' },
      });
      expect(voucher.status, JSON.stringify(voucher.body)).toBe(201);
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(`http://localhost/api/v1/vouchers/${voucher.body.data.id}/pdf`, { headers: { Authorization: `Bearer ${admin}` } }),
        outboxEnv,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(200);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
      return pdfText(bytes);
    }

    it('a voucher with language nl prints Dutch labels', async () => {
      const text = await voucherPdf('nl');
      expect(text).toContain('Hotelvoucher');
      expect(text).toContain('BOEKINGSGEGEVENS');
      expect(text).toContain('GEGEVENS HOTEL');
      expect(text).toContain('Voucher-id:');
      expect(text).toContain('Inchecken:');
      expect(text).toContain('Kamertype:');
      expect(text).toContain('Hotel Duinroos');
      expect(text).toContain('CONCEPT');
      expect(text).not.toContain('BOOKING INFORMATION');
      expect(text).toMatch(/Pagina 1 van 1/);
    });

    it('a voucher in English or Hindi keeps the English labels', async () => {
      for (const language of [undefined, 'hi']) {
        const text = await voucherPdf(language);
        expect(text).toContain('Hotel Voucher');
        expect(text).toContain('BOOKING INFORMATION');
        expect(text).toContain('Check-In:');
        expect(text).toContain('DRAFT');
        expect(text).toMatch(/Page 1 of 1/);
      }
    });

    it('the voucher API rejects an unknown language (nl is accepted: see above)', async () => {
      const contact = await api('POST', '/contacts', admin, { name: 'Reiziger validatie', type: 'customer' });
      const lead = await api('POST', '/leads', admin, { contactId: contact.body.data.id, title: 'Voucher validation trip', destinations: ['Texel'], travelDate: '2027-01-15', tripType: 'domestic', source: 'website' });
      const bad = await api('POST', '/vouchers', admin, {
        leadId: lead.body.data.id,
        type: 'hotel',
        title: 'Hotel',
        language: 'klingon',
        details: { guestNames: ['Sanne'], hotelName: 'H', checkIn: '2027-01-15', checkOut: '2027-01-17', roomType: 'D' },
      });
      expect(bad.status).toBe(400);
    });
  });

  describe('public pages', () => {
    it('the unsubscribe page is Dutch for an agency whose default_language is nl, English otherwise', async () => {
      const token = await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId: 'no-such-contact', channel: 'email' });

      const english = await call('GET', `/api/v1/public/unsubscribe/${token}`, null);
      expect(english.status).toBe(200);
      expect(english.body).toContain('You are unsubscribed');
      expect(english.body).toContain('<html lang="en">');

      expect((await api('PUT', '/settings/company', admin, { default_language: 'nl' })).status).toBe(200);
      const dutch = await call('GET', `/api/v1/public/unsubscribe/${token}`, null);
      expect(dutch.status).toBe(200);
      expect(dutch.body).toContain('U bent afgemeld');
      expect(dutch.body).toContain('<html lang="nl">');
      await api('PUT', '/settings/company', admin, { default_language: 'en' });
    });

    it('a link with a bad signature names no agency: English page, 400', async () => {
      const res = await call('GET', '/api/v1/public/unsubscribe/not-a-token', null);
      expect(res.status).toBe(400);
      expect(res.body).toContain('Link not valid');
    });

    it('a revoked quotation link answers in the agency language', async () => {
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO quotation_links (token, tenant_id, itinerary_id, is_active) VALUES ('r136-revoked', ?, 'it-r136', 0)`)
        .bind(TENANT_ID)
        .run();
      const english = await call('GET', '/api/v1/public/quotation/r136-revoked', null);
      expect(english.status).toBe(410);
      expect(english.body.error).toBe('This quotation link has been revoked');

      await api('PUT', '/settings/company', admin, { default_language: 'nl' });
      const dutch = await call('GET', '/api/v1/public/quotation/r136-revoked', null);
      expect(dutch.status).toBe(410);
      expect(dutch.body.error).toBe('Deze offertelink is ingetrokken');
      await api('PUT', '/settings/company', admin, { default_language: 'en' });
    });
  });
});
