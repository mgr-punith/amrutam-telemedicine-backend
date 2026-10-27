# Five-minute demo script

Use a clean clone for the final rehearsal. Never show `.env` contents, JWTs, MFA secrets, private
keys, prescription ciphertext, or webhook secret on screen; paste credentials from a hidden terminal.

## 0:00–0:35 — Repository and architecture

1. Show the green GitHub Actions run and repository root.
2. Open `docs/architecture.md`; point to API/worker/PostgreSQL/Redis and observability flow.
3. State: exactly 22 business endpoints, advanced regional features documented rather than faked.

## 0:35–1:15 — Start and observe

```bash
docker compose --profile observability up --build -d
docker compose ps
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl -s http://localhost:9100/metrics | grep -E 'amrutam_http|amrutam_booking|amrutam_payment'
```

Open Swagger at `http://localhost:3000/docs`, Prometheus at `http://localhost:9090`, and Jaeger at
`http://localhost:16686`. If trace export is enabled locally, set
`AMRUTAM_OTEL_EXPORTER_ENDPOINT=http://otel-collector:4318/v1/traces` before starting Compose.

## 1:15–2:00 — Authentication and doctor discovery

1. Register/login a patient through Swagger.
2. Login the seeded doctor, complete TOTP MFA, and authorize Swagger with the access token.
3. Search verified doctors and list future slots.
4. Create a slot as the verified doctor using a unique `Idempotency-Key`.

## 2:00–3:00 — Booking correctness and payment

1. Authorize as patient and create a consultation for the slot.
2. Repeat with the same idempotency key; show identical response and replay header.
3. Mention the integration test that sends two concurrent requests and proves exactly one winner.
4. Authorize as admin and use the non-production payment simulator to mark the payment succeeded.
5. Read the consultation as patient and show `CONFIRMED`.

## 3:00–4:00 — Consultation, prescription, security

1. Authorize as assigned doctor; start and complete the consultation with distinct idempotency keys.
2. Create a prescription; show that the create response contains metadata, not content.
3. Authorize as patient; read the prescription content.
4. State that an unrelated patient and admin receive 403; tests prove both paths.
5. Show `docs/security.md`, emphasizing AES-GCM, MFA/RBAC/ownership, HMAC, redacted telemetry,
   Gitleaks/Trivy/Checkov, and the key-rotation runbook.

## 4:00–4:35 — Analytics and observability

1. Authorize as admin and call `/admin/analytics/overview`; show aggregates only.
2. Refresh Prometheus and show HTTP duration/count, booking/payment counters, and process metrics.
3. In Jaeger, select `amrutam-api` and show an HTTP trace plus `booking.claim_slot` or
   `payment.apply_event`. Confirm spans use route templates and contain no request bodies.

## 4:35–5:00 — Engineering proof

Show:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Then point to Terraform validation and scanners in CI, Docker Compose API/worker services, and the
honest `docs/PROGRESS.md` distinction between implemented, verified, documented-only, and deferred.
