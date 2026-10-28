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

# Agency websites (shared WordPress Multisite on the Oracle VM, Tier 3; only when create_wildcard_dns).
# *.<wp_sites_label>.<zone> -> VM. DNS only (not proxied): Caddy asks Let's Encrypt for each site's certificate on demand,
# and two-level names (<slug>.sites.<zone>) are not covered by Cloudflare's free universal certificate anyway.
resource "cloudflare_record" "wildcard" {
  count   = var.create_wildcard_dns ? 1 : 0
  zone_id = cloudflare_zone.main.id
  name    = "*.${var.wp_sites_label}"
  content = var.oci_instance_ip
  type    = "A"
  proxied = false
}

# wp-api.<zone> -> VM: the provisioner API the CRM backend calls (signed requests; also DNS only).
resource "cloudflare_record" "wp_api" {
  count   = var.create_wildcard_dns ? 1 : 0
  zone_id = cloudflare_zone.main.id
  name    = "wp-api"
  content = var.oci_instance_ip
  type    = "A"
  proxied = false
}

# api.<zone> -> the API Worker, admin.<zone> -> the super admin OpenNext Worker, app.<zone> -> the agency web app.
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

resource "cloudflare_workers_domain" "app" {
  account_id = var.cloudflare_account_id
  zone_id    = cloudflare_zone.main.id
  hostname   = "app.${var.zone_name}"
  service    = var.app_worker_name
}
