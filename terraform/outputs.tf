# TravelCRM Pro — Terraform Outputs
# Run `terraform output` to see all values.
# Run `npm run infra:sync` from project root to auto-generate configs.

# ─── Oracle Cloud ────────────────────────────────────────────

output "oci_instance_ip" {
  description = "Public IP of the Oracle Cloud WordPress instance"
  value       = module.oracle_cloud.instance_public_ip
}

output "oci_instance_id" {
  description = "OCI Compute Instance OCID"
  value       = module.oracle_cloud.instance_id
}

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

output "pages_crm_url" {
  description = "CRM Flutter Web App URL"
  value       = module.cloudflare.pages_crm_url
}

output "pages_admin_url" {
  description = "Super Admin Portal URL"
  value       = module.cloudflare.pages_admin_url
}

# ─── Aggregated Config (for scripts/sync-config.sh) ─────────

output "wrangler_config" {
  description = "All IDs needed for wrangler.toml — consumed by npm run infra:sync"
  value = {
    d1_database_id    = module.cloudflare.d1_master_database_id
    kv_cache_id       = module.cloudflare.kv_cache_id
    kv_sessions_id    = module.cloudflare.kv_sessions_id
    kv_report_cache_id = module.cloudflare.kv_report_cache_id
    r2_bucket_name    = module.cloudflare.r2_bucket_name
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
    "SENDGRID_FROM_EMAIL",
    "FCM_SERVER_KEY",
    "DEEPGRAM_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "CF_ACCOUNT_ID",
    "CF_API_TOKEN",
    "APP_URL",
  ]
}
