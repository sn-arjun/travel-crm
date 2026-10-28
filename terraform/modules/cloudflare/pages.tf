# ─── Cloudflare Pages: the static landing page ───────────────
#
# The landing site is plain static files. landing/scripts/build.mjs assembles landing/dist with
# landing/public/ published at the site root; the landing workflow (or `wrangler pages deploy landing/dist
# --project-name <name>`) uploads it. There is no Pages build command: deploys are direct uploads.

resource "cloudflare_pages_project" "landing" {
  account_id        = var.cloudflare_account_id
  name              = "${var.project_name}-landing"
  production_branch = "master"

  build_config {
    build_command   = ""
    destination_dir = "landing/dist"
    root_dir        = ""
  }
}

# Root domain and www serve the landing page.
resource "cloudflare_pages_domain" "landing_root" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.landing.name
  domain       = var.zone_name
}

resource "cloudflare_pages_domain" "landing_www" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.landing.name
  domain       = "www.${var.zone_name}"
}
