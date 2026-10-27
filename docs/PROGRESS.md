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

## M5 / Stage 5 — Observability, worker, infrastructure, CI, and submission documents

Status: Complete; PR #5 push/pull-request checks passed for commit `2ec9be8`.

Implemented:

- Prometheus registry and separate metrics servers for API and worker. Exported signals include
  normalized-route HTTP count/duration, booking outcomes, payment outcomes, expired holds, and Node
  process/runtime metrics.
- OpenTelemetry SDK with OTLP HTTP export, Pino/Redis/Prisma instrumentation, PHI-safe manual HTTP
  spans, and manual booking/payment/worker spans. Route templates strip UUIDs and query strings.
- Pino completion/error logs now include request ID, method, normalized route, status, and duration
  without logging request or response bodies.
- BullMQ maintenance worker and recurring scheduler for abandoned held slots. A bounded
  `FOR UPDATE SKIP LOCKED` transaction expires pending payment/consultation state, releases the slot,
  and appends an audit record; jobs retry five times with exponential backoff.
- Docker Compose migration gate plus required API, worker, PostgreSQL and Redis services. The
  `observability` profile adds the OpenTelemetry Collector, Jaeger, and Prometheus.
- Compact AWS Terraform reference for two-AZ VPC/subnets, ALB/WAF/TLS, ECS Fargate API/worker, RDS
  PostgreSQL, Redis, ECR, KMS, Secrets Manager, CloudWatch logs, VPC flow logs, backups, deletion
  protection, and API autoscaling.
- GitHub Actions now runs on every push and pull request with quality/integration/OpenAPI/build/audit,
  Docker build plus Trivy, Terraform format/validate, full-history Gitleaks, and Checkov.
- Required README, 2–4 page architecture document, security checklist/threat model, and timed demo
  script. Architecture covers data flow, booking sequence, ER model, API schema, retries/backoff,
  partitioning, caching/concurrency, transactions/sagas, and backup/DR.

Verification completed:

- Unit suite: 20 files and 49 tests pass. New tests prove safe normalized telemetry labels and
  business/worker metric export.
- Stage 5 PostgreSQL/Redis integration proof atomically expires an overdue hold, expires its payment
  and consultation, releases the slot, writes the audit record, and confirms metrics contain no
  consultation/payment IDs.
- Docker Compose validates in default and `observability` profile modes with command-scoped
  placeholder secrets; no local `.env` was created or modified.
- Terraform 1.9.8 formats and validates using AWS provider 5.100.0.
- Initial Checkov 3.2.495 result: 163 passed, 0 failed, 6 documented skips. CI used the newer
  Checkov 3.3.30, exposing an availability-zone identity requirement; see the correction below.

PR #5 CI correction (2026-10-27):

- Inspected the failing logs with `gh run view 40540076067 --log-failed`: the Trivy action tag
  omitted its `v` prefix, Checkov `CKV_AWS_394` required pinned zone identities, and Gitleaks
  8.24.3 detected a non-secret idempotency test fixture in commit `1e6fa97`.
- Pinned published Trivy/Checkov action revisions and matching scanner versions. Gitleaks now
  explicitly scans all fetched Git history with a failing exit code and no PR write permission.
- Terraform uses two validated, ordered zone IDs and checks that both are available in the region.
  No scanner rule was disabled to address the zone identity finding.
- Flagged idempotency fixtures in the Stage 3/4/5 tests now generate keys at runtime. The ignore
  file contains four exact historical fingerprints for these fixtures and the public RFC 6238 TOTP
  vector, including two older fixture findings exposed by the full-history 8.24.3 scan.
- Trivy 0.70.0 found ten fixable high findings in npm bundled in the Node base image. The final
  runtime image now omits npm/npx; build and migration stages keep npm. After
  `docker build --pull -t amrutam-api:ci .`, the same Trivy scan exits 0 with zero fixable
  high/critical findings. A disposable runtime smoke test served liveness and metrics without npm.
