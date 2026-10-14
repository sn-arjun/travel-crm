export type TemplateName =
  | 'welcome_admin'
  | 'invite_user'
  | 'reset_password'
  | 'password_changed'
  | 'platform_enquiry'
  | 'usage_alert';

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

function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #222;">
  <div style="max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden;">
    <div style="background: #1565C0; padding: 20px 28px;"><h1 style="color: #ffffff; margin: 0; font-size: 20px;">TravelCRM Pro</h1></div>
    <div style="padding: 28px; font-size: 15px; line-height: 1.6;">${bodyHtml}</div>
  </div>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin: 24px 0;"><a href="${esc(url)}" style="display: inline-block; padding: 12px 28px; background: #1565C0; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${esc(label)}</a></p><p style="font-size: 13px; color: #555;">If the button does not work, copy this address into your browser:<br>${esc(url)}</p>`;
}

function str(d: TemplateData, key: string, fallback = ''): string {
  const v = d[key];
  return v === undefined || v === null ? fallback : String(v);
}

export function renderTemplate(template: TemplateName, data: TemplateData): RenderedEmail {
  switch (template) {
    case 'welcome_admin': {
      const agency = str(data, 'agencyName', 'your agency');
      const email = str(data, 'email');
      const password = str(data, 'temporaryPassword');
      const loginUrl = str(data, 'loginUrl', data.appUrl);
      const download = `${data.appUrl}/download`;
      const quickStart = `${data.appUrl}/quick-start`;
      const subject = `Welcome to TravelCRM Pro, ${agency}`;
      const html = layout(
        subject,
        `<p>Hello${data.adminName ? ` ${esc(data.adminName)}` : ''},</p>
<p>The workspace for <strong>${esc(agency)}</strong> is ready.</p>
<p>Sign in with:<br>Email: <strong>${esc(email)}</strong><br>Temporary password: <strong>${esc(password)}</strong></p>
<p>You will be asked to choose a new password the first time you sign in.</p>
${button(loginUrl, 'Sign in')}
<p>Desktop app download: <a href="${esc(download)}">${esc(download)}</a><br>Quick start guide: <a href="${esc(quickStart)}">${esc(quickStart)}</a></p>`
      );
      const text = `Welcome to TravelCRM Pro\n\nThe workspace for ${agency} is ready.\n\nEmail: ${email}\nTemporary password: ${password}\n\nYou will be asked to choose a new password the first time you sign in.\n\nSign in: ${loginUrl}\nDownload the desktop app: ${download}\nQuick start: ${quickStart}\n`;
      return { subject, html, text };
    }
    case 'invite_user': {
      const url = str(data, 'setupUrl');
      const inviter = str(data, 'inviterName', 'Your administrator');
      const agency = str(data, 'agencyName', 'TravelCRM Pro');
      const role = str(data, 'role');
      const roleLabel = role ? ` as ${role.replace(/_/g, ' ')}` : '';
      const subject = `You have been invited to ${agency}`;
      const html = layout(
        subject,
        `<p>Hello${data.name ? ` ${esc(data.name)}` : ''},</p>
<p>${esc(inviter)} invited you to join <strong>${esc(agency)}</strong> on TravelCRM Pro${esc(roleLabel)}.</p>
<p>Set up your account to get started. This link is valid for 7 days.</p>
${button(url, 'Set up your account')}`
      );
      const text = `${inviter} invited you to join ${agency} on TravelCRM Pro${roleLabel}.\n\nSet up your account (valid for 7 days):\n${url}\n`;
      return { subject, html, text };
    }
    case 'reset_password': {
      const url = str(data, 'resetUrl');
      const subject = 'Reset your TravelCRM Pro password';
      const html = layout(
        subject,
        `<p>Hello${data.name ? ` ${esc(data.name)}` : ''},</p>
<p>We received a request to reset your password. The link below expires in 1 hour.</p>
${button(url, 'Reset password')}
<p style="font-size: 13px; color: #555;">If you did not ask for this, ignore this email. Your password stays the same.</p>`
      );
      const text = `We received a request to reset your TravelCRM Pro password.\n\nThis link expires in 1 hour:\n${url}\n\nIf you did not ask for this, ignore this email.\n`;
      return { subject, html, text };
    }
    case 'password_changed': {
      const subject = 'Your TravelCRM Pro password was changed';
      const html = layout(
        subject,
        `<p>Hello${data.name ? ` ${esc(data.name)}` : ''},</p><p>The password for your account was just changed. If this was not you, reset it now or contact your administrator.</p>${button(`${data.appUrl}/forgot-password`, 'Reset password')}`
      );
      const text = `The password for your TravelCRM Pro account was just changed. If this was not you, reset it at ${data.appUrl}/forgot-password or contact your administrator.\n`;
      return { subject, html, text };
    }
    case 'platform_enquiry': {
      const subject = `New enquiry from ${str(data, 'name', 'a visitor')}`;
      const keys = ['name', 'email', 'phone', 'company', 'message'].filter((k) => data[k]);
      const rows = keys
        .map((k) => `<tr><td style="padding: 4px 12px 4px 0;"><strong>${esc(k)}</strong></td><td>${esc(data[k])}</td></tr>`)
        .join('');
      const html = layout(subject, `<p>A new enquiry arrived.</p><table>${rows}</table>`);
      const text = 'A new enquiry arrived.\n\n' + keys.map((k) => `${k}: ${data[k]}`).join('\n') + '\n';
      return { subject, html, text };
    }
    case 'usage_alert': {
      const label = str(data, 'label', 'usage');
      const threshold = Number(data.threshold) >= 100 ? 100 : 80;
      const used = str(data, 'used', '0');
      const allowance = str(data, 'allowance', '0');
      const usageUrl = str(data, 'usageUrl', `${data.appUrl}/settings/ai-usage`);
      const subject = threshold >= 100
        ? `You have used all of this month's ${label}`
        : `You have used 80% of this month's ${label}`;
      const lead = threshold >= 100
        ? `Your agency has used all ${esc(allowance)} of this month's ${esc(label)}. New sends are refused until the allowance renews next month; you can ask for an upgrade or extra credits.`
        : `Your agency has used ${esc(used)} of this month's ${esc(allowance)} ${esc(label)} (80%).`;
      const html = layout(subject, `<p>${lead}</p>${button(usageUrl, 'Open usage and limits')}`);
      const text = `${subject}\n\nUsed ${used} of ${allowance} ${label}.\n${threshold >= 100 ? 'New sends are refused until the allowance renews next month. Ask for an upgrade or extra credits.\n' : ''}\nUsage and limits: ${usageUrl}\n`;
      return { subject, html, text };
    }
  }
}
