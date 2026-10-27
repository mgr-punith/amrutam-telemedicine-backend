variable "project_name" {
  description = "Name prefix for the reference environment."
  type        = string
  default     = "amrutam"
}

variable "aws_region" {
  description = "AWS region for the reference deployment."
  type        = string
  default     = "ap-south-1"
}

variable "availability_zone_ids" {
  description = "Two distinct, explicitly selected AZ IDs in aws_region; stable subnet identities even when AWS adds zones."
  type        = list(string)
  default     = ["aps1-az1", "aps1-az2"]

  validation {
    condition = (
      length(var.availability_zone_ids) == 2 &&
      length(distinct(var.availability_zone_ids)) == 2 &&
      alltrue([for id in var.availability_zone_ids : can(regex("^[a-z0-9]+-az[0-9]+$", id))])
    )
    error_message = "Select exactly two distinct availability zone IDs, such as aps1-az1 and aps1-az2."
  }
}

variable "vpc_cidr" {
  description = "CIDR for the application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "image_tag" {
  description = "Immutable image tag, normally the Git commit SHA."
  type        = string
  default     = "latest"
}

variable "certificate_arn" {
  description = "ACM certificate ARN used by the HTTPS listener."
  type        = string
}

variable "database_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "amrutam"
}

variable "database_username" {
  description = "RDS master username; the password is managed by RDS Secrets Manager integration."
  type        = string
  default     = "amrutam_admin"
}

variable "redis_auth_token" {
  description = "Redis auth token supplied by the deployment secret store."
  type        = string
  sensitive   = true
}

variable "api_desired_count" {
  description = "Steady-state API task count across two availability zones."
  type        = number
  default     = 2
}

variable "worker_desired_count" {
  description = "Steady-state worker task count."
  type        = number
  default     = 1
}

variable "otel_exporter_endpoint" {
  description = "Approved OTLP HTTP trace endpoint; leave empty when tracing is provided by a sidecar or disabled."
  type        = string
  default     = ""
}
