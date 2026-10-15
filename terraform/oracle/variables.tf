# Tier 3 only: the per-agency WordPress VM. Nothing here is needed to launch.

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
