# Amrutam Telemedicine Backend

Production-oriented TypeScript backend for the Amrutam telemedicine assignment. The repository
is being delivered milestone by milestone; the current branch includes the HTTP foundation,
database schema, encrypted demo seed, and security primitives needed by the authentication slice.

## Current scope

- Node.js 22.22+, TypeScript strict mode, Express 5.
- Zod-validated configuration and fail-fast startup.
- Pino JSON logs with request correlation and redaction.
- `/health/live` process liveness and `/health/ready` Postgres/Redis reachability.
- Vitest, Supertest, Testcontainers harness, Docker, and GitHub Actions skeleton.
- Prisma/PostgreSQL schema with overlap and active-slot database guards.
- AES-256-GCM field encryption, Argon2id hashing, RS256 access tokens, opaque refresh-token
  hashing, and RFC 6238 TOTP helpers.
- Patient registration/login, doctor/admin MFA, rotating refresh tokens, logout, RBAC/ownership
  foundations, authentication rate limiting, and safe audit records.
- Generated OpenAPI 3.1 and executable Swagger UI at `http://localhost:3000/docs` in development.
- Verified doctor search/profile/slot listing, doctor availability, admin verification, idempotent
  atomic booking, signed/deduplicated mock payment events, and success/failure compensation.

See [delivery progress](docs/PROGRESS.md) for verified results and current limitations.

## Local setup

Prerequisites: Node.js 22.22+ LTS, npm, Docker, and Docker Compose.

```bash
cp .env.example .env
npm ci
npm run security:generate-keys
# Replace the security placeholders in .env with the generated values.
npm run prisma:generate
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run openapi:check
docker compose up --build
```

The API listens on `http://localhost:3000`:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

## Development commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
npm run test:unit
npm run test:integration
npm run prisma:validate
npm run db:migrate
npm run db:seed
npm run openapi:generate
```

The seed creates fixed demo identities for `patient@amrutam.local`, `doctor@amrutam.local`, and
`admin@amrutam.local`. Their shared generated password and the doctor/admin TOTP secret remain
only in the developer's untracked `.env`; protected profile and MFA values are encrypted in the
database.

Authentication routes are available under `/api/v1/auth`. Open Swagger UI at `/docs` to execute
registration, login, MFA, refresh, and logout. Use the generated doctor/admin TOTP secret from your
local `.env`; secrets and protected data are never included in the OpenAPI artifact.

Doctor browsing and booking/payment are available in Swagger. Every authenticated non-auth mutation
requires an `Idempotency-Key`; payment webhooks require `X-Payment-Signature`. The dev payment
simulator is available only outside production.

Consultation lifecycle/prescriptions, observability, Terraform, and the final security documentation
are delivered in later milestones defined in `AGENTS.md`.
