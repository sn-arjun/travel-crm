variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API Token"
  type        = string
  sensitive   = true
}

variable "zone_name" {
  description = "Domain name for the DNS zone (e.g., travelcrm.com)"
  type        = string
}

variable "oci_instance_ip" {
  description = "Public IP of the Oracle Cloud instance (for wildcard DNS); empty when Oracle is disabled"
  type        = string
  default     = ""
}

variable "create_wildcard_dns" {
  description = "Create the wildcard A record that points at the Oracle VM (Tier 3). A plain bool, not derived from the IP, so the count is known at plan time."
  type        = bool
  default     = false
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "travelcrm"
}

variable "api_worker_name" {
  description = "Name of the API Worker (backend/wrangler.base.toml name)"
  type        = string
  default     = "travelcrm-api"
}

variable "admin_worker_name" {
  description = "Name of the super admin OpenNext Worker (super-admin/wrangler.toml name)"
  type        = string
  default     = "travelcrm-super-admin"
}

variable "app_worker_name" {
  description = "Name of the agency web app OpenNext Worker (desktop/wrangler.web.toml name)"
  type        = string
  default     = "travelcrm-app"
}
