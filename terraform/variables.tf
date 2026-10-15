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
  description = "Primary domain name (e.g., travelcrm.com)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
  default     = "production"
}

# ─── Oracle Cloud ────────────────────────────────────────────

variable "oci_tenancy_ocid" {
  description = "OCI Tenancy OCID"
  type        = string
}

variable "oci_user_ocid" {
  description = "OCI User OCID"
  type        = string
}

variable "oci_fingerprint" {
  description = "OCI API Key Fingerprint"
  type        = string
}

variable "oci_private_key" {
  description = "OCI API Private Key (PEM format)"
  type        = string
  sensitive   = true
}

variable "oci_compartment_ocid" {
  description = "OCI Compartment OCID"
  type        = string
}

variable "oci_region" {
  description = "OCI Region"
  type        = string
  default     = "ap-mumbai-1"
}

variable "oci_image_id" {
  description = "OCI ARM image OCID (Ubuntu 22.04 ARM)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for OCI instance access"
  type        = string
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
# These are pushed to Cloudflare Workers via `wrangler secret put`
# Terraform tracks them as the single source of truth.

variable "jwt_secret" {
  description = "JWT signing secret (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "app_url" {
  description = "Frontend app URL (e.g., https://travelcrm.com)"
  type        = string
  default     = "http://localhost:8080"
}

# ─── Twilio (SMS, WhatsApp, Voice, OTP) ─────────────────────

variable "twilio_account_sid" {
  description = "Twilio Account SID"
  type        = string
}

variable "twilio_auth_token" {
  description = "Twilio Auth Token"
  type        = string
  sensitive   = true
}

variable "twilio_verify_service_sid" {
  description = "Twilio Verify Service SID (for OTP)"
  type        = string
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
}

variable "sendgrid_from_email" {
  description = "Default sender email address"
  type        = string
  default     = "noreply@travelcrm.com"
}

# ─── Firebase (Push Notifications) ──────────────────────────

variable "fcm_server_key" {
  description = "Firebase Cloud Messaging Server Key"
  type        = string
  sensitive   = true
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

# ─── Super Admin ────────────────────────────────────────────

variable "super_admin_email" {
  description = "Super admin login email"
  type        = string
  default     = "admin@travelcrm.com"
}

variable "super_admin_password" {
  description = "Super admin login password"
  type        = string
  sensitive   = true
  default     = "SuperAdmin@123"
}

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
