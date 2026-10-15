# TravelCRM Pro — Root Terraform Module (Cloudflare only)
#
# The Oracle Cloud WordPress VM (Tier 3) is NOT part of this configuration. It lives in its own root,
# terraform/oracle/, with its own state, so that a plan here never needs an oci_* value or an OCI provider.
# When that VM exists, put its public IP in oci_instance_ip and the wildcard DNS record is created.

# --- Cloudflare Resources (DNS, D1, R2, KV, Queues, Pages, Workers domains) ---
module "cloudflare" {
  source = "./modules/cloudflare"

  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_api_token  = var.cloudflare_api_token
  zone_name             = var.domain
  create_wildcard_dns   = var.oci_instance_ip != ""
  oci_instance_ip       = var.oci_instance_ip
  project_name          = var.project_name
  api_worker_name       = var.api_worker_name
  admin_worker_name     = var.admin_worker_name
  app_worker_name       = var.app_worker_name
}
