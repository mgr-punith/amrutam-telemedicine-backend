# AWS reference infrastructure

This Terraform is a compact, non-deployed production reference for the assignment. It provisions
two-AZ networking, an HTTPS ALB, private ECS Fargate API/worker services, encrypted Multi-AZ RDS
PostgreSQL, encrypted Redis, ECR, KMS, Secrets Manager, CloudWatch logs, and API autoscaling.

The `application` Secrets Manager resource intentionally has no secret version in Terraform. The
deployment pipeline must populate its documented JSON keys from an approved secret store and the
RDS-managed master secret before starting ECS. This keeps protected values out of Git and avoids
placing application secrets directly in Terraform source.

Validation only:

```bash
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

An actual deployment additionally requires an ACM certificate ARN, a Redis auth token supplied as
a sensitive CI variable, approved CORS origins, remote encrypted Terraform state with locking, and
a populated application secret. No resources are applied by CI.
