#!/usr/bin/env bash
# TravelCRM Pro — Push all secrets to Cloudflare Workers
# Usage: npm run secrets:push (from project root)
#
# Reads terraform/terraform.tfvars and pushes each secret
# to the Cloudflare Workers environment via `wrangler secret put`.
#
# Prerequisites: wrangler must be authenticated.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TFVARS="$PROJECT_ROOT/terraform/terraform.tfvars"
BACKEND_DIR="$PROJECT_ROOT/backend"

ENV_FLAG="${1:---env production}"

if [ ! -f "$TFVARS" ]; then
  echo "ERROR: terraform/terraform.tfvars not found."
  exit 1
fi

# Helper: extract value from tfvars
tfvar() {
  grep "^${1}\s*=" "$TFVARS" 2>/dev/null | sed 's/^[^=]*=\s*"\?\([^"]*\)"\?\s*$/\1/' | head -1
}

echo "==> Pushing secrets to Cloudflare Workers ($ENV_FLAG)..."

cd "$BACKEND_DIR"

# Map: terraform variable name → wrangler secret name
declare -A SECRETS=(
  ["jwt_secret"]="JWT_SECRET"
  ["jwt_refresh_secret"]="JWT_REFRESH_SECRET"
  ["twilio_account_sid"]="TWILIO_ACCOUNT_SID"
  ["twilio_auth_token"]="TWILIO_AUTH_TOKEN"
  ["twilio_verify_service_sid"]="TWILIO_VERIFY_SERVICE_SID"
  ["twilio_sms_from_number"]="TWILIO_SMS_FROM_NUMBER"
  ["twilio_whatsapp_from_number"]="TWILIO_WHATSAPP_FROM_NUMBER"
  ["plivo_auth_id"]="PLIVO_AUTH_ID"
  ["plivo_auth_token"]="PLIVO_AUTH_TOKEN"
  ["plivo_sms_from_number"]="PLIVO_SMS_FROM_NUMBER"
  ["plivo_whatsapp_from_number"]="PLIVO_WHATSAPP_FROM_NUMBER"
  ["sendgrid_api_key"]="SENDGRID_API_KEY"
  ["fcm_server_key"]="FCM_SERVER_KEY"
  ["deepgram_api_key"]="DEEPGRAM_API_KEY"
  ["anthropic_api_key"]="ANTHROPIC_API_KEY"
  ["google_maps_api_key"]="GOOGLE_MAPS_API_KEY"
  ["cloudflare_account_id"]="CF_ACCOUNT_ID"
  ["cloudflare_api_token"]="CF_API_TOKEN"
  ["app_url"]="APP_URL"
  ["credentials_keys"]="CREDENTIALS_KEYS"
  ["credentials_active_key_id"]="CREDENTIALS_ACTIVE_KEY_ID"
  ["super_admin_jwt_secret"]="SUPER_ADMIN_JWT_SECRET"
  ["error_reporter_dsn"]="ERROR_REPORTER_DSN"
  ["health_token"]="HEALTH_TOKEN"
  ["turnstile_secret"]="TURNSTILE_SECRET"
  ["inbound_email_secret"]="INBOUND_EMAIL_SECRET"
  ["sendgrid_webhook_public_key"]="SENDGRID_WEBHOOK_PUBLIC_KEY"
  ["api_public_url"]="API_PUBLIC_URL"
  ["cors_origins"]="CORS_ORIGINS"
  ["allow_loopback_origins"]="ALLOW_LOOPBACK_ORIGINS"
  ["quotes_url"]="QUOTES_URL"
  ["email_from"]="EMAIL_FROM"
  ["email_from_name"]="EMAIL_FROM_NAME"
  ["platform_support_email"]="PLATFORM_SUPPORT_EMAIL"
)

PUSHED=0
SKIPPED=0

for tf_key in "${!SECRETS[@]}"; do
  wrangler_key="${SECRETS[$tf_key]}"
  value=$(tfvar "$tf_key")

  if [ -n "$value" ] && [ "$value" != "" ]; then
    echo "$value" | npx wrangler secret put "$wrangler_key" $ENV_FLAG 2>/dev/null
    echo "    -> $wrangler_key"
    ((PUSHED++))
  else
    echo "    -> SKIP $wrangler_key (empty)"
    ((SKIPPED++))
  fi
done

echo ""
echo "Done! Pushed $PUSHED secrets, skipped $SKIPPED."
