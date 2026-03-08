# TravelCRM Pro — Root Terraform Module
# Orchestrates Oracle Cloud + Cloudflare infrastructure

# --- Oracle Cloud ARM Instance (WordPress hosting) ---
module "oracle_cloud" {
  source = "./modules/oracle-cloud"

  tenancy_ocid     = var.oci_tenancy_ocid
  compartment_ocid = var.oci_compartment_ocid
  region           = var.oci_region
  ssh_public_key   = var.ssh_public_key
  instance_name    = "${var.project_name}-wordpress"
  image_id         = var.oci_image_id
}

# --- Cloudflare Resources (DNS, D1, R2, KV, Queues, Pages) ---
module "cloudflare" {
  source = "./modules/cloudflare"

  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_api_token  = var.cloudflare_api_token
  zone_name             = var.domain
  oci_instance_ip       = module.oracle_cloud.instance_public_ip
  project_name          = var.project_name
}
