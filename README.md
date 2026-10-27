# Amrutam Telemedicine Backend

Production-oriented Node.js/TypeScript telemedicine backend implementing the assignment’s complete
vertical slice:

```text
register/login -> doctor/admin MFA -> browse doctors/slots -> idempotent atomic booking
-> signed mock payment -> consultation lifecycle -> encrypted prescription
-> audit trail -> aggregate admin analytics
```

The generated [OpenAPI schema](openapi/openapi.yaml) contains exactly 22 business endpoints. See
[architecture](docs/architecture.md), [security and threat model](docs/security.md),
[delivery progress](docs/PROGRESS.md), and the [five-minute demo script](docs/demo-script.md).

## Stack and implemented controls

- Node.js 22, strict TypeScript, Express 5, Zod, Prisma, PostgreSQL, Redis, BullMQ.
- Argon2id, RS256 JWT, rotating hashed refresh tokens, TOTP MFA, RBAC and ownership checks.
- AES-256-GCM encrypted phone/DOB/MFA/prescription fields with key-version support.
- Atomic conditional slot claim, database overlap/active-slot guards, request idempotency.
- Exact-body HMAC payment webhooks, event deduplication, success/failure/cancellation compensation.
- Pino JSON logs, Prometheus metrics, OpenTelemetry traces, Collector/Jaeger/Prometheus profile.
- API plus expired-hold worker, non-root read-only image, Docker Compose, GitHub Actions.
- Valid AWS Terraform reference for ALB/WAF, ECS API/worker, RDS, Redis, ECR, KMS and secrets.

## Prerequisites

- Node.js 22.22 or newer and npm.
- Docker with Compose v2.
- Optional local Terraform 1.9.8; CI and documented validation can use the official container.

## Clean-clone setup

Create your local environment file once. It is ignored by Git and must never be committed:

```bash
cp .env.example .env
npm ci
npm run security:generate-keys
```

Copy the generated values into the matching placeholders in `.env`, then choose one startup mode.

Application on the host, dependencies in Docker:

```bash
docker compose up -d postgres redis
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Complete container stack:

```bash
docker compose up --build -d
```

Observability profile with traces enabled:

```bash
export AMRUTAM_OTEL_EXPORTER_ENDPOINT=http://otel-collector:4318/v1/traces
docker compose --profile observability up --build -d
```

The migration service runs before the API/worker in Compose. Seed once for the fixed demo users:

```bash
docker compose --profile seed run --rm seed
```

## URLs

| Service                     | URL                                                              |
| --------------------------- | ---------------------------------------------------------------- |
| API                         | `http://localhost:3000`                                          |
| Swagger UI (non-production) | `http://localhost:3000/docs`                                     |
| Liveness / readiness        | `/health/live`, `/health/ready`                                  |
| API / worker metrics        | `http://localhost:9100/metrics`, `http://localhost:9101/metrics` |
| Prometheus                  | `http://localhost:9090`                                          |
| Jaeger                      | `http://localhost:16686`                                         |

The metrics servers are intentionally separate from the business API, so the assignment endpoint
count remains 22. In production, metrics and OTLP ports must be private.

## Demo identities and Swagger flow

Seeding creates `patient@amrutam.local`, `doctor@amrutam.local`, and `admin@amrutam.local`. The
shared demo password and doctor/admin TOTP secret exist only in your untracked `.env`.

1. Open Swagger and login the patient.
2. Login doctor/admin with password, then call MFA verify using the current TOTP code.
3. Search doctors, list/create a future slot, then book as patient with a unique `Idempotency-Key`.
4. Confirm payment through the admin-only dev simulator (available only outside production).
5. Start/complete as the assigned doctor, create the prescription, and read it as patient.
6. Call aggregate analytics as admin; admins cannot read prescription content.

Every authenticated non-auth mutation requires `Idempotency-Key`. Payment webhooks require
`X-Payment-Signature`, the lowercase hex HMAC-SHA256 of the exact raw JSON body. Follow
[docs/demo-script.md](docs/demo-script.md) for the timed recorded demonstration.

## Verification

Before pushing:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run openapi:check
npm run build
npm audit --audit-level=high
```

Additional infrastructure checks:

```bash
DATABASE_URL=postgresql://amrutam:amrutam@localhost:5432/amrutam npm run prisma:validate
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
docker compose --profile observability config --quiet
docker build -t amrutam-api:local .
```

CI also runs full-history Gitleaks, Trivy image scanning, and Checkov IaC scanning. Terraform is
validated but never applied by CI.

## Useful commands

```bash
npm run dev
npm run dev:worker
npm run start
npm run start:worker
npm run db:migrate
npm run db:seed
npm run prisma:generate
npm run openapi:generate
npm run test:unit
npm run test:integration
docker compose logs -f api worker
docker compose down
```

## Honest limitations

- Latency, throughput and 99.95% availability are architecture objectives, not fabricated benchmark
  results. Representative load/failover testing is required before production.
- Payment, video and notifications are mocks/deferred integrations.
- Cross-region restore, read replicas, automated partition management, tamper-evident audit archive,
  distributed rate limiting, and full Grafana dashboards are documented production extensions.
