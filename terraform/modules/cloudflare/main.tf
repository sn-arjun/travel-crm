# --- DNS Zone ---

resource "cloudflare_zone" "main" {
  account_id = var.cloudflare_account_id
  zone       = var.zone_name
  plan       = "free"
}

# --- DNS Records ---

# Root domain → Cloudflare Pages (CRM web app)
resource "cloudflare_record" "root" {
  zone_id = cloudflare_zone.main.id
  name    = "@"
  content = "192.0.2.1" # Placeholder — Pages custom domain handles this
  type    = "A"
  proxied = true
}

# Wildcard → OCI instance (WordPress sites)
resource "cloudflare_record" "wildcard" {
  zone_id = cloudflare_zone.main.id
  name    = "*"
  content = var.oci_instance_ip
  type    = "A"
  proxied = true
}

# API subdomain → Workers
resource "cloudflare_record" "api" {
  zone_id = cloudflare_zone.main.id
  name    = "api"
  content = "192.0.2.1" # Placeholder — Workers custom domain handles this
  type    = "A"
  proxied = true
}

# Admin subdomain → Cloudflare Pages (Super Admin)
resource "cloudflare_record" "admin" {
  zone_id = cloudflare_zone.main.id
  name    = "admin"
  content = "192.0.2.1" # Placeholder — Pages custom domain handles this
  type    = "A"
  proxied = true
}
