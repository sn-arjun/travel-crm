# TravelCRM Pro — Cloudflare Workers Infrastructure
# This file is the single source of truth for ALL Cloudflare bindings.
# Every D1, R2, KV, and Queue used in wrangler.toml MUST be defined here.

# ─── D1 Databases ───────────────────────────────────────────

resource "cloudflare_d1_database" "master" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-master"
}

# ─── R2 Buckets ─────────────────────────────────────────────

resource "cloudflare_r2_bucket" "files" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-files"
  location   = "APAC"
}

# ─── KV Namespaces ──────────────────────────────────────────

resource "cloudflare_workers_kv_namespace" "cache" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-cache"
}

resource "cloudflare_workers_kv_namespace" "sessions" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-sessions"
}

resource "cloudflare_workers_kv_namespace" "report_cache" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-report-cache"
}

# ─── Queues (all queues referenced in wrangler.toml) ────────

resource "cloudflare_queue" "email" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-email-queue"
}

resource "cloudflare_queue" "sms" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-sms-queue"
}

resource "cloudflare_queue" "push" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-push-queue"
}

resource "cloudflare_queue" "wp_provision" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-wp-provision-queue"
}

resource "cloudflare_queue" "import" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-import-queue"
}

resource "cloudflare_queue" "import_dlq" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-import-dlq"
}

resource "cloudflare_queue" "export" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-export-queue"
}

resource "cloudflare_queue" "export_dlq" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-export-dlq"
}

resource "cloudflare_queue" "campaign" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-campaign-queue"
}

resource "cloudflare_queue" "campaign_dlq" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-campaign-dlq"
}

# ─── R2: backups and desktop update feed ────────────────────

resource "cloudflare_r2_bucket" "backups" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-backups"
  location   = "APAC"
}

resource "cloudflare_r2_bucket" "desktop_updates" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-desktop-updates"
  location   = "APAC"
}
