variable "tenancy_ocid" {
  description = "OCI Tenancy OCID"
  type        = string
}

variable "compartment_ocid" {
  description = "OCI Compartment OCID"
  type        = string
}

variable "region" {
  description = "OCI Region"
  type        = string
  default     = "ap-mumbai-1"
}

variable "ssh_public_key" {
  description = "SSH public key for instance access"
  type        = string
}

variable "instance_name" {
  description = "Name of the compute instance"
  type        = string
  default     = "travelcrm-wordpress"
}

variable "image_id" {
  description = "OCID of the OS image (Ubuntu 22.04 ARM)"
  type        = string
}

variable "vcn_cidr" {
  description = "CIDR block for the VCN"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}