- `npm run lint`, `npm run typecheck`, `npm test` (49 tests), `npm run test:integration` (16 tests),
  `npm run openapi:check`, `npm run build`, and `npm audit --audit-level=high` pass (audit: zero).
  Terraform 1.9.8 `fmt -check -recursive` and `validate` pass.
- Matching-version scanner verification: Checkov 3.3.30 reports 168 passed, 0 failed, and the same
  6 documented skips. Gitleaks 8.24.3 `detect --log-opts=--all` scans 6 commits with no leaks;
  a separate `gitleaks dir` scan of current tracked files also reports no leaks. Both use exit code 1
  for findings. `npm run format:check`, CI YAML parsing, and `git diff --check` pass.
- Remote CI still needs the correction commit pushed; the old failed run is not evidence about
  this new diff. No automatic commit or push was performed. Local `.env` remains ignored and untouched.

Follow-up: the user pushed `2ec9be8`; `gh pr checks 5` confirmed all ten checks passed before
starting Stage 6. The historical verification notes above describe the earlier local checkpoint.

Documented-only / deferred:

- The 100k consultations/day, p95 latency, and 99.95% availability values are design objectives, not
  fabricated benchmark claims. Production-like load, failover, and restore exercises remain required.
- Cross-region snapshot copy/restore automation, read replicas, automated monthly partition
  management, distributed rate limiting, provider reconciliation, immutable audit archive, and full
  Grafana/alert suites remain production extensions.

## Stage 6 — Final Compose and Swagger rehearsal

Status: Full functional rehearsal and local quality gates passed. Human video/submission and CI
for this new diff remain pending.

- Clean local clone from `2ec9be8`, new generated test credentials, isolated `amrutam-stage6`
  project, new volumes, and separate loopback ports; original `.env` and running services preserved.
- Compose observability startup, migration, and seed completed. API/worker/PostgreSQL/Redis healthy;
  Collector, Jaeger and Prometheus running; both Prometheus targets UP.
- Swagger executed register/login, doctor/admin MFA, search/detail/slots, availability, booking,
  replay/mismatch, signed mock payment, start/complete, prescription create/read, IDOR/admin denial,
  analytics, failed payment compensation, cancellation, refresh/logout, forged/duplicate webhooks.
- Two concurrent browser HTTP bookings produced `[201, 409]`; database aggregate found no active
  duplicate slot. Prescription storage check returned encrypted=true and versioned=true.
- A synthetic pending hold was aged only in the isolated DB. The real scheduled worker expired
  consultation/payment, released the slot, and wrote one expiry audit event.
- Jaeger APIs and UI proved HTTP, Prisma, manual booking/payment and worker spans. Sampled traces
  did not contain the synthetic prescription, phone or patient email; SQL used placeholders.
- Fixed issues found by rehearsal: same-origin Swagger server; correct `tsx watch` argument order;
  worker-specific healthcheck; duration/trace IDs in logs; mounted-router original URL handling;
  bounded telemetry routes; omitted raw request/error data to prevent protected-data leakage.
- Added two real HTTP logging regression cases (success/error). `npm test`: 51 tests passed;
  `npm run test:integration`: 16 passed. `npm run lint` and `npm run typecheck` passed.
- Corrected host development command served liveness and metrics; `demo:totp` generated a valid
  six-digit code from temporary configuration. Exact demo payloads and commands are documented.
- Detailed evidence: `docs/rehearsal.md`; human recording guide: `docs/demo-script.md`.

- Final format/lint/typecheck/OpenAPI/build/diff checks passed. npm audit: zero vulnerabilities.
  Gitleaks 8.24.3: no leaks in seven commits or current submission files (including new files).
  Trivy 0.70.0: no fixable HIGH/CRITICAL findings in the final rehearsed image.
- Stopped only the isolated rehearsal containers/network after collecting evidence. Existing
  containers and volumes, including the original local `.env`, were preserved. Removed obsolete
  project-created images at the user's request; current tools and observability images are retained.

Remaining: push and green CI for this diff, human-recorded five-minute video, and submission.
No production capacity/latency/SLO or visual/accessibility claim.
