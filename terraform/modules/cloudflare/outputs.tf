output "zone_id" {
  description = "Cloudflare DNS Zone ID"
  value       = cloudflare_zone.main.id
}

output "d1_master_database_id" {
  description = "D1 Master Database ID"
  value       = cloudflare_d1_database.master.id
}

output "r2_bucket_name" {
  description = "R2 File Storage Bucket Name"
  value       = cloudflare_r2_bucket.files.name
}

output "kv_cache_id" {
  description = "KV Cache Namespace ID"
  value       = cloudflare_workers_kv_namespace.cache.id
}

output "kv_sessions_id" {
  description = "KV Sessions Namespace ID"
  value       = cloudflare_workers_kv_namespace.sessions.id
}

output "kv_report_cache_id" {
  description = "KV Report Cache Namespace ID"
  value       = cloudflare_workers_kv_namespace.report_cache.id
}

output "pages_landing_url" {
  description = "Landing page Pages URL"
  value       = cloudflare_pages_project.landing.subdomain
}

output "api_hostname" {
  description = "API custom domain"
  value       = cloudflare_workers_domain.api.hostname
}

output "admin_hostname" {
  description = "Super admin custom domain"
  value       = cloudflare_workers_domain.admin.hostname
}

output "r2_backups_bucket" {
  description = "R2 bucket for tenant backups"
  value       = cloudflare_r2_bucket.backups.name
}

output "r2_desktop_updates_bucket" {
  description = "R2 bucket for the desktop update feed"
  value       = cloudflare_r2_bucket.desktop_updates.name
}

output "app_hostname" {
  description = "Agency web app custom domain"
  value       = cloudflare_workers_domain.app.hostname
}
