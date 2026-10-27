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

## M3 / Stage 3 — Doctors, idempotent booking, and payment compensation

Status: Complete

Implemented:

- Verified-doctor search/filtering by free text, specialization, city, language, and maximum fee,
  plus verified profile detail and future available-slot listing.
- Verified doctors can create bounded future availability; PostgreSQL exclusion constraints reject
  overlapping slots. Admins can verify pending doctors. Both actions are audited and idempotent.
- Authenticated non-auth mutations require a bounded `Idempotency-Key`. The request hash binds user,
  method, path, and canonical body. Matching completed requests replay stored responses; mismatches
  return `422`; active requests return `409`; unexpected `5xx` responses are not retained.
- Booking uses one parameterized conditional PostgreSQL `UPDATE ... RETURNING` inside a short
  transaction to claim only future available slots for verified doctors. The same transaction
  creates the pending consultation, mock payment, and safe audit record.
- Payment webhooks verify HMAC-SHA256 over the exact raw request body. Event IDs are inserted with
  `ON CONFLICT DO NOTHING` for concurrent-safe deduplication; reuse with a different canonical event
  returns `409`.
- Payment success atomically marks payment succeeded, consultation confirmed, and slot booked.
  Failure/expiry atomically marks payment failed/expired, consultation expired, and releases the
  slot. Transition row counts are asserted so partial state cannot commit.
- A non-production admin-only, idempotent payment simulator exercises the same compensation service.
- OpenAPI 3.1 and Swagger document all Stage 3 routes, idempotency headers, and webhook signature.

Verification completed:

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- Unit suite: 15 files and 38 tests pass.
- Integration suite: 3 files and 12 tests pass against isolated PostgreSQL 16 and Redis 7 containers.
- Integration proof covers verified search/filtering and slot listing, availability replay/mismatch/
  in-progress idempotency, missing-key rejection, exactly one concurrent booking winner, stored
  replay, forged webhook rejection, simultaneous duplicate events, event-ID mismatch rejection,
  failure compensation and slot release, success confirmation, admin verification, audit records,
  and the dev simulator.

Known limitations / deferred:

- Held-slot expiry is compensated by explicit failed/expired payment events today. A later worker can
  scan `held_until` for abandoned payments; correctness does not depend on an external provider call
  inside the booking transaction.
- Consultation lifecycle, encrypted prescriptions, access ownership on consultation reads, and
  aggregate admin analytics are the next Stage 4 slice.

## M4 / Stage 4 — Consultation lifecycle, encrypted prescriptions, audit, and analytics

Status: Complete

Implemented:

- Patient and assigned-doctor consultation reads with explicit aggregate-only admin denial and IDOR
  protection through resource ownership checks.
- Assigned-doctor-only idempotent start and completion transitions using conditional database
  updates so invalid or concurrent state changes return conflicts.
- Patient/assigned-doctor idempotent cancellation for pending-payment and confirmed consultations.
  One transaction cancels the consultation, releases the slot, expires a pending payment or marks a
  succeeded mock payment refunded, and writes a safe audit record.
- Bounded cancellation reason codes prevent free-text PHI from entering general consultation state
  or audit-adjacent workflows.
- Assigned-doctor-only, versioned prescriptions after consultation completion. AES-256-GCM protects
  content at rest with key-version metadata; creation responses and idempotency records contain
  metadata only, never prescription plaintext.
- Audited prescription reads decrypt content only for the patient or assigned doctor. Admin and
  unrelated-user access is explicitly denied.
- Aggregate-only admin analytics for users, doctor verification, consultation status, payment count
  and minor-unit totals by currency, and prescription count. No PII or PHI records are returned.
- OpenAPI 3.1/Swagger coverage for all Stage 4 routes. The schema now contains exactly the 22
  assignment business endpoints.

Verification completed:

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and
  `npm run openapi:check` pass.
- Prisma validation passes with an explicit command-scoped `DATABASE_URL`, and Docker Compose
  configuration validation passes with disposable command-scoped placeholder secrets; no local
  `.env` file was created or modified.
- Unit suite: 18 files and 45 tests pass.
- Integration suite: 4 files and 15 tests pass against isolated PostgreSQL 16 and Redis 7
  containers.
- Stage 4 integration proof covers patient/doctor ownership, unrelated patient IDOR denial, explicit
  admin denial, doctor-only state transitions, pending-payment expiry compensation, succeeded-payment
  refund compensation, two ordered prescription versions, ciphertext at rest, plaintext exclusion
  from idempotency storage, authorized decryption, safe audit records, and aggregate analytics.
- The Stage 4 runtime Docker image builds successfully, and `npm audit --audit-level=high` reports
  zero vulnerabilities.

Known limitations / deferred:

- The mock `REFUNDED` state represents successful compensation for the assignment; a production
  implementation would run the external refund asynchronously with retry/backoff and reconciliation.
- Consultation notes, diagnosis coding, provider integrations, and broader admin drill-down APIs are
  deliberately excluded from the one-day assignment scope.
