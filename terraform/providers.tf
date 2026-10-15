terraform {
  required_version = ">= 1.8.0"

  required_providers {
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

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
