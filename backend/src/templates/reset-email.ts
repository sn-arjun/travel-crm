export function resetPasswordEmailHtml(resetUrl: string, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #1565C0; padding: 24px 32px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">TravelCRM Pro</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 16px; margin-top: 0;">Hi ${userName},</p>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        We received a request to reset your password. Click the button below to create a new password.
        This link will expire in 1 hour.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: #1565C0; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
          Reset Password
        </a>
      </div>
      <p style="color: #888; font-size: 12px; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>
    <div style="background: #f9f9f9; padding: 16px 32px; border-top: 1px solid #eee;">
      <p style="color: #999; font-size: 11px; margin: 0; text-align: center;">
        &copy; TravelCRM Pro. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function accountLockedEmailHtml(userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #C62828; padding: 24px 32px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Security Alert</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 16px; margin-top: 0;">Hi ${userName},</p>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        Your account has been temporarily locked due to multiple failed login attempts.
        It will be automatically unlocked in 30 minutes, or you can contact your administrator.
      </p>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        If this wasn't you, please reset your password immediately.
      </p>
    </div>
  </div>
</body>
</html>`;
}
