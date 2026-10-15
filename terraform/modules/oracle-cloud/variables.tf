variable "tenancy_ocid" {
  description = "OCI Tenancy OCID"
  type        = string

  validation {
    condition     = length(var.tenancy_ocid) > 0
    error_message = "tenancy_ocid is required when enable_oracle = true."
  }
}

variable "compartment_ocid" {
  description = "OCI Compartment OCID"
  type        = string

  validation {
    condition     = length(var.compartment_ocid) > 0
    error_message = "compartment_ocid is required when enable_oracle = true."
  }
}

variable "region" {
  description = "OCI Region"
  type        = string
  default     = "ap-mumbai-1"
}

variable "ssh_public_key" {
  description = "SSH public key for instance access"
  type        = string

  validation {
    condition     = length(var.ssh_public_key) > 0
    error_message = "ssh_public_key is required when enable_oracle = true."
  }
}

variable "instance_name" {
  description = "Name of the compute instance"
  type        = string
  default     = "travelcrm-wordpress"
}

variable "image_id" {
  description = "OCID of the OS image (Ubuntu 22.04 ARM)"
  type        = string

  validation {
    condition     = length(var.image_id) > 0
    error_message = "image_id is required when enable_oracle = true."
  }
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
