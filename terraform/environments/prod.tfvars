# Production Environment Overrides
# Usage: terraform plan -var-file=environments/prod.tfvars
project_name = "travelcrm"
environment  = "production"
oci_region   = "ap-mumbai-1"

# Required variables, non-secret placeholders. Replace the example.* values before the first real plan.
# Secrets (OCI key, Cloudflare token, JWT secrets, Twilio, SendGrid, FCM) come from TF_VAR_* environment
# variables or an untracked terraform.tfvars; do not put them in this file (a var-file would override TF_VAR_*).
domain                    = "example.test"
oci_compartment_ocid      = "ocid1.compartment.oc1..exampleexampleexample"
oci_image_id              = "ocid1.image.oc1.ap-mumbai-1.exampleexampleexample"
ssh_public_key            = "ssh-ed25519 AAAAexampleexampleexample deploy@example"
twilio_verify_service_sid = "VAexampleexampleexampleexample00000"
