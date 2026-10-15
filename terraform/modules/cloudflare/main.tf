# --- DNS Zone ---

resource "cloudflare_zone" "main" {
  account_id = var.cloudflare_account_id
  zone       = var.zone_name
  plan       = "free"
}

# --- DNS Records ---

# Root domain and www -> the landing Pages project (the Pages domains in pages.tf complete verification)
resource "cloudflare_record" "root" {
  zone_id = cloudflare_zone.main.id
  name    = "@"
  content = cloudflare_pages_project.landing.subdomain
  type    = "CNAME"
  proxied = true
}

resource "cloudflare_record" "www" {
  zone_id = cloudflare_zone.main.id
  name    = "www"
  content = cloudflare_pages_project.landing.subdomain
  type    = "CNAME"
  proxied = true
}

# Wildcard -> OCI instance (WordPress sites). Explicit records above and the Workers domains below win.
resource "cloudflare_record" "wildcard" {
  zone_id = cloudflare_zone.main.id
  name    = "*"
  content = var.oci_instance_ip
  type    = "A"
  proxied = true
}

# api.<zone> -> the API Worker, admin.<zone> -> the super admin OpenNext Worker.
# A Workers custom domain creates its own proxied DNS record, so there are no placeholder A records.
# The Workers must exist before the first apply of these two resources (deploy them once, or apply in two steps).
resource "cloudflare_workers_domain" "api" {
  account_id = var.cloudflare_account_id
  zone_id    = cloudflare_zone.main.id
  hostname   = "api.${var.zone_name}"
  service    = var.api_worker_name
}

resource "cloudflare_workers_domain" "admin" {
  account_id = var.cloudflare_account_id
  zone_id    = cloudflare_zone.main.id
  hostname   = "admin.${var.zone_name}"
  service    = var.admin_worker_name
}
