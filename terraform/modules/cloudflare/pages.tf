# --- Cloudflare Pages Projects ---

# CRM Flutter Web App
resource "cloudflare_pages_project" "crm_web" {
  account_id        = var.cloudflare_account_id
  name              = "travelcrm-web"
  production_branch = "main"

  build_config {
    build_command   = "cd packages/crm_app && flutter build web --release --web-renderer canvaskit"
    destination_dir = "packages/crm_app/build/web"
  }

  deployment_configs {
    production {
      environment_variables = {
        FLUTTER_VERSION = "3.41.1"
      }
    }
    preview {
      environment_variables = {
        FLUTTER_VERSION = "3.41.1"
      }
    }
  }
}

# Super Admin Next.js Portal
resource "cloudflare_pages_project" "admin" {
  account_id        = var.cloudflare_account_id
  name              = "travelcrm-admin"
  production_branch = "main"

  build_config {
    build_command   = "cd super-admin && npx @cloudflare/next-on-pages"
    destination_dir = "super-admin/.vercel/output/static"
  }

  deployment_configs {
    production {
      environment_variables = {
        NODE_VERSION = "20"
      }
    }
    preview {
      environment_variables = {
        NODE_VERSION = "20"
      }
    }
  }
}
