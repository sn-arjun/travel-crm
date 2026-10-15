#!/usr/bin/env bash
# TravelCRM Pro - push the REAL secrets to the deployed API Worker.
#
#   bash scripts/push-secrets.sh [--env production|staging|dev] [--dry-run] [--file <path>]
#
# * Targets the generated config backend/.wrangler.<env>.toml (made by backend/scripts/gen-wrangler.mjs) with
#   `-c` and `--env`, never the placeholder backend/wrangler.toml.
# * Pushes secrets only. Plain settings (APP_URL, API_URL, CORS_ORIGINS, EMAIL_FROM, API_PUBLIC_URL,
#   ALLOW_LOOPBACK_ORIGINS, CREDENTIALS_ACTIVE_KEY_ID, TENANT_PROVISIONER, CF_WORKER_SCRIPT_NAME, ...) are written
#   into [vars] by gen-wrangler, so they are NOT pushed here.
# * Values come from the environment (variable named like the secret, e.g. JWT_SECRET) or, if not set there,
#   from a key = "value" file (default terraform/terraform.tfvars, git-ignored). Empty values are skipped.
# * --dry-run lists the config path and the secret NAMES that would be pushed. It never prints a value and
#   never calls wrangler.
# * It never writes .dev.vars and never edits wrangler.toml.
#
# Prerequisites: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment; the Worker deployed once.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="${BACKEND_DIR:-$PROJECT_ROOT/backend}"

ENV_NAME="production"
DRY_RUN=0
VALUES_FILE="$PROJECT_ROOT/terraform/terraform.tfvars"

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_NAME="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --file) VALUES_FILE="${2:-}"; shift 2 ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$ENV_NAME" in
  production|staging|dev) ;;
  *) echo "ERROR: --env must be production, staging or dev" >&2; exit 2 ;;
esac

CONFIG="$BACKEND_DIR/.wrangler.$ENV_NAME.toml"

# "key_in_file:WRANGLER_SECRET_NAME". The name is also the environment variable that wins over the file.
# Only real secrets and credentials belong here.
SECRET_MAP=(
  "jwt_secret:JWT_SECRET"
  "jwt_refresh_secret:JWT_REFRESH_SECRET"
  "super_admin_jwt_secret:SUPER_ADMIN_JWT_SECRET"
  "credentials_keys:CREDENTIALS_KEYS"
  "health_token:HEALTH_TOKEN"
  "cloudflare_account_id:CF_ACCOUNT_ID"
  "cloudflare_api_token:CF_API_TOKEN"
  "sendgrid_api_key:SENDGRID_API_KEY"
  "sendgrid_webhook_public_key:SENDGRID_WEBHOOK_PUBLIC_KEY"
  "inbound_email_secret:INBOUND_EMAIL_SECRET"
  "unsub_secret:UNSUB_SECRET"
  "twilio_account_sid:TWILIO_ACCOUNT_SID"
  "twilio_auth_token:TWILIO_AUTH_TOKEN"
  "twilio_verify_service_sid:TWILIO_VERIFY_SERVICE_SID"
  "twilio_sms_from_number:TWILIO_SMS_FROM_NUMBER"
  "twilio_whatsapp_from_number:TWILIO_WHATSAPP_FROM_NUMBER"
  "anthropic_api_key:ANTHROPIC_API_KEY"
  "deepgram_api_key:DEEPGRAM_API_KEY"
  "google_maps_api_key:GOOGLE_MAPS_API_KEY"
  "turnstile_secret:TURNSTILE_SECRET"
  "error_reporter_dsn:ERROR_REPORTER_DSN"
)

# Extract a value from a key = "value" file (first match, quotes stripped).
file_value() {
  [ -f "$VALUES_FILE" ] || return 0
  grep -E "^$1[[:space:]]*=" "$VALUES_FILE" 2>/dev/null | head -1 | sed -E 's/^[^=]*=[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/' || true
}

lookup() {
  local key="$1" name="$2" v
  v="${!name:-}"
  if [ -z "$v" ]; then v="$(file_value "$key")"; fi
  printf '%s' "$v"
}

echo "==> Secrets for $ENV_NAME"
echo "    config:  $CONFIG"
echo "    values:  environment, then $VALUES_FILE"
if [ ! -f "$CONFIG" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    echo "    NOTE: the config does not exist yet (dry run continues). Generate it first:"
    echo "          cd backend && node scripts/gen-wrangler.mjs --env $ENV_NAME --from-d1-remote"
  else
    echo "ERROR: $CONFIG not found. Generate it first:" >&2
    echo "       cd backend && node scripts/gen-wrangler.mjs --env $ENV_NAME --from-d1-remote" >&2
    exit 1
  fi
fi

PUSHED=0
SKIPPED=0
FAILED=0

for entry in "${SECRET_MAP[@]}"; do
  key="${entry%%:*}"
  name="${entry#*:}"
  value="$(lookup "$key" "$name")"
  if [ -z "$value" ]; then
    echo "    - skip  $name (no value)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "    - would push $name"
    PUSHED=$((PUSHED + 1))
    continue
  fi
  if (cd "$BACKEND_DIR" && printf '%s' "$value" | npx wrangler secret put "$name" -c "$CONFIG" --env "$ENV_NAME" >/dev/null); then
    echo "    - pushed $name"
    PUSHED=$((PUSHED + 1))
  else
    echo "    - FAILED $name" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run: $PUSHED secret(s) would be pushed, $SKIPPED skipped. Nothing was sent."
else
  echo "Done: $PUSHED pushed, $SKIPPED skipped, $FAILED failed."
fi
[ "$FAILED" = "0" ]
