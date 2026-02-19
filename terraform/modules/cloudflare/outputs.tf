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

output "pages_crm_url" {
  description = "CRM Web App Pages URL"
  value       = cloudflare_pages_project.crm_web.subdomain
}

output "pages_admin_url" {
  description = "Super Admin Pages URL"
  value       = cloudflare_pages_project.admin.subdomain
}
