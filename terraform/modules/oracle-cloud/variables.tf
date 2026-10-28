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

variable "instance_ocpus" {
  description = "OCPUs of the VM.Standard.A1.Flex instance. Oracle's Always Free allowance is 2 OCPUs in total (docs.oracle.com Always Free Resources, read 2026-10-20: 1,500 OCPU-hours a month, equal to 2 OCPUs); more is billed."
  type        = number
  default     = 2

  validation {
    condition     = var.instance_ocpus >= 1 && var.instance_ocpus <= 4
    error_message = "instance_ocpus must be between 1 and 4."
  }
}

variable "instance_memory_gb" {
  description = "Memory in GB of the instance. Always Free allowance: 12 GB in total (9,000 GB-hours a month). More is billed."
  type        = number
  default     = 12

  validation {
    condition     = var.instance_memory_gb >= 6 && var.instance_memory_gb <= 24
    error_message = "instance_memory_gb must be between 6 and 24."
  }
}

variable "boot_volume_gb" {
  description = "Boot volume size in GB. The free allowance is 200 GB of boot plus block volumes combined; 100 leaves room for a block volume or a second boot volume."
  type        = number
  default     = 100

  validation {
    condition     = var.boot_volume_gb >= 50 && var.boot_volume_gb <= 200
    error_message = "boot_volume_gb must be between 50 and 200 (the free allowance is 200 GB in total)."
  }
}
