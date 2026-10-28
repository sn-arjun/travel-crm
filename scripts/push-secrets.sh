#!/usr/bin/env bash
# TravelCRM Pro - push the REAL secrets to the deployed API Worker.
#
#   bash scripts/push-secrets.sh [--env production|staging|dev] [--dry-run] [--file <path>] [--partial]
#
# * Targets the generated config backend/.wrangler.<env>.toml (made by backend/scripts/gen-wrangler.mjs) with
#   `-c` and `--env`, never the placeholder backend/wrangler.toml.
# * Pushes secrets only (credentials, signing keys, tokens, webhook secrets). Every plain setting (URLs, rates, country
#   lists, flags, ids) is written into [vars] by gen-wrangler, so it is NOT pushed here. Two names are never pushed:
#   BILLING_MOCK_SECRET and TEST_MODE (they belong to local stacks and tests only).
# * Values come from the environment (variable named like the secret, e.g. JWT_SECRET) or, if not set there,
#   from a key = "value" file (default terraform/terraform.tfvars, git-ignored). Empty values are skipped.
#   A value that still looks like the example file's placeholder (your-..., xxxx, change-me, <...>) is treated as missing.
#   CF_API_TOKEN is read ONLY from the environment or the file key cf_runtime_api_token, never from
#   cloudflare_api_token (that is the deploy token; the Worker gets the narrower runtime token).
# * REQUIRED secrets (a first production deploy cannot work without them) must all have a value, otherwise the script
#   stops before pushing anything (also in --dry-run, so the dry run is a real preflight). OPTIONAL ones are reported
#   as "skip" and are not an error. --partial turns the required check into a warning, for a later top-up run that
#   pushes only the secrets of one feature.
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
PARTIAL=0
VALUES_FILE="$PROJECT_ROOT/terraform/terraform.tfvars"

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_NAME="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --partial) PARTIAL=1; shift ;;
    --file) VALUES_FILE="${2:-}"; shift 2 ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$ENV_NAME" in
  production|staging|dev) ;;
  *) echo "ERROR: --env must be production, staging or dev" >&2; exit 2 ;;
esac

CONFIG="$BACKEND_DIR/.wrangler.$ENV_NAME.toml"

# "key_in_file:WRANGLER_SECRET_NAME:R|O". The name is also the environment variable that wins over the file.
# R = required for a first production deploy, O = optional (the feature stays off without it).
#
# Why these are required: the three JWT secrets sign every login (API and console); CREDENTIALS_KEYS seals the agencies'
# provider keys in the database; CF_ACCOUNT_ID + CF_API_TOKEN (runtime token) let the Worker create one D1 database per
# new agency (TENANT_PROVISIONER=cloudflare is always generated); SENDGRID_API_KEY sends all agency mail (Communication
# Hub, campaigns, reminders), which never goes through Cloudflare. Everything else has a working fallback or is a feature
# you switch on later (HEALTH_TOKEN only guards the deep health check, billing refuses to work without its keys, and so on).
SECRET_MAP=(
  "jwt_secret:JWT_SECRET:R"
  "jwt_refresh_secret:JWT_REFRESH_SECRET:R"
  "super_admin_jwt_secret:SUPER_ADMIN_JWT_SECRET:R"
  "credentials_keys:CREDENTIALS_KEYS:R"
  "cloudflare_account_id:CF_ACCOUNT_ID:R"
  "cf_runtime_api_token:CF_API_TOKEN:R"
  "sendgrid_api_key:SENDGRID_API_KEY:R"
  "health_token:HEALTH_TOKEN:O"
  "sendgrid_webhook_public_key:SENDGRID_WEBHOOK_PUBLIC_KEY:O"
  "inbound_email_secret:INBOUND_EMAIL_SECRET:O"
  "unsub_secret:UNSUB_SECRET:O"
  "twilio_account_sid:TWILIO_ACCOUNT_SID:O"
  "twilio_auth_token:TWILIO_AUTH_TOKEN:O"
  "twilio_verify_service_sid:TWILIO_VERIFY_SERVICE_SID:O"
  "twilio_sms_from_number:TWILIO_SMS_FROM_NUMBER:O"
  "twilio_whatsapp_from_number:TWILIO_WHATSAPP_FROM_NUMBER:O"
  "whatsapp_meta_token:WHATSAPP_META_TOKEN:O"
  "whatsapp_meta_app_secret:WHATSAPP_META_APP_SECRET:O"
  "whatsapp_meta_verify_token:WHATSAPP_META_VERIFY_TOKEN:O"
  "stripe_secret_key:STRIPE_SECRET_KEY:O"
  "stripe_webhook_secret:STRIPE_WEBHOOK_SECRET:O"
  "razorpay_key_id:RAZORPAY_KEY_ID:O"
  "razorpay_key_secret:RAZORPAY_KEY_SECRET:O"
  "razorpay_webhook_secret:RAZORPAY_WEBHOOK_SECRET:O"
  "provisioner_secret:PROVISIONER_SECRET:O"
  "anthropic_api_key:ANTHROPIC_API_KEY:O"
  "deepgram_api_key:DEEPGRAM_API_KEY:O"
  "google_maps_api_key:GOOGLE_MAPS_API_KEY:O"
  "turnstile_secret:TURNSTILE_SECRET:O"
  "error_reporter_dsn:ERROR_REPORTER_DSN:O"
)

