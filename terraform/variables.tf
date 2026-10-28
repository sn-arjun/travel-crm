# TravelCRM Pro — Terraform Variables (Single Source of Truth)
# All infrastructure config and API keys are declared here.
# Set values in terraform.tfvars (gitignored) or via CI secrets.

# ─── Project ─────────────────────────────────────────────────

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "travelcrm"
}

variable "domain" {
  description = "PLACEHOLDER until the owner picks a domain (docs/GO-LIVE.md phase 0). Set it ONCE here (terraform.tfvars or TF_VAR_domain); the landing site, API, admin console and agency web app hostnames are all derived from it."
  type        = string

  validation {
    condition     = !can(regex("(?i)your-domain", var.domain))
    error_message = "domain is still the YOUR-DOMAIN.example placeholder. Set the real domain in terraform.tfvars."
  }
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
  default     = "production"
}

# ─── Oracle Cloud (Tier 3, not part of this root) ────────────
# The WordPress VM is created from terraform/oracle/ (separate state, own oci_* variables). Leave
# oci_instance_ip empty until that VM exists; then the wildcard DNS record * -> VM is created here.

variable "oci_instance_ip" {
  description = "Public IP of the Oracle Cloud WordPress VM (output of terraform/oracle). Empty = no wildcard DNS record."
  type        = string
  default     = ""
}

# ─── Cloudflare ──────────────────────────────────────────────

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API Token (Edit Workers, D1, R2, KV, Queues, DNS)"
  type        = string
  sensitive   = true
}

# ─── Application Secrets ────────────────────────────────────
# Terraform itself uses none of these. They are optional (default empty) so a plan needs only domain and the
# Cloudflare values. Real secrets go to the Worker with wrangler secret put (docs/GO-LIVE.md phase 3).

variable "jwt_secret" {
  description = "JWT signing secret (min 32 chars)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret (min 32 chars)"
  type        = string
  sensitive   = true
  default     = ""
}


# ─── Twilio (SMS, WhatsApp, Voice, OTP) ─────────────────────

variable "twilio_account_sid" {
  description = "Twilio Account SID"
  type        = string
  default     = ""
}

variable "twilio_auth_token" {
  description = "Twilio Auth Token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "twilio_verify_service_sid" {
  description = "Twilio Verify Service SID (for OTP)"
  type        = string
  default     = ""
}

variable "twilio_sms_from_number" {
  description = "Twilio SMS sender number (e.g., +1234567890)"
  type        = string
  default     = ""
}

variable "twilio_whatsapp_from_number" {
  description = "Twilio WhatsApp sender (e.g., whatsapp:+14155238886)"
  type        = string
  default     = ""
}

# ─── Plivo (Alternative VoIP — 78% cheaper for India) ───────

variable "plivo_auth_id" {
  description = "Plivo Auth ID (https://console.plivo.com/dashboard/)"
  type        = string
  default     = ""
}

variable "plivo_auth_token" {
  description = "Plivo Auth Token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "plivo_sms_from_number" {
  description = "Plivo SMS sender number"
  type        = string
  default     = ""
}

variable "plivo_whatsapp_from_number" {
  description = "Plivo WhatsApp sender number"
  type        = string
  default     = ""
}

# ─── SendGrid (Email) ───────────────────────────────────────

variable "sendgrid_api_key" {
  description = "SendGrid API Key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sendgrid_from_email" {
  description = "Default sender email address (noreply@<your domain>; the API reads EMAIL_FROM, not this)"
  type        = string
  default     = ""
}

# ─── Firebase (Push Notifications) ──────────────────────────

variable "fcm_server_key" {
  description = "Firebase Cloud Messaging Server Key"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Deepgram (Transcription) ───────────────────────────────

variable "deepgram_api_key" {
  description = "Deepgram API Key for audio transcription"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Anthropic (AI) ─────────────────────────────────────────

variable "anthropic_api_key" {
  description = "Anthropic API Key for Claude AI"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Google Maps (Optional) ─────────────────────────────────

variable "google_maps_api_key" {
  description = "Google Maps/Places API Key (optional)"
  type        = string
  default     = ""
}

# ─── Workers hostnames ───────────────────────────────────
variable "api_worker_name" {
  description = "Name of the API Worker that api.<domain> points at (backend/wrangler.base.toml)"
  type        = string
  default     = "travelcrm-api"
}

variable "admin_worker_name" {
  description = "Name of the super admin OpenNext Worker that admin.<domain> points at (super-admin/wrangler.toml)"
  type        = string
  default     = "travelcrm-super-admin"
}

variable "app_worker_name" {
  description = "Name of the agency web app OpenNext Worker that app.<domain> points at (desktop/wrangler.web.toml)"
  type        = string
  default     = "travelcrm-app"
}
