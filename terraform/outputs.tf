# TravelCRM Pro — Terraform Outputs
# Run `terraform output` to see all values.
# Run `npm run infra:sync` from project root to auto-generate configs.

# ─── Cloudflare Infrastructure IDs ──────────────────────────

output "dns_zone_id" {
  description = "Cloudflare DNS Zone ID"
  value       = module.cloudflare.zone_id
}

output "d1_master_database_id" {
  description = "D1 Master Database ID — used in wrangler.toml"
  value       = module.cloudflare.d1_master_database_id
}

output "r2_bucket_name" {
  description = "R2 File Storage Bucket Name"
  value       = module.cloudflare.r2_bucket_name
}

output "kv_cache_id" {
  description = "KV Cache Namespace ID — used in wrangler.toml"
  value       = module.cloudflare.kv_cache_id
}

output "kv_sessions_id" {
  description = "KV Sessions Namespace ID — used in wrangler.toml"
  value       = module.cloudflare.kv_sessions_id
}

output "kv_report_cache_id" {
  description = "KV Report Cache Namespace ID — used in wrangler.toml"
  value       = module.cloudflare.kv_report_cache_id
}

output "pages_landing_url" {
  description = "Landing page Pages URL"
  value       = module.cloudflare.pages_landing_url
}

output "api_hostname" {
  description = "API custom domain"
  value       = module.cloudflare.api_hostname
}

output "admin_hostname" {
  description = "Super admin custom domain (OpenNext Worker)"
  value       = module.cloudflare.admin_hostname
}

output "app_hostname" {
  description = "Agency web app custom domain (OpenNext Worker)"
  value       = module.cloudflare.app_hostname
}

output "r2_backups_bucket" {
  description = "R2 bucket for tenant backups"
  value       = module.cloudflare.r2_backups_bucket
}

output "r2_desktop_updates_bucket" {
  description = "R2 bucket for the desktop update feed"
  value       = module.cloudflare.r2_desktop_updates_bucket
}

# ─── Aggregated Config (for scripts/sync-config.sh) ─────────

output "wrangler_config" {
  description = "All IDs needed for wrangler.toml — consumed by npm run infra:sync"
  value = {
    d1_database_id     = module.cloudflare.d1_master_database_id
    kv_cache_id        = module.cloudflare.kv_cache_id
    kv_sessions_id     = module.cloudflare.kv_sessions_id
    kv_report_cache_id = module.cloudflare.kv_report_cache_id
    r2_bucket_name     = module.cloudflare.r2_bucket_name
  }
}

output "secrets_list" {
  description = "All secret names that must be set via wrangler secret put"
  value = [
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_VERIFY_SERVICE_SID",
    "TWILIO_SMS_FROM_NUMBER",
    "TWILIO_WHATSAPP_FROM_NUMBER",
    "SENDGRID_API_KEY",
    "FCM_SERVER_KEY",
    "DEEPGRAM_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "CF_ACCOUNT_ID",
    "CF_API_TOKEN",
    "APP_URL",
    "CREDENTIALS_KEYS",
    "CREDENTIALS_ACTIVE_KEY_ID",
    "SUPER_ADMIN_JWT_SECRET",
    "ERROR_REPORTER_DSN",
    "HEALTH_TOKEN",
    "TURNSTILE_SECRET",
    "INBOUND_EMAIL_SECRET",
    "SENDGRID_WEBHOOK_PUBLIC_KEY",
    "API_PUBLIC_URL",
    "CORS_ORIGINS",
    "ALLOW_LOOPBACK_ORIGINS",
    "QUOTES_URL",
    "EMAIL_FROM",
    "EMAIL_FROM_NAME",
    "PLATFORM_SUPPORT_EMAIL",
  ]
}
