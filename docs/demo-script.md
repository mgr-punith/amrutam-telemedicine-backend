# Five-minute demo script

Use synthetic identities/content only. Hide passwords, token response panels, and the private
terminal while recording; never display `.env`, keys, refresh tokens, or the MFA enrollment secret.
Complete builds and test runs before the five-minute recording.

## Preflight (off camera)

Follow the README setup, preserving an existing `.env`:

```bash
export AMRUTAM_OTEL_EXPORTER_ENDPOINT=http://otel-collector:4318/v1/traces
docker compose --profile observability up --build -d
docker compose --profile seed run --rm seed
docker compose ps
curl --fail http://localhost:3000/health/ready
npm run --silent demo:totp
```

Seeded emails: `patient@amrutam.local`, `doctor@amrutam.local`, `admin@amrutam.local`.
Use `AMRUTAM_DEMO_PASSWORD` from your private environment. Doctor/admin MFA is already enrolled;
`demo:totp` prints only the current code (about 30 seconds validity). Seed only demonstration data.

Open Swagger `/docs`, Jaeger `http://localhost:16686`, Prometheus `http://localhost:9090`, green CI,
and architecture/security docs in separate tabs. Build/start and run tests before recording.

## 0:00–0:35 — Repository and architecture

Show green CI, then architecture: stateless API, PostgreSQL transactions, Redis/BullMQ expiry worker,
encrypted data, and telemetry. Capacity/latency/availability are design targets, not measured results.
There are 22 business endpoints.

## 0:35–1:15 — Authentication and discovery

Use **Try it out → Execute**. Register a unique synthetic patient:

```json
{
  "email": "video.patient@example.com",
  "password": "<your generated demo password>",
  "fullName": "Video Demo Patient",
  "phone": "+919000001234",
  "dob": "1990-01-15",
  "city": "Bengaluru",
  "languages": ["English"]
}
```

Save the patient `accessToken` privately. If already registered, use `/auth/login`.
Login doctor/admin using seeded emails. Each returns `mfaRequired: true` and `mfaToken`.
In **Authorize**, put `mfaToken` in **mfaBearer**, then call `/auth/mfa/verify` with
`{"code":"<current six-digit code>"}`. Keep each returned access token privately.
Use **accessBearer** for business operations, replacing it when switching roles.
Paste raw tokens, without the `Bearer` prefix. Challenge tokens cannot authorize clinical actions.

Search `GET /doctors` with city `Bengaluru`, language `English`. The seeded doctor ID is
`20000000-0000-4000-8000-000000000002`; inspect their slots.

## 1:15–2:15 — Booking correctness

As doctor, create a future non-overlapping slot with a fresh `Idempotency-Key`:

```json
{ "startTime": "2031-06-01T10:00:00.000Z", "endTime": "2031-06-01T10:30:00.000Z" }
```

Change the time on later rehearsals. Copy its `id`. As patient, book using a fresh key:

```json
{ "slotId": "<slot id>", "mode": "VIDEO" }
```

Keep the consultation `id`, `payment.id`, and key. Show `201 PENDING_PAYMENT`.
Execute again with the same body/key: same JSON values and `Idempotency-Replayed: true`.
Change mode to `AUDIO` with that key: `422 IDEMPOTENCY_KEY_REUSED`.
Point to the concurrency proof: two distinct keys, one slot, exactly `[201, 409]`.

## 2:15–3:15 — Payment and consultation

As admin, `POST /dev/payments/{id}/simulate` with `payment.id`, a fresh key, and
`{"status":"SUCCEEDED"}`. This signed mock is disabled in production.
As patient, `GET /consultations/{id}` shows `CONFIRMED`.

As doctor, execute `/consultations/{id}/start`, then `/complete`, each with a different
idempotency key and no request body. Show `IN_PROGRESS → COMPLETED`.

## 3:15–4:00 — Prescription, ownership, analytics

As doctor, `POST /consultations/{id}/prescriptions`, fresh key:

```json
{ "content": "Demo prescription only: synthetic rehearsal instructions." }
```

The `201` response contains metadata only. As patient, `GET` the same path to read the synthetic
content. As admin, the read returns `403`. Admin `/admin/analytics/overview` returns aggregates.
Show security.md: AES-GCM, MFA, ownership, signed webhooks, and redacted telemetry.

## 4:00–4:40 — Logs, metrics, traces

```bash
docker compose logs --tail=15 api worker
curl -s http://localhost:9100/metrics | rg 'amrutam_(http|booking|payment)'
```

Logs show `requestId`, method, normalized route, status, `durationMs`, and trace IDs.
Prometheus shows both targets UP. In Jaeger choose `amrutam-api`, operation `booking.claim_slot`
or `payment.apply_event`; open a trace with PostgreSQL spans. Allow several seconds for export.

## 4:40–5:00 — Engineering proof

Show completed CI and docs/rehearsal.md. Mention verified payment failure/expiry compensation,
forged/duplicate webhooks, encrypted storage, and 51 unit + 16 integration tests.
The human records/submits the video. No production SLO benchmark is claimed.

## Extra rehearsal checks (off camera)

- Create another slot/booking, simulate `FAILED`, verify consultation `EXPIRED` and public slot
  availability. Do not reuse the completed booking.
- Cancellation before start releases the slot and expires/refunds the mock payment.
- Unrelated patients and admins receive `403` on consultation/prescription reads.
- Refresh rotates the token; logout revokes it; refresh afterward returns `401`.
- `npm run test:integration` proves concurrency, signatures/deduplication, and encrypted storage.
  Never manually age database rows outside a disposable rehearsal database.
- Safe database evidence, showing booleans/counts instead of protected content:

```bash
docker compose exec -T postgres psql -U amrutam -d amrutam -c \
  "SELECT count(*) AS prescriptions, bool_and(content_enc NOT LIKE '%Demo prescription only%') AS encrypted, bool_and(enc_key_version IS NOT NULL) AS versioned FROM prescriptions;"
docker compose exec -T postgres psql -U amrutam -d amrutam -c \
  "SELECT action, count(*) FROM audit_logs GROUP BY action ORDER BY action;"
```

Keep earlier terminal commands/scrollback off camera. Clear Swagger authorization after the demo.
