# Production environment overrides. Usage: terraform plan -var-file=environments/production.tfvars
#
# This file holds ONLY the values that differ per environment (names and region). It deliberately sets no
# domain, no account ids and no secrets: a -var-file overrides terraform.tfvars, so any example value here
# would silently replace your real one. Set `domain` once in terraform.tfvars (or TF_VAR_domain), the
# Cloudflare values and secrets in terraform.tfvars or TF_VAR_* variables.
project_name = "travelcrm"
environment  = "production"
