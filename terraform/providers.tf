terraform {
  required_version = ">= 1.8.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # State stored in Cloudflare R2 (S3-compatible, free)
  # NOTE: Create the terraform-state R2 bucket manually first (bootstrap)
  backend "s3" {
    bucket                      = "terraform-state"
    key                         = "travel-crm/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    # endpoints.s3 set via -backend-config or TF_BACKEND_* env vars
    # e.g.: terraform init -backend-config="endpoints={s3=\"https://<account_id>.r2.cloudflarestorage.com\"}"
  }
}

provider "oci" {
  tenancy_ocid = var.oci_tenancy_ocid
  user_ocid    = var.oci_user_ocid
  fingerprint  = var.oci_fingerprint
  private_key  = var.oci_private_key
  region       = var.oci_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
