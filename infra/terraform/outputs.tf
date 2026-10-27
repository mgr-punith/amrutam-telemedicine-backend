output "api_url" {
  description = "HTTPS entrypoint for the API."
  value       = "https://${aws_lb.api.dns_name}"
}

output "ecr_repository_url" {
  description = "Repository used for immutable API/worker images."
  value       = aws_ecr_repository.application.repository_url
}

output "application_secret_arn" {
  description = "Populate this JSON secret before starting the ECS services."
  value       = aws_secretsmanager_secret.application.arn
}

output "rds_master_secret_arn" {
  description = "RDS-managed master credential secret."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive   = true
}

output "postgres_endpoint" {
  description = "Private PostgreSQL endpoint."
  value       = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  description = "Private Redis primary endpoint."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}
