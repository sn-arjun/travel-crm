# Tier 3 only: the WordPress VM (one shared Multisite for all agencies). Nothing here is needed to launch.

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "travelcrm"
}

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

variable "instance_ocpus" {
  description = "OCPUs of the WordPress VM. Default = the Always Free allowance (2). Checked against docs.oracle.com on 2026-10-20; more than 2 is billed."
  type        = number
  default     = 2
}

variable "instance_memory_gb" {
  description = "Memory (GB) of the WordPress VM. Default = the Always Free allowance (12). More is billed."
  type        = number
  default     = 12
}

variable "boot_volume_gb" {
  description = "Boot volume size (GB). The free allowance is 200 GB of boot and block volumes together."
  type        = number
  default     = 100
}
