# Stage 6 rehearsal — 2026-10-27

Base commit: `2ec9be8`; PR #5 had all ten push/pull-request checks green, confirmed with
`gh pr checks 5 --repo mgr-punith/amrutam-telemedicine-backend`. The fixes below are a subsequent
local diff and need their own pushed CI result.

## Environment and method

Cloned the repository into a fresh temporary directory with `git clone --no-hardlinks`, generated
new synthetic credentials, and started Compose project `amrutam-stage6` with new PostgreSQL/Redis
volumes. Existing local `.env`, containers, and databases were preserved. A temporary Compose
override used API 3300, metrics 39100/39101, Prometheus 39090, and Jaeger 36686 on loopback.
The source fixes found during rehearsal were applied to this clone and rebuilt for verification.

Executed `docker compose ... --profile observability up --build -d` and
`docker compose ... --profile seed run --build --rm seed`. API, worker, PostgreSQL, and Redis became
healthy; Collector, Jaeger, and Prometheus ran successfully. The seed completed with exit code 0.
The Docker build performed dependency installation, Prisma generation, and TypeScript compilation.

Browser QA used an isolated browser context and real Swagger **Try it out / Execute** controls.
Temporary tokens remained in browser memory. Concurrent requests were sent together from the same
local browser; no production environment was involved. No video was recorded automatically.

## Verified evidence

| Area                | Observed result                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Registration/login  | Synthetic patient registration 201; password login 200                                                                                   |
| MFA                 | Seeded doctor/admin challenge followed by successful TOTP verification                                                                   |
| Search/detail/slots | Verified doctor returned; three seeded future slots; new availability 201                                                                |
| Booking replay      | Pending booking 201; equivalent JSON response and replay header on repeat                                                                |
| Key mismatch        | Changed body with same key returned 422                                                                                                  |
| Concurrency         | Two patients raced for one slot: exactly 201 and 409; no active-slot duplicates                                                          |
| Payment success     | Signed simulator confirmed payment/consultation and booked slot                                                                          |
| Payment failure     | Consultation EXPIRED and slot available again                                                                                            |
| Webhooks            | Forged signature 401; valid event processed; repeated event reported duplicate                                                           |
| Consultation        | CONFIRMED → IN_PROGRESS → COMPLETED through Swagger                                                                                      |
| Prescription        | Metadata-only creation; authorized patient read; admin/outsider reads 403                                                                |
| Storage/audit       | Database boolean check showed encrypted content and key version; sensitive-action audit entries present                                  |
| Cancellation        | Confirmed mock booking cancelled and compensated                                                                                         |
| Refresh/logout      | Refresh token changed; logout 204; revoked token refresh 401                                                                             |
| Worker              | One synthetic hold was aged in the isolated DB; recurring worker expired payment/consultation, released slot, and wrote one expiry audit |
| Metrics             | Prometheus API and worker targets both UP                                                                                                |
| Traces              | Jaeger displayed HTTP, Prisma, booking/payment, and worker spans; browser opened booking trace with database spans                       |
| Telemetry privacy   | Sampled traces contained no synthetic prescription, phone, or patient email; DB query text used placeholders                             |
| Logs                | Correct route, request ID, status, durationMs, and trace correlation; regression tests cover raw URL/header/error privacy                |
| Host development    | Corrected `npm run dev` served liveness and metrics on separate test ports                                                               |

## Corrections made during rehearsal

- Swagger's server is relative (`/`), preventing requests from a custom-port/reverse-proxy page
  being sent to another localhost API. Regenerated OpenAPI without changing the 22 business endpoints.
- Corrected `tsx watch --import ...` ordering in API/worker development scripts.
- Overrode the worker's inherited API healthcheck to probe its own metrics port.
- Restored duration and trace IDs in completion logs, normalized the original URL across mounted
  routers, omitted raw request/error data, and bounded unknown telemetry routes to `unmatched`.
- Added the private-terminal `npm run --silent demo:totp` helper and exact Swagger demo payloads.
- Documented localhost DB/Redis overrides for host startup and preserved-existing-env setup.

Verification: 51 unit tests and 16 integration tests pass. Formatting, lint, typecheck, OpenAPI
consistency, build, diff checks and rebuilt Compose pass. npm audit reports zero vulnerabilities;
Gitleaks scans of history/current files pass; Trivy finds no fixable HIGH/CRITICAL vulnerabilities.
After verification, only rehearsal containers/network and their image tags were removed. Database
volumes remain; existing services and the user's local `.env` were not changed.

## Human handoff

Record the five-minute video using `docs/demo-script.md`, push this diff, wait for its CI checks,
and submit the repository/video links. Do not claim the recording or final submission has happened
until it actually has. No measured 100k/day, latency, availability, failover, or DR claim is made.
Visual regression and accessibility conformance were not evaluated; this was a functional API demo.