# Never pushed, whatever the environment holds (local stacks and tests only).
NEVER_PUSH=(BILLING_MOCK_SECRET TEST_MODE)

# Extract a value from a key = "value" file (first match, quotes stripped).
file_value() {
  [ -f "$VALUES_FILE" ] || return 0
  grep -E "^$1[[:space:]]*=" "$VALUES_FILE" 2>/dev/null | head -1 | sed -E 's/^[^=]*=[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/' || true
}

# True when the value is still an example/placeholder value.
is_placeholder() {
  local low
  low="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    *your-*|*xxxx*|*change-me*|*changeme*|*replace-me*|"<"*) return 0 ;;
  esac
  return 1
}

lookup() {
  local key="$1" name="$2" v
  v="${!name:-}"
  if [ -z "$v" ]; then v="$(file_value "$key")"; fi
  if [ -n "$v" ] && is_placeholder "$v"; then v=""; fi
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

for n in "${NEVER_PUSH[@]}"; do
  if [ -n "${!n:-}" ]; then echo "    - ignore $n (set in this shell; it is never pushed)"; fi
done

# Pass 1: resolve every value (kept in memory only) and check the required ones before anything is sent.
NAMES=()
VALUES=()
LEVELS=()
MISSING_REQUIRED=0
for entry in "${SECRET_MAP[@]}"; do
  key="${entry%%:*}"
  rest="${entry#*:}"
  name="${rest%%:*}"
  level="${rest##*:}"
  NAMES+=("$name")
  VALUES+=("$(lookup "$key" "$name")")
  LEVELS+=("$level")
  if [ -z "${VALUES[${#VALUES[@]}-1]}" ] && [ "$level" = "R" ]; then
    MISSING_REQUIRED=$((MISSING_REQUIRED + 1))
  fi
done

if [ "$MISSING_REQUIRED" != "0" ] && [ "$PARTIAL" != "1" ]; then
  echo "ERROR: $MISSING_REQUIRED required secret(s) have no value (nothing was pushed):" >&2
  for i in "${!NAMES[@]}"; do
    if [ -z "${VALUES[$i]}" ] && [ "${LEVELS[$i]}" = "R" ]; then echo "       - ${NAMES[$i]}" >&2; fi
  done
  echo "       Set them in the environment (variable named like the secret) or in $VALUES_FILE, or use --partial for a top-up run." >&2
  # Still show the full picture so the dry run is useful.
fi

PUSHED=0
SKIPPED=0
FAILED=0

if [ "$MISSING_REQUIRED" = "0" ] || [ "$PARTIAL" = "1" ]; then
  for i in "${!NAMES[@]}"; do
    name="${NAMES[$i]}"
    value="${VALUES[$i]}"
    if [ -z "$value" ]; then
      if [ "${LEVELS[$i]}" = "R" ]; then
        echo "    - MISSING $name (required)"
      else
        echo "    - skip  $name (optional, no value)"
      fi
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
else
  # Dry run or real run with required values missing: list every name and its state, push nothing.
  for i in "${!NAMES[@]}"; do
    if [ -n "${VALUES[$i]}" ]; then
      echo "    - have  ${NAMES[$i]}"
    elif [ "${LEVELS[$i]}" = "R" ]; then
      echo "    - MISSING ${NAMES[$i]} (required)"
    else
      echo "    - skip  ${NAMES[$i]} (optional, no value)"
    fi
  done
fi

echo ""
if [ "$MISSING_REQUIRED" != "0" ] && [ "$PARTIAL" != "1" ]; then
  echo "Stopped: $MISSING_REQUIRED required secret(s) missing. Nothing was sent."
  exit 1
fi
if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run: $PUSHED secret(s) would be pushed, $SKIPPED skipped. Nothing was sent."
else
  echo "Done: $PUSHED pushed, $SKIPPED skipped, $FAILED failed."
fi
[ "$FAILED" = "0" ]
