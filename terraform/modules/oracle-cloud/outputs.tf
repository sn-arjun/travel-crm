output "instance_id" {
  description = "OCID of the compute instance"
  value       = oci_core_instance.wordpress.id
}

output "instance_public_ip" {
  description = "Public IP address of the instance"
  value       = oci_core_instance.wordpress.public_ip
}

output "vcn_id" {
  description = "OCID of the VCN"
  value       = oci_core_vcn.main.id
}

output "subnet_id" {
  description = "OCID of the public subnet"
  value       = oci_core_subnet.public.id
}
