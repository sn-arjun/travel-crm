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
  description = "Public IP of the Oracle Cloud instance (for wildcard DNS)"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "travelcrm"
}
