import { t, textLanguage, type MessageVars, type TextLanguage } from '../../i18n';

export type TemplateName =
  | 'welcome_admin'
  | 'invite_user'
  | 'reset_password'
  | 'password_changed'
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'platform_enquiry'
  | 'usage_alert'
  | 'payment_receipt'
  | 'payment_failed'
  | 'trial_ending'
  | 'number_release_notice'
  | 'website_ready'
  | 'voip_spend_alert'
  | 'console_test';

export interface TemplateData {
  appUrl: string;
  [key: string]: unknown;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(lang: TextLanguage, title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #222;">
  <div style="max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden;">
    <div style="background: #1565C0; padding: 20px 28px;"><h1 style="color: #ffffff; margin: 0; font-size: 20px;">TravelCRM Pro</h1></div>
    <div style="padding: 28px; font-size: 15px; line-height: 1.6;">${bodyHtml}</div>
  </div>
</body>
</html>`;
}

function button(lang: TextLanguage, url: string, label: string): string {
  return `<p style="margin: 24px 0;"><a href="${esc(url)}" style="display: inline-block; padding: 12px 28px; background: #1565C0; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${esc(label)}</a></p><p style="font-size: 13px; color: #555;">${t(lang, 'mail.buttonFallback')}<br>${esc(url)}</p>`;
}

function str(d: TemplateData, key: string, fallback = ''): string {
  const v = d[key];
  return v === undefined || v === null ? fallback : String(v);
}

/**
 * Render a system email. `language` is the recipient's language (see i18n/emailLanguage); anything but 'nl' reads English.
 * Platform-operator mail (enquiries, spend alerts, the console test) is always English.
 */
export function renderTemplate(template: TemplateName, data: TemplateData, language: string = 'en'): RenderedEmail {
  const lang = textLanguage(language);
  const T = (key: string, vars?: MessageVars) => t(lang, key, vars);
  /** An HTML fragment from the catalogue: every value is escaped, except those listed in `raw` (already safe HTML). */
  const H = (key: string, vars: Record<string, string | number> = {}, raw: Record<string, string> = {}) => {
    const safe: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(vars)) safe[k] = esc(v);
    return t(lang, key, { ...safe, ...raw });
  };
  const hello = (name: unknown) => (name ? T('mail.greetingName', { name: esc(name) }) : T('mail.greeting'));
  const btn = (url: string, label: string) => button(lang, url, label);
  const page = (title: string, body: string) => layout(lang, title, body);

