# --- Oracle Cloud Outputs ---

output "oci_instance_ip" {
  description = "Public IP of the Oracle Cloud WordPress instance"
  value       = module.oracle_cloud.instance_public_ip
}

output "oci_instance_id" {
  description = "OCI Compute Instance OCID"
  value       = module.oracle_cloud.instance_id
}

# --- Cloudflare Outputs ---

output "dns_zone_id" {
  description = "Cloudflare DNS Zone ID"
  value       = module.cloudflare.zone_id
}

output "d1_master_database_id" {
  description = "Cloudflare D1 Master Database ID — use in wrangler.toml"
  value       = module.cloudflare.d1_master_database_id
}

output "r2_bucket_name" {
  description = "Cloudflare R2 File Storage Bucket"
  value       = module.cloudflare.r2_bucket_name
}

output "kv_cache_id" {
  description = "Cloudflare KV Cache Namespace ID — use in wrangler.toml"
  value       = module.cloudflare.kv_cache_id
}

output "kv_sessions_id" {
  description = "Cloudflare KV Sessions Namespace ID — use in wrangler.toml"
  value       = module.cloudflare.kv_sessions_id
}

output "pages_crm_url" {
  description = "CRM Flutter Web App URL"
  value       = module.cloudflare.pages_crm_url
}

output "pages_admin_url" {
  description = "Super Admin Portal URL"
  value       = module.cloudflare.pages_admin_url
}
