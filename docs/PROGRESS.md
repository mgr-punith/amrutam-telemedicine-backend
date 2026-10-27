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
- Unit suite: 7 files and 20 tests passed with Vitest 5.0.5.
- `npm run prisma:format -- --check`, `npm run prisma:validate`, and Prisma Client generation
  pass with the pinned Prisma release.
- `npm run security:generate-keys` runs without writing secrets to the repository.
- `npm run db:migrate` applied the initial migration to PostgreSQL 16 successfully.
- `npm run db:seed` completed twice against the same database. Aggregate verification found
  exactly 3 users, 3 profiles, 1 doctor, and 3 slots, with zero plaintext or missing protected
  fields detected.

Documented-only / deferred:

- Production encryption keys and JWT signing keys belong in a secrets manager with rotation;
  the local generator exists only for development and demonstration.

## M2 / Stage 2 — Authentication, authorization, and Swagger base

Status: Complete

Implemented:

- Patient registration and password login using strict bounded Zod request contracts.
- Doctor/admin MFA login with scoped short-lived JWT challenges, encrypted TOTP enrollment,
  activation, verification, and eight one-time hashed recovery codes.
- RS256 access JWT verification plus opaque refresh tokens stored only as SHA-256 hashes, rotated
  transactionally, with token-family revocation after reuse detection.
- Logout token revocation, failed-login counters, temporary account lockout, disabled/locked account
  enforcement, and per-IP authentication throttling.
- Reusable role and patient/doctor ownership guards. Admins do not receive an ownership bypass.
- Audit records for registration, login outcomes, MFA actions, refresh rotation/reuse, and logout,
  with no credentials, token values, PII, or MFA secrets in audit metadata.
- Prisma-backed PostgreSQL repository wired through the manual dependency-injection container.
- OpenAPI 3.1 generated from the Zod request contracts and executable Swagger UI at `/docs` outside
  production. The committed artifact is `openapi/openapi.yaml`.
- CI OpenAPI drift check and a Docker build fix that generates and carries the Prisma client into
  the runtime image.

Verification completed:

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- Unit suite: 12 files and 33 tests pass.
- Integration suite: 2 files and 9 tests pass against isolated PostgreSQL 16 and Redis 7 containers.
- Integration coverage proves patient registration/login, encrypted phone/DOB and password storage,
  seeded doctor password plus TOTP login, refresh rotation, refresh-token reuse family revocation,
  logout, audit persistence, strict unknown-field rejection, Swagger UI, and OpenAPI JSON serving.
- Clean `npm ci`, Prisma validation/client generation, and live `npm audit --audit-level=high`
  pass; the audit reports zero vulnerabilities.

Known limitations / deferred:

- The in-memory authentication rate limiter is process-local; a later scalability pass can replace
  it with Redis without changing the route contract.
- Prisma 6's CLI config originally resolved a vulnerable `deepmerge-ts`; the lockfile now enforces
  the patched 8.0.2 release through an npm override and Prisma validation/client generation pass.
- Doctor/slot browsing, idempotent booking, payment compensation, and consultation ownership usage
  are the next Stage 3 slice.