  switch (template) {
    case 'console_test': {
      const subject = 'TravelCRM Pro test email';
      const html = layout('en', subject, `<p>This is a test email sent from the super admin console (Email page).</p><p>If you can read it, platform mail reaches you.</p>`);
      const text = ['This is a test email sent from the super admin console (Email page).', 'If you can read it, platform mail reaches you.', ''].join('\n');
      return { subject, html, text };
    }
    case 'welcome_admin': {
      const agency = str(data, 'agencyName', T('mail.welcome.agencyFallback'));
      const email = str(data, 'email');
      const password = str(data, 'temporaryPassword');
      const loginUrl = str(data, 'loginUrl', data.appUrl);
      const download = `${data.appUrl}/download`;
      const quickStart = `${data.appUrl}/quick-start`;
      const subject = T('mail.welcome.subject', { agency });
      const html = page(
        subject,
        `<p>${hello(data.adminName)}</p>
<p>${H('mail.welcome.ready.html', { agency })}</p>
<p>${H('mail.welcome.credentials.html', { email, password })}</p>
<p>${T('mail.welcome.changePassword')}</p>
${btn(loginUrl, T('mail.welcome.signIn'))}
<p>${H('mail.welcome.links.html', { download, quickStart })}</p>`
      );
      const text = T('mail.welcome.text', { agency, email, password, loginUrl, download, quickStart });
      return { subject, html, text };
    }
    case 'invite_user': {
      const url = str(data, 'setupUrl');
      const inviter = str(data, 'inviterName', T('mail.invite.inviterFallback'));
      const agency = str(data, 'agencyName', 'TravelCRM Pro');
      const role = str(data, 'role');
      const roleName = role ? (T(`mail.role.${role}`) !== `mail.role.${role}` ? T(`mail.role.${role}`) : role.replace(/_/g, ' ')) : '';
      const roleLabel = role ? T('mail.invite.asRole', { role: roleName }) : '';
      const subject = T('mail.invite.subject', { agency });
      const html = page(
        subject,
        `<p>${hello(data.name)}</p>
<p>${H('mail.invite.body.html', { inviter, agency, role: roleLabel })}</p>
<p>${T('mail.invite.setup')}</p>
${btn(url, T('mail.invite.button'))}`
      );
      const text = T('mail.invite.text', { inviter, agency, role: roleLabel, url });
      return { subject, html, text };
    }
    case 'reset_password': {
      const url = str(data, 'resetUrl');
      const subject = T('mail.reset.subject');
      const html = page(
        subject,
        `<p>${hello(data.name)}</p>
<p>${T('mail.reset.body')}</p>
${btn(url, T('mail.reset.button'))}
<p style="font-size: 13px; color: #555;">${T('mail.reset.ignore')}</p>`
      );
      const text = T('mail.reset.text', { url });
      return { subject, html, text };
    }
    case 'password_changed': {
      const subject = T('mail.passwordChanged.subject');
      const html = page(
        subject,
        `<p>${hello(data.name)}</p><p>${T('mail.passwordChanged.body')}</p>${btn(`${data.appUrl}/forgot-password`, T('mail.passwordChanged.button'))}`
      );
      const text = T('mail.passwordChanged.text', { url: `${data.appUrl}/forgot-password` });
      return { subject, html, text };
    }
    case 'two_factor_enabled': {
      const subject = T('mail.twoFactorOn.subject');
      const html = page(subject, `<p>${hello(data.name)}</p><p>${T('mail.twoFactorOn.body')}</p>`);
      const text = T('mail.twoFactorOn.text');
      return { subject, html, text };
    }
    case 'two_factor_disabled': {
      const subject = T('mail.twoFactorOff.subject');
      const html = page(
        subject,
        `<p>${hello(data.name)}</p><p>${T('mail.twoFactorOff.body')}</p>${btn(`${data.appUrl}/forgot-password`, T('mail.twoFactorOff.button'))}`
      );
      const text = T('mail.twoFactorOff.text', { url: `${data.appUrl}/forgot-password` });
      return { subject, html, text };
    }
    case 'platform_enquiry': {
      const subject = `New enquiry from ${str(data, 'name', 'a visitor')}`;
      const keys = ['name', 'email', 'phone', 'company', 'message'].filter((k) => data[k]);
      const rows = keys
        .map((k) => `<tr><td style="padding: 4px 12px 4px 0;"><strong>${esc(k)}</strong></td><td>${esc(data[k])}</td></tr>`)
        .join('');
      const html = layout('en', subject, `<p>A new enquiry arrived.</p><table>${rows}</table>`);
      const text = 'A new enquiry arrived.\n\n' + keys.map((k) => `${k}: ${data[k]}`).join('\n') + '\n';
      return { subject, html, text };
    }
    case 'payment_receipt': {
      const agency = str(data, 'agencyName', T('mail.welcome.agencyFallback'));
      const number = str(data, 'invoiceNumber');
      const amount = str(data, 'amount');
      const paidUntil = str(data, 'paidUntil');
      const url = str(data, 'billingUrl', `${data.appUrl}/settings/billing`);
      const subject = T('mail.receipt.subject', { number });
      const until = paidUntil ? T('mail.receipt.until', { date: esc(paidUntil) }) : '';
      const html = page(
        subject,
        `<p>${H('mail.receipt.body.html', { amount, agency, number }, { until })}</p>${btn(url, T('mail.receipt.button'))}`
      );
      const text = T('mail.receipt.text', {
        amount,
        agency,
        number,
        until: paidUntil ? T('mail.receipt.textPaidUntil', { date: paidUntil }) : '',
        url,
      });
      return { subject, html, text };
    }
    case 'payment_failed': {
      const agency = str(data, 'agencyName', T('mail.welcome.agencyFallback'));
      const days = str(data, 'graceDays', '7');
      const ends = str(data, 'graceEnds');
      const url = str(data, 'billingUrl', `${data.appUrl}/settings/billing`);
      const subject = T('mail.paymentFailed.subject');
      const html = page(
        subject,
        `<p>${H('mail.paymentFailed.body.html', { agency, days }, { until: ends ? T('mail.paymentFailed.until', { date: esc(ends) }) : '' })}</p>${btn(url, T('mail.paymentFailed.button'))}`
      );
      const text = T('mail.paymentFailed.text', { agency, days, until: ends ? T('mail.paymentFailed.until', { date: ends }) : '', url });
      return { subject, html, text };
    }
    case 'trial_ending': {
      const agency = str(data, 'agencyName', T('mail.welcome.agencyFallback'));
      const left = str(data, 'daysLeft', '3');
      const ends = str(data, 'endsOn');
      const url = str(data, 'billingUrl', `${data.appUrl}/settings/billing`);
      const count = Number(left);
      const subject = T('mail.trial.subject', { count: Number.isFinite(count) ? count : 3 });
      const html = page(
        subject,
        `<p>${H('mail.trial.body.html', { agency }, { ends: ends ? T('mail.trial.ends', { date: esc(ends) }) : '' })}</p>${btn(url, T('mail.trial.button'))}`
      );
      const text = T('mail.trial.text', { agency, ends: ends ? T('mail.trial.ends', { date: ends }) : '', url });
      return { subject, html, text };
    }
    case 'number_release_notice': {
      const agency = str(data, 'agencyName', T('mail.welcome.agencyFallback'));
      const numbers = Array.isArray(data.numbers) ? (data.numbers as unknown[]).map(String) : [];
      const releaseOn = str(data, 'releaseOn');
      const reason = str(data, 'reason', 'cancelled');
      const url = str(data, 'billingUrl', `${data.appUrl}/settings/billing`);
      const unpaid = reason === 'unpaid';
      const why = T(unpaid ? 'mail.numbers.whyUnpaid' : 'mail.numbers.whyCancelled');
      const keep = T(unpaid ? 'mail.numbers.keepUnpaid' : 'mail.numbers.keepCancelled');
      const subject = numbers.length === 1 ? T('mail.numbers.subjectOne', { number: numbers[0] }) : T('mail.numbers.subjectMany');
      const list = numbers.map((n) => `<li>${esc(n)}</li>`).join('');
      const html = page(
        subject,
        `<p>${H('mail.numbers.body.html', { agency, why, date: releaseOn })}</p><ul>${list}</ul><p>${H('mail.numbers.after.html', { keep })}</p>${btn(url, T('mail.numbers.button'))}`
      );
      const text = T('mail.numbers.text', { agency, why, date: releaseOn, numbers: numbers.join(', '), keep, url });
      return { subject, html, text };
    }
    case 'website_ready': {
      // R309: the site address only. The admin password is set by the person through WordPress's own reset email.
      const agency = str(data, 'agencyName', T('mail.welcome.agencyFallback'));
      const url = str(data, 'siteUrl');
      const adminUrl = str(data, 'adminUrl');
      const subject = T('mail.website.subject', { agency });
      const html = page(
        subject,
        `<p>${H('mail.website.live.html', { agency })}</p>${btn(url, T('mail.website.button'))}<p>${H('mail.website.edit.html', { adminUrl })}</p>`
      );
      const text = T('mail.website.text', { agency, url, adminUrl });
      return { subject, html, text };
    }
    case 'voip_spend_alert': {
      const subject = str(data, 'subject', 'Call spend alert');
      const lines = Array.isArray(data.lines) ? (data.lines as unknown[]).map((l) => String(l)) : [];
      const html = layout('en', subject, lines.map((l) => `<p>${esc(l)}</p>`).join('') + button('en', `${data.appUrl}`, 'Open the console'));
      const text = [subject, '', ...lines, ''].join('\n');
      return { subject, html, text };
    }
    case 'usage_alert': {
      const label = str(data, 'label', T('mail.usage.labelFallback'));
      const full = Number(data.threshold) >= 100;
      const used = str(data, 'used', '0');
      const allowance = str(data, 'allowance', '0');
      const usageUrl = str(data, 'usageUrl', `${data.appUrl}/settings/ai-usage`);
      const subject = full ? T('mail.usage.subjectFull', { label }) : T('mail.usage.subjectWarn', { label });
      const lead = full
        ? T('mail.usage.leadFull', { allowance: esc(allowance), label: esc(label) })
        : T('mail.usage.leadWarn', { used: esc(used), allowance: esc(allowance), label: esc(label) });
      const html = page(subject, `<p>${lead}</p>${btn(usageUrl, T('mail.usage.button'))}`);
      const text = `${subject}\n\n${T('mail.usage.textUsed', { used, allowance, label })}${full ? T('mail.usage.textFull') : ''}\n${T('mail.usage.textLink', { url: usageUrl })}`;
      return { subject, html, text };
    }
  }
}
