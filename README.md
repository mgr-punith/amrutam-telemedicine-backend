# Amrutam Telemedicine Backend

Production-oriented Node.js/TypeScript telemedicine backend implementing the assignment’s complete
vertical slice:

```text
register/login -> doctor/admin MFA -> browse doctors/slots -> idempotent atomic booking
-> signed mock payment -> consultation lifecycle -> encrypted prescription
-> audit trail -> aggregate admin analytics
```

The generated [OpenAPI schema](openapi/openapi.yaml) contains exactly 22 business endpoints. See
[architecture](docs/architecture.md), [security and threat model](docs/security.md).

## Deliverables

| Requirement                         | Repository location                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code and infrastructure as code     | [Application](src/), [Prisma schema/migrations](prisma/), [Docker Compose](docker-compose.yml), [AWS Terraform reference](infra/terraform/)                                     |
| Setup documentation                 | [Clean-clone setup](#clean-clone-setup) and [verification commands](#verification) below                                                                                        |
| API schema and documentation        | [Generated OpenAPI 3.1 schema](openapi/openapi.yaml), [endpoint index](#api-endpoints), and [local Swagger UI](http://localhost:3000/docs)                                      |
| Architecture document               | [Architecture, data model, consistency, scaling, and recovery](docs/architecture.md)                                                                                            |
| Automated tests and CI              | [Unit tests](tests/unit/), [integration tests](tests/integration/), [GitHub Actions pipeline](.github/workflows/ci.yml)                                                         |
| Observability setup                 | [Collector and Prometheus configuration](observability/), [Compose observability profile](docker-compose.yml), [demo commands](docs/demo-script.md#400440--logs-metrics-traces) |
| Security checklist and threat model | [Data classification, checklist, OWASP/STRIDE threats, and rotation](docs/security.md)                                                                                          |

Terraform is a reference design and is not deployed. See [rehearsal evidence](docs/rehearsal.md)
and [delivery progress](docs/PROGRESS.md) for recorded verification and pending submission steps.

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
test -f .env || cp .env.example .env
npm ci
npm run security:generate-keys
```

Copy the generated values into the matching placeholders in `.env`, then choose one startup mode.

Application on the host, dependencies in Docker. Run these commands in the same terminal:

```bash
docker compose up -d postgres redis
export DATABASE_URL=postgresql://amrutam:amrutam@localhost:5432/amrutam
export REDIS_URL=redis://localhost:6379
export AMRUTAM_OTEL_EXPORTER_ENDPOINT=
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The host URLs above override Compose-only hostnames from `.env`. Exports apply only to processes
started afterward in that terminal; they do not reconfigure an already-running API. If readiness
returns `503` with both dependencies down while the containers are healthy, stop the API with
**Ctrl+C** and restart it with explicit host URLs:

```bash
DATABASE_URL='postgresql://amrutam:amrutam@localhost:5432/amrutam' REDIS_URL='redis://localhost:6379' AMRUTAM_OTEL_EXPORTER_ENDPOINT= npm run dev
```

Start the worker in a second terminal:

```bash
DATABASE_URL='postgresql://amrutam:amrutam@localhost:5432/amrutam' REDIS_URL='redis://localhost:6379' METRICS_PORT=9101 AMRUTAM_OTEL_EXPORTER_ENDPOINT= npm run dev:worker
```

The API uses port 9100 for metrics. These host commands disable trace export; use the Compose
observability profile below for the complete telemetry demonstration.

Complete container stack (stop any host API/worker first to free their ports):

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

After either startup mode, check readiness from another terminal:

```bash
curl --fail-with-body http://localhost:3000/health/ready
```

A ready API returns HTTP `200` with
`{"status":"ready","checks":{"postgres":"up","redis":"up"}}`.

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

## API endpoints

Base URL: `http://localhost:3000/api/v1`. Paths below are relative to `/api/v1`; `{id}` is the
resource UUID. Use [Swagger UI](http://localhost:3000/docs) for executable requests, schemas,
headers, and response/error definitions. The [generated OpenAPI schema](openapi/openapi.yaml)
is the API contract; keep this index aligned when regenerating it.

| Method | Path                                | Access                               | Purpose                                                                   |
| ------ | ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| POST   | `/auth/register`                    | Public                               | Register a patient                                                        |
| POST   | `/auth/login`                       | Public                               | Get a patient session or doctor/admin MFA challenge                       |
| POST   | `/auth/mfa/enroll`                  | MFA challenge token                  | Enroll TOTP                                                               |
| POST   | `/auth/mfa/activate`                | MFA challenge token                  | Activate MFA and issue a session/recovery codes                           |
| POST   | `/auth/mfa/verify`                  | MFA challenge token                  | Complete login with TOTP or a recovery code                               |
| POST   | `/auth/refresh`                     | Refresh token in body                | Rotate the refresh token and issue a session                              |
| POST   | `/auth/logout`                      | Access token + refresh token in body | Revoke the supplied refresh token                                         |
| GET    | `/doctors`                          | Public                               | Search/filter verified doctors                                            |
| GET    | `/doctors/{id}`                     | Public                               | Read a verified doctor profile                                            |
| GET    | `/doctors/{id}/slots`               | Public                               | List future available slots                                               |
| POST   | `/availability/slots`               | Verified doctor                      | Create own availability                                                   |
| POST   | `/admin/doctors/{id}/verify`        | Admin                                | Verify a doctor profile                                                   |
| POST   | `/consultations`                    | Patient                              | Book a slot with pending payment                                          |
| GET    | `/consultations/{id}`               | Owning patient / assigned doctor     | Read a consultation                                                       |
| POST   | `/consultations/{id}/start`         | Assigned doctor                      | Start a confirmed consultation                                            |
| POST   | `/consultations/{id}/complete`      | Assigned doctor                      | Complete an in-progress consultation                                      |
| POST   | `/consultations/{id}/cancel`        | Owning patient / assigned doctor     | Cancel a pending/confirmed consultation and compensate payment/slot state |
| POST   | `/consultations/{id}/prescriptions` | Assigned doctor                      | Create an encrypted prescription after completion                         |
| GET    | `/consultations/{id}/prescriptions` | Owning patient / assigned doctor     | Read authorized prescription content                                      |
| POST   | `/webhooks/payments`                | HMAC signature                       | Process a payment event with event-ID deduplication                       |
| POST   | `/dev/payments/{id}/simulate`       | Admin; non-production only           | Simulate success/failure using the payment ID                             |
| GET    | `/admin/analytics/overview`         | Admin                                | Read aggregate analytics                                                  |

Role-protected routes use an access token; doctor/admin sessions require MFA. In Swagger, use
`mfaBearer` for challenge tokens and `accessBearer` for access tokens. Every authenticated
mutation outside `/auth` requires `Idempotency-Key`. Payment webhooks instead require
`X-Payment-Signature` and deduplicate the provider event ID. Admins cannot read individual
consultations or prescription content.

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

Generate the seeded doctor/admin's current six-digit TOTP in a private terminal:

```bash
npm run --silent demo:totp
```

Use the login response's `mfaToken` in Swagger's **mfaBearer** authorization, verify the code, then
put the returned `accessToken` in **accessBearer**. Paste token values without the `Bearer` prefix.
Swagger uses the origin it was opened on, including custom ports. The completed rehearsal and
remaining human submission steps are recorded in [docs/rehearsal.md](docs/rehearsal.md).

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
