# --- D1 Databases ---

resource "cloudflare_d1_database" "master" {
  account_id = var.cloudflare_account_id
  name       = "travelcrm-master"
}

# --- R2 Buckets ---

resource "cloudflare_r2_bucket" "files" {
  account_id = var.cloudflare_account_id
  name       = "travelcrm-files"
  location   = "APAC"
}

# --- KV Namespaces ---

resource "cloudflare_workers_kv_namespace" "cache" {
  account_id = var.cloudflare_account_id
  title      = "travelcrm-cache"
}

resource "cloudflare_workers_kv_namespace" "sessions" {
  account_id = var.cloudflare_account_id
  title      = "travelcrm-sessions"
}

# --- Queues ---

resource "cloudflare_queue" "email" {
  account_id = var.cloudflare_account_id
  name       = "travelcrm-email-queue"
}

resource "cloudflare_queue" "sms" {
  account_id = var.cloudflare_account_id
  name       = "travelcrm-sms-queue"
}

resource "cloudflare_queue" "push" {
  account_id = var.cloudflare_account_id
  name       = "travelcrm-push-queue"
}

resource "cloudflare_queue" "wp_provision" {
  account_id = var.cloudflare_account_id
  name       = "travelcrm-wp-provision-queue"
}
