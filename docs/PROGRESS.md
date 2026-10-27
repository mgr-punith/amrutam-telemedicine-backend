# Delivery progress

Last updated: 2026-10-27

## M0 — Repository foundation

Status: Complete

Implemented:

- Strict TypeScript ESM application with Express 5 and manual dependency injection.
- Zod-validated environment configuration that fails fast at startup.
- Pino HTTP logging with request IDs and sensitive-field redaction.
- Helmet, strict CORS allowlist, 100 KB JSON limit, stable error envelopes, and graceful shutdown.
- Process liveness and injected Postgres/Redis readiness checks.
- Vitest/Supertest health and configuration tests plus a Testcontainers Postgres/Redis harness.
- Multi-stage non-root Dockerfile, Compose services for API/Postgres 16/Redis 7, and initial CI.

Verification completed:

- Current package versions and maintenance metadata were checked against the npm registry on
  2026-10-27 using browser access. None of the selected runtime packages are deprecated.
- `npm ci --ignore-scripts --offline` completed from the committed lockfile.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` passed at the M0 boundary.
- Unit suite at the M0 boundary: 2 files and 6 tests passed with Vitest 5.0.5.
- `npm run format:check` and `docker compose config --quiet` pass.
- `npm audit --offline --audit-level=high` reports 0 vulnerabilities.

Not yet verified:

- The Supertest HTTP suite cannot run in this sandbox because it forbids local socket binding
  (`listen EPERM: operation not permitted 127.0.0.1`). It remains enabled in GitHub CI and should
  be run locally with `npm run test:integration` before the M0 pull request is merged.
- `npm run test:coverage` requires `@vitest/coverage-v8`, which cannot be installed until shell
  registry DNS is available. The M7 CI milestone owns the coverage gate.
- A live `npm audit` could not reach the registry audit endpoint because shell DNS returned
  `EAI_AGAIN`; the cached offline audit passed.
- Docker build and the full application stack have not yet been rerun after Stage 1 changes.

Known limitations:

- M0 readiness proves TCP reachability only. M1 will use real PostgreSQL and Redis client pings.
- Testcontainers currently brings a deprecated `glob@10.5.0` transitively through Archiver. The
  selected Testcontainers release is current and the offline security audit reports no advisory.
- Authentication routes and all later milestones remain unstarted.

## M1 / Stage 1 — Schema, seed, and security primitives

Status: Complete

Implemented:

- Pinned Prisma Client/CLI 6.19.3 and Argon2 0.45.1 with a committed lockfile.
- PostgreSQL data model for identities, profiles, doctors, slots, consultations, prescriptions,
  payments, audit logs, refresh-token rotation, idempotency keys, and webhook deduplication.
- SQL guards for case-insensitive unique email, non-overlapping doctor slots, one active
  consultation per slot, encrypted-field/key-version consistency, and required uniqueness and
  indexes.
- Idempotent demo seed for a patient, MFA-enabled verified doctor, MFA-enabled admin, encrypted
  phone/DOB/MFA fields, and three future availability slots.
- AES-256-GCM field encryption with random 96-bit IVs and key-version rotation support.
- Argon2id password hashing, RS256 access tokens with pinned algorithm/key ID/issuer/audience,
  opaque refresh-token generation and SHA-256 hashing, and RFC 6238 TOTP generation/verification.
- Strict security configuration plus a development secret generator. Generated secrets are
  printed for an untracked `.env` and are never committed.

Verification completed:

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`
  pass.
- Unit suite: 7 files and 19 tests passed with Vitest 5.0.5.
- `npm run prisma:format -- --check`, `npm run prisma:validate`, and Prisma Client generation
  pass with the pinned Prisma release.
- `npm run security:generate-keys` runs without writing secrets to the repository.
- `npm run db:migrate` applied the initial migration to PostgreSQL 16 successfully.
- `npm run db:seed` completed twice against the same database. Aggregate verification found
  exactly 3 users, 3 profiles, 1 doctor, and 3 slots, with zero plaintext or missing protected
  fields detected.

Documented-only / deferred:

- Authentication services/routes, recovery-code lifecycle, RBAC/ownership middleware, and audit
  recording are the next Stage 2 slice.
- Production encryption keys and JWT signing keys belong in a secrets manager with rotation;
  the local generator exists only for development and demonstration.
