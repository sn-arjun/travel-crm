# Oracle Cloud ARM instance for per-agency WordPress sites (Tier 3). Apply from this directory only when
# WordPress ships:  cd terraform/oracle && terraform init && terraform apply
# Then copy the instance_public_ip output into oci_instance_ip in terraform/terraform.tfvars.

module "oracle_cloud" {
  source = "../modules/oracle-cloud"

  tenancy_ocid     = var.oci_tenancy_ocid
  compartment_ocid = var.oci_compartment_ocid
  region           = var.oci_region
  ssh_public_key   = var.ssh_public_key
  instance_name    = "${var.project_name}-wordpress"
  image_id         = var.oci_image_id

  instance_ocpus     = var.instance_ocpus
  instance_memory_gb = var.instance_memory_gb
  boot_volume_gb     = var.boot_volume_gb
}

output "instance_public_ip" {
  description = "Public IP of the WordPress VM; put it in oci_instance_ip of the main configuration"
  value       = module.oracle_cloud.instance_public_ip
}

output "instance_id" {
  description = "OCI Compute Instance OCID"
  value       = module.oracle_cloud.instance_id
}
