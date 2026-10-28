# Local testing guide — start with `npm run dev`

Follow one numbered step at a time. Check the expected result before continuing.
This guide uses your existing local `.env`, installed dependencies, and Docker database.
Keep passwords, tokens, MFA secrets, and recovery codes out of this file.

This file is excluded locally by `.git/info/exclude`. Normal `git add .` will skip it.
The exclusion stays on this machine; it is not part of the repository on GitHub.

## 1. Start the API

In a terminal opened at `/home/puneet/zix/task/vedic`, run:

```bash
npm run dev
```

Expected: logs saying `HTTP server started` on port `3000` and
`Prometheus metrics server started` on port `9100`.

**Leave this terminal running.** A server waiting here is normal; it does not return to the prompt.
Use a second terminal for the commands below.

If it fails because `DATABASE_URL` or `REDIS_URL` is missing, or tries to connect to Docker-only
hostnames `postgres`/`redis`, press **Ctrl+C** in this terminal. Run each command separately:

```bash
export DATABASE_URL='postgresql://amrutam:amrutam@localhost:5432/amrutam'
```

```bash
export REDIS_URL='redis://localhost:6379'
```

```bash
npm run dev
```

Exports apply only to that terminal. Repeat them when starting the API from a new terminal.
They do not overwrite `.env`. For missing dependencies or an unconfigured `.env`, see
[First-time setup](#first-time-setup-only-if-needed).

## 2. Check readiness

In the second terminal, from the project folder:

```bash
curl -i http://localhost:3000/health/ready
```

Expected: `200 OK` and:

```json
{ "status": "ready", "checks": { "postgres": "up", "redis": "up" } }
```

If you see `503` with either dependency `down`, run:

```bash
docker compose up -d postgres redis
```

Then run the readiness command again. If it still fails, check the localhost exports in step 1.

## 3. Apply database migrations

Run in the second terminal:

```bash
DATABASE_URL='postgresql://amrutam:amrutam@localhost:5432/amrutam' npm run db:migrate
```

Expected: migrations applied successfully, or `No pending migrations to apply.`
An update notice from Prisma does not mean the migration failed.

## 4. Seed the demo accounts if needed

If the three demo accounts already exist and you have seeded successfully, continue to step 5.
For an unseeded local demo database, run:

```bash
DATABASE_URL='postgresql://amrutam:amrutam@localhost:5432/amrutam' npm run db:seed
```

Expected: the command finishes without an error. A quiet successful exit is normal.
Seeding updates the demo users' credentials/MFA from `.env`; it is not a database reset and
does not make a previously booked slot available again.

| Account | Email                   | Password                            | MFA                       |
| ------- | ----------------------- | ----------------------------------- | ------------------------- |
| Patient | `patient@amrutam.local` | Local `AMRUTAM_DEMO_PASSWORD` value | No                        |
| Doctor  | `doctor@amrutam.local`  | Same local value                    | Already activated by seed |
| Admin   | `admin@amrutam.local`   | Same local value                    | Already activated by seed |

Open `.env` privately in your editor when you need the password. Enter its actual value in
Swagger, not the text `AMRUTAM_DEMO_PASSWORD`.

## 5. Open Swagger

Open <http://localhost:3000/docs> in your browser.

For each operation below: expand the endpoint, click **Try it out**, enter the fields,
and click **Execute**. Read the actual server **Response body** and **Code**, not the static
example response underneath the endpoint.

Two authorization boxes are used:

| Swagger box    | Paste this value | Purpose                                                  |
| -------------- | ---------------- | -------------------------------------------------------- |
| `accessBearer` | `accessToken`    | Bookings, consultations, prescriptions, admin operations |
| `mfaBearer`    | `mfaToken`       | MFA enrollment, activation, or login verification        |

Paste only the token value, without quotes and without a `Bearer` prefix.
Swagger adds that prefix automatically.

**Logging in does not automatically update Swagger authorization.** Whenever you change accounts,
click **Authorize**, **Logout** next to the existing relevant box, paste the new token,
click **Authorize**, then **Close**. Logout inside this dialog just clears Swagger's token;
the API logout endpoint is a separate operation.

## 6. Log in as the patient

Open **POST `/api/v1/auth/login`**. Replace the password placeholder:

```json
{
  "email": "patient@amrutam.local",
  "password": "<your local demo password>"
}
```

Expected: `200`, `mfaRequired: false`, an `accessToken`, and a `refreshToken`.
Keep the tokens privately for this session. Access tokens normally last **15 minutes**.

## 7. Authorize the patient

Click **Authorize** and paste the patient's `accessToken` into **accessBearer**.
Click **Authorize**, then **Close**.

Do not put the refresh token in either Swagger authorization box.

## 8. Search for doctors

Open **GET `/api/v1/doctors`**.
Set `city` to `Bengaluru` and `language` to `English`. Leave other optional fields unset.
Click **Execute**.

Expected: `200` with a `doctors` array containing the seeded verified doctor.
You can also test `search`, `specialization`, and `maxFeeMinor`.
For this doctor, `75000` minor units means **₹750**, not ₹75,000.

## 9. Get the doctor's profile

Open **GET `/api/v1/doctors/{id}`**. Enter this doctor ID:

```text
20000000-0000-4000-8000-000000000002
```

Expected: `200`, the doctor profile, and `verificationStatus: "VERIFIED"`.
This doctor profile ID is different from the doctor's user ID.

## 10. List the doctor's available slots

Open **GET `/api/v1/doctors/{id}/slots`** with the same doctor ID.
Leave `from` and `to` unset for the first call.

Expected: `200` with a `slots` array. Available slots have `status: "AVAILABLE"`.
An empty array can mean the existing slots have been used; step 20 creates another slot.

We will prepare admin and doctor authorization before booking, so MFA setup does not consume
the booking's ten-minute payment hold.

## 11. Log in as the admin

Open **POST `/api/v1/auth/login`**:

```json
{
  "email": "admin@amrutam.local",
  "password": "<your local demo password>"
}
```

Expected: `200`, `mfaRequired: true`, `mfaEnrollmentRequired: false`, and an `mfaToken`.
If you see `mfaRequired: false`, check that you executed the admin request and are looking at
its new response. The seeded admin requires MFA.

## 12. Authorize the admin's MFA challenge

In **Authorize**, put the admin login's `mfaToken` in **mfaBearer**.
An MFA challenge token cannot authorize bookings or admin analytics.

## 13. Generate the current demo MFA code

In the second terminal:

```bash
npm run --silent demo:totp
```

Expected: a six-digit code. Keep any leading zero. Use it promptly; it changes about every
30 seconds. This helper uses the local seeded demo secret.

## 14. Verify admin MFA

Open **POST `/api/v1/auth/mfa/verify`**. Replace the entire example body with:

```json
{
  "code": "<current six-digit code>"
}
```

Replace the placeholder with the code from step 13. **Remove `recoveryCode` entirely.**
The request accepts exactly one of `code` or `recoveryCode`, never both.

Expected: `200`, an `accessToken`, and a `refreshToken`.
Keep these privately as the admin tokens.

A recovery code is a one-use backup returned during MFA activation. You cannot invent one,
and Swagger's `stringstring` example is not a valid recovery code.

## 15. Authorize the admin

Replace **accessBearer** with the `accessToken` returned by step 14.
You are now authorized as admin. The seeded admin already has MFA activated, so you do not
need to call enroll or activate. See the optional MFA section for a newly provisioned account.

## 16. Log in as the doctor

Open **POST `/api/v1/auth/login`**:

```json
{
  "email": "doctor@amrutam.local",
  "password": "<your local demo password>"
}
```

Expected: `200`, `mfaRequired: true`, `mfaEnrollmentRequired: false`, and an `mfaToken`.

## 17. Authorize the doctor's MFA challenge

Replace **mfaBearer** with the doctor's `mfaToken` from step 16.

## 18. Generate a fresh code for doctor login

```bash
npm run --silent demo:totp
```

The local seed gives doctor and admin the same demo secret. That is why this helper works
for both seeded accounts. A separately enrolled account uses its own authenticator instead.

## 19. Verify doctor MFA and authorize the doctor

Execute **POST `/api/v1/auth/mfa/verify`** with only:

```json
{
  "code": "<current six-digit code>"
}
```

Expected: `200` with session tokens. Keep them privately as the doctor tokens.
Replace **accessBearer** with this doctor's `accessToken`.

## 20. Create a fresh availability slot

Open **POST `/api/v1/availability/slots`** as the doctor.
In the `Idempotency-Key` header field, enter:

```text
local-run1-slot-001
```

Use a future time that does not overlap another slot. For example:

```json
{
  "startTime": "2031-06-01T10:00:00.000Z",
  "endTime": "2031-06-01T10:30:00.000Z"
}
```

Expected: `201` with a new slot `id` and `status: "AVAILABLE"`.
Keep that ID as `SLOT_ID`. On another run, choose a different future time and change the
key, for example to `local-run2-slot-001`. `Z` in the timestamp means UTC.

An idempotency key is a request label you choose. It is not a password or something supplied
by the server. This API accepts 8–128 characters from letters, digits, `.`, `_`, `:`, and `-`.
Use a new key for each new operation; keep the same key when retrying that exact operation.

## 21. Switch back to the patient

Replace **accessBearer** with the patient access token from step 6.
If more than 15 minutes have passed, repeat patient login and use its new access token.

## 22. Book the slot

Open **POST `/api/v1/consultations`**.
Enter this `Idempotency-Key`:

```text
local-run1-booking-001
```

Replace the placeholder with the actual slot ID from step 20:

```json
{
  "slotId": "<SLOT_ID>",
  "mode": "VIDEO"
}
```

Expected: `201`, consultation `status: "PENDING_PAYMENT"`, and payment `status: "PENDING"`.
Keep these response values:

| Response field | Label used below  |
| -------------- | ----------------- |
| Top-level `id` | `CONSULTATION_ID` |
| `payment.id`   | `PAYMENT_ID`      |
| `slotId`       | `SLOT_ID`         |

Use IDs returned by this run. Do not use an old conversation's booking or payment IDs for a new booking.
Complete payment soon; an unpaid hold can expire after ten minutes when the worker processes it.

## 23. Replay the same booking safely

Click **Execute** again with the **same patient, same key, and same body**.

Expected: the same `201` response and IDs, with `idempotency-replayed: true` in the response
headers. No second booking is created.

## 24. Check protection against reusing a key for another request

Keep the same key but change `mode` to `AUDIO`. Execute once.

Expected: `422`, error code `IDEMPOTENCY_KEY_REUSED`.
The original booking is unchanged. Restore the body to `VIDEO` afterward.

## 25. Switch to the admin

Replace **accessBearer** with the admin access token from step 14.
If it expired, repeat admin login, authorize the new MFA token, generate a current code,
verify it, and use the new access token.

## 26. Confirm the mock payment

Open **POST `/api/v1/dev/payments/{id}/simulate`**.

Enter **PAYMENT_ID**, not the consultation ID, in the `id` field.
Use `Idempotency-Key`:

```text
local-run1-payment-001
```

Request body:

```json
{
  "status": "SUCCEEDED"
}
```

Expected: `200`, `received: true`, `paymentStatus: "SUCCEEDED"`.
For the first processing of this pending payment, `duplicate` is normally `false`.

This admin-only simulator is available outside production. No real money moves.
It invokes payment event processing directly. The separate public webhook uses HMAC signature
verification; the simulator alone does not demonstrate that signature check.

## 27. Switch to the doctor

Replace **accessBearer** with the doctor access token from step 19.
If it expired, repeat steps 16–19.

## 28. Check the consultation's current state

Open **GET `/api/v1/consultations/{id}`**. Enter **CONSULTATION_ID**.

Expected: `200`, `status: "CONFIRMED"`, and `payment.status: "SUCCEEDED"`.
If the booking expired, create a fresh slot/booking with new keys and confirm payment promptly.

Use this GET endpoint for the current state. Replaying the original booking request returns
its stored creation response, which can still say `PENDING_PAYMENT` after payment succeeds.

## 29. Start the consultation

Open **POST `/api/v1/consultations/{id}/start`** as the doctor.
Enter **CONSULTATION_ID** and this `Idempotency-Key`:

```text
local-run1-start-001
```

There is **no request body**. Execute.

Expected: `200`, `status: "IN_PROGRESS"`, and a populated `startedAt`.
This changes backend lifecycle state; it does not open a real video call.

## 30. Complete the consultation

Open **POST `/api/v1/consultations/{id}/complete`** as the doctor.
Enter **CONSULTATION_ID** and a different `Idempotency-Key`:

```text
local-run1-complete-001
```

There is **no request body**. Execute.

Expected: `200`, `status: "COMPLETED"`, and a populated `endedAt`.

## 31. Create a synthetic prescription

Open **POST `/api/v1/consultations/{id}/prescriptions`** as the doctor.
Enter **CONSULTATION_ID** and this `Idempotency-Key`:

```text
local-run1-prescription-001
```

Request body:

```json
{
  "content": "Demo prescription only: synthetic rehearsal instructions."
}
```

Expected: `201` with prescription metadata such as `id`, `consultationId`, `version`, and
`createdAt`. The create response intentionally omits the content. Content is encrypted at rest.

## 32. Switch to the patient

Replace **accessBearer** with the patient's current access token.
Log in again if necessary.

## 33. Read the prescription as its patient

Open **GET `/api/v1/consultations/{id}/prescriptions`** with **CONSULTATION_ID**.

Expected: `200`, a `prescriptions` array, and the synthetic `content` entered in step 31.
The API decrypts content only after checking access. The assigned doctor can also read it.

## 34. Check that a patient cannot access admin analytics

Keep patient authorization. Execute **GET `/api/v1/admin/analytics/overview`**.

Expected: `403 FORBIDDEN`. This is a successful authorization test.

## 35. Switch to the admin

Replace **accessBearer** with the admin's current access token.
Complete admin login/MFA again if necessary.

## 36. Check that admin cannot read prescription content

Execute **GET `/api/v1/consultations/{id}/prescriptions`** with **CONSULTATION_ID**.

Expected: `403 FORBIDDEN`. Admin status does not grant access to clinical content.

## 37. View admin analytics

Execute **GET `/api/v1/admin/analytics/overview`** as admin.

Expected: `200` with aggregate counts for users, doctor profiles, consultation statuses,
payments, and prescriptions. Totals reflect everything already in your local database.

This is the business analytics route. It returns JSON in Swagger; there is no separate
business analytics webpage on port `9100`.

## 38. View API metrics

Open <http://localhost:9100/metrics>, or run:

```bash
curl -sS http://localhost:9100/metrics
```

Expected: Prometheus text metrics. The route is **`/metrics`**, not `/`.
Look for `amrutam_http_requests_total`, `amrutam_http_request_duration_seconds`,
`amrutam_booking_attempts_total`, and `amrutam_payment_events_total`.

## 39. View request logs

Look at the first terminal where `npm run dev` is running.
Execute another Swagger GET operation to produce a fresh request log.

Expected: a JSON log with request ID, method, route, status, and duration.
Trace IDs are available when tracing is enabled; see [Traces and graphs](#traces-and-graphs).

## 40. Start the background worker

Open a third terminal in the project folder. Run these separately:

```bash
export DATABASE_URL='postgresql://amrutam:amrutam@localhost:5432/amrutam'
```

```bash
export REDIS_URL='redis://localhost:6379'
```

```bash
METRICS_PORT=9101 AMRUTAM_SERVICE_NAME=amrutam-worker npm run dev:worker
```

Leave this terminal running. Port `9101` prevents a metrics port conflict with the API.
Check <http://localhost:9101/metrics> in the browser.
The worker periodically releases expired unpaid booking holds.

## Additional checks — do these after the main flow

### Register a new patient and check ownership

1. Open **POST `/api/v1/auth/register`**. Use a new synthetic email on each run:

   ```json
   {
     "email": "local.patient.run1@example.com",
     "password": "<choose a private password of at least 12 characters>",
     "fullName": "Local Demo Patient",
     "phone": "+919000001234",
     "dob": "1990-01-15",
     "city": "Bengaluru",
     "languages": ["English"]
   }
   ```

2. Execute. Expect `201` and session tokens. An already registered email returns `409`.
   Registration creates a patient; do not add a `role` field.
3. Replace **accessBearer** with this new patient's access token.
4. GET the earlier patient's **CONSULTATION_ID**. Expect `403`.
5. GET prescriptions for that same ID. Expect `403`.

### Refresh and logout

Use a single account's matching access and refresh tokens throughout this check.

1. Execute **POST `/api/v1/auth/refresh`** with that account's current refresh token:

   ```json
   {
     "refreshToken": "<current refresh token>"
   }
   ```

2. Expect `200` with a new access token and a **replacement refresh token**. Keep both privately.
   The old refresh token is no longer valid; reusing it can revoke its token family.
3. Replace **accessBearer** with the newly returned access token.
4. Execute **POST `/api/v1/auth/logout`** with the replacement refresh token in the same body shape.
5. Expect `204` with no response body.
6. Try **POST `/api/v1/auth/refresh`** with that logged-out refresh token. Expect `401`.
7. Clear Swagger authorization when done. Logout revokes the refresh token; an already issued
   access token can remain valid until its expiry.

### MFA enrollment and activation for a new privileged account

The seeded doctor/admin already have MFA enabled. Skip this for those accounts.
This branch applies only when a provisioned doctor/admin login says
`mfaRequired: true` **and** `mfaEnrollmentRequired: true`.

1. Put that login's `mfaToken` in **mfaBearer**.
2. Execute **POST `/api/v1/auth/mfa/enroll`**, with no body. Expect `200`, `secret`, and `otpAuthUri`.
3. Add the returned secret/URI to your authenticator app privately. Use a time-based entry.
4. Execute **POST `/api/v1/auth/mfa/activate`** with only `{"code":"<app's current six-digit code>"}`.
5. Expect `200`, session tokens, and recovery codes. Store recovery codes privately.
6. Put the returned access token in **accessBearer**. Future logins use `/mfa/verify`.

If using a recovery code at login, send only `{"recoveryCode":"<one unused recovery code>"}`
to `/mfa/verify`, with that login's challenge in **mfaBearer**. Remove the `code` field.

### Doctor verification

1. Authorize the admin after MFA.
2. Open **POST `/api/v1/admin/doctors/{id}/verify`**.
3. Enter the doctor profile ID and a new key, for example `local-run1-verify-001`.
4. Execute with no body. Expect `200` and `verificationStatus: "VERIFIED"`.

The seeded doctor is already verified. The integration suite checks the transition from a
pending doctor and denial of slot creation before verification.

### Failed payment compensation

Use a **separate booking**, not the completed consultation from the main flow.

1. As doctor, create another future non-overlapping slot with a new key.
2. As patient, book it with a new key. Keep its consultation ID, payment ID, and slot ID.
3. As admin, simulate that new payment with a new key and `{"status":"FAILED"}`.
4. Expect `200` with `paymentStatus: "FAILED"`.
5. As that patient, GET the new consultation. Expect `status: "EXPIRED"`.
6. GET the doctor's slots. Expect the failed booking's future slot to be available again.

### Cancellation

1. Create a separate slot and book it as patient, using fresh keys.
2. While the consultation is `PENDING_PAYMENT` or `CONFIRMED`, authorize its patient.
3. Open **POST `/api/v1/consultations/{id}/cancel`**, enter that consultation ID and a fresh key.
4. Send `{"reason":"PATIENT_REQUEST"}`.
5. Expect `200`, `status: "CANCELLED"`, and the slot released. A pending payment is expired;
   a succeeded mock payment is marked refunded.

A completed consultation cannot be cancelled through this endpoint.

### Unpaid hold expiry

1. Keep the worker running.
2. Create a separate booking and leave its payment pending.
3. Wait beyond the ten-minute hold plus the worker's scan/queue delay.
4. GET the consultation as its patient. Expect `EXPIRED`; its slot becomes available again.

Do not manually alter database timestamps to force this in your normal local database.

### Check stored prescription and audit evidence

Run after creating the synthetic prescription. This query returns a count and booleans:

```bash
docker compose exec -T postgres psql -U amrutam -d amrutam -c "SELECT count(*) AS prescriptions, bool_and(content_enc NOT LIKE '%Demo prescription only%') AS no_demo_plaintext, bool_and(enc_key_version IS NOT NULL) AS has_key_version FROM prescriptions;"
```

Expected: count greater than zero and both booleans true. A null boolean means there were no rows.
This is a simple storage check; the encryption tests also verify decryption and tamper rejection.

Then list audit action counts:

```bash
docker compose exec -T postgres psql -U amrutam -d amrutam -c "SELECT action, count(*) FROM audit_logs GROUP BY action ORDER BY action;"
```

Expect actions corresponding to the operations you performed, including authentication,
booking/payment, prescription, and admin analytics access. There is no public audit-list endpoint.

## Traces and graphs

### Jaeger traces while using `npm run dev`

1. Start only the trace services in the second terminal:

   ```bash
   docker compose --profile observability up -d jaeger otel-collector
   ```

2. Stop your host API with **Ctrl+C** in its own terminal.
3. In that same terminal, enable the host-reachable exporter:

   ```bash
   export AMRUTAM_OTEL_EXPORTER_ENDPOINT='http://localhost:4318/v1/traces'
   ```

4. Start the API again:

   ```bash
   npm run dev
   ```

5. Execute Swagger requests. Create another booking/payment with fresh keys to produce new
   `booking.claim_slot` and `payment.apply_event` spans.
6. Open <http://localhost:16686>, choose service `amrutam-api`, and click **Find Traces**.
   Allow a few seconds for export. Requests from before tracing was enabled are not backfilled.

For worker traces, stop the host worker, export that same localhost endpoint in its terminal,
and restart it using the command in step 40.

### Prometheus graphs using the complete Docker stack

The provided Prometheus configuration scrapes Docker names `api:9100` and `worker:9101`.
It will not scrape the host `npm run dev` process using that configuration.
Raw host metrics remain available at `/metrics` without switching modes.

To use the provided graph setup:

1. Stop the host API and host worker with **Ctrl+C** in their respective terminals.
2. In the second terminal, set the container-reachable exporter:

   ```bash
   export AMRUTAM_OTEL_EXPORTER_ENDPOINT='http://otel-collector:4318/v1/traces'
   ```

3. Start the complete stack with the existing local `.env` and volumes:

   ```bash
   docker compose --profile observability up --build -d
   ```

4. Check readiness:

   ```bash
   curl -i http://localhost:3000/health/ready
   ```

5. Open Swagger and make some requests against this API.
6. Open <http://localhost:9090/targets>. After a scrape interval, the API and worker should show `UP`.
7. In Prometheus, execute `amrutam_http_requests_total` to see request counts, or
   `sum(rate(amrutam_http_requests_total[1m]))` for requests per second. Generate traffic and
   allow multiple scrapes before expecting useful rate graphs.
8. Open Jaeger at <http://localhost:16686> for traces. For container logs, run:

   ```bash
   docker compose logs --tail=20 api worker
   ```

Do not start the host API at the same time as the Compose API; both bind ports `3000` and `9100`.
When returning to host mode, stop the Compose API/worker and restore the localhost exporter
from the Jaeger instructions, or disable tracing with `export AMRUTAM_OTEL_EXPORTER_ENDPOINT=`.

## Automated checks

Run each command separately from the repository root. These commands do not commit or push.
Their results on your terminal are the evidence for this run; this guide does not claim they
have just been rerun.

1. Formatting:

   ```bash
   npm run format:check
   ```

2. Lint:

   ```bash
   npm run lint
   ```

3. Type checking:

   ```bash
   npm run typecheck
   ```

4. Unit tests:

   ```bash
   npm test
   ```

5. Integration tests, with Docker running:

   ```bash
   npm run test:integration
   ```

   These use separate Testcontainers databases/Redis. They cover one concurrent booking winner,
   forged/duplicate payment webhooks, compensation, MFA, ownership, and encrypted storage.
   A replayed simulator response is not a replacement for the duplicate-webhook test.

6. Generated OpenAPI consistency:

   ```bash
   npm run openapi:check
   ```

7. Build:

   ```bash
   npm run build
   ```

8. Dependency audit:

   ```bash
   npm audit --audit-level=high
   ```

For Terraform and container scanner commands, use the repository README and
`infra/terraform/README.md`. Local success does not establish the result of a new GitHub CI run.

## Troubleshooting

| Result                                                | What to do                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `401 UNAUTHORIZED` on business endpoint               | Log in again, finish MFA if required, replace **accessBearer** with the returned access token.                                    |
| `401` on MFA verification                             | Check **mfaBearer**, generate a fresh code, and submit only `code`. If the challenge expired, log in again.                       |
| `mfaRequired: false` for supposed admin/doctor        | Verify the email in the submitted request and inspect the newest response, not a previous patient response.                       |
| Validation error with `code` and `recoveryCode`       | Remove one field entirely. Use the real code, not Swagger's example.                                                              |
| `403 FORBIDDEN`                                       | Check which account is in **accessBearer**. Doctor actions require the assigned doctor; patient reads require the owning patient. |
| `400 IDEMPOTENCY_KEY_REQUIRED`                        | Fill the endpoint's header field with a valid 8–128 character key.                                                                |
| `422 IDEMPOTENCY_KEY_REUSED`                          | Restore the exact original request to retry it, or use a new key for a new operation.                                             |
| `409 IDEMPOTENCY_IN_PROGRESS`                         | Let the original request finish, then retry the same request/key.                                                                 |
| `409 SLOT_UNAVAILABLE`                                | Choose another available slot or create a new non-overlapping slot, then use a new booking key.                                   |
| `409` when starting/completing                        | GET the consultation and check its current state and payment. Only `CONFIRMED` can start; only `IN_PROGRESS` can complete.        |
| Prescription create says `CONSULTATION_NOT_COMPLETED` | Complete that consultation as the assigned doctor first.                                                                          |
| `429`                                                 | Wait for the rate-limit window; do not keep clicking Execute.                                                                     |
| Temporarily locked login                              | Check credentials privately and wait for the lock to expire; repeated bad passwords trigger a 15-minute lock.                     |
| `/dev/payments/.../simulate` is `404`                 | Check the path and that this is a development instance; simulation is absent in production.                                       |
| `localhost:9100/` says not found                      | Open `http://localhost:9100/metrics`.                                                                                             |
| `EADDRINUSE` on `3000`/`9100`/`9101`                  | Check your API/worker terminals and `docker compose ps`; stop only this project's duplicate process/service.                      |
| Readiness shows a dependency down                     | Start `postgres redis`; verify host processes use localhost URLs.                                                                 |
| Exporter cannot resolve `otel-collector` from host    | Use `http://localhost:4318/v1/traces` for the host API, or disable tracing until the collector is running.                        |

## First-time setup only if needed

Your current environment has already been set up. These steps are for missing setup only.
Keep an existing `.env` and its encryption keys so existing encrypted records remain readable.

1. Install the locked dependencies:

   ```bash
   npm ci
   ```

2. Create `.env` only if it does not exist:

   ```bash
   test -f .env || cp .env.example .env
   ```

3. **Only for an unconfigured new environment**, generate development values privately:

   ```bash
   npm run security:generate-keys
   ```

4. Copy those generated values into the matching placeholders in `.env` using your editor.
   Do not overwrite working keys merely to repeat the demo.
5. Generate Prisma's client:

   ```bash
   npm run prisma:generate
   ```

6. Start the local dependencies:

   ```bash
   docker compose up -d postgres redis
   ```

7. Return to step 1, use the localhost exports there, then continue through readiness/migrations/seed.

## Stop after testing

1. Press **Ctrl+C** in your host API terminal.
2. Press **Ctrl+C** in your host worker terminal, if you started it.
3. If you started the Compose API/worker, stop those services:

   ```bash
   docker compose stop api worker
   ```

4. If you started telemetry services and are finished with them:

   ```bash
   docker compose --profile observability stop prometheus otel-collector jaeger
   ```

5. PostgreSQL and Redis can stay running. If nothing else needs this project's instances:

   ```bash
   docker compose stop postgres redis
   ```

These stop commands preserve the local data volumes and `.env`.

## Confirm this guide stays local

Run:

```bash
git check-ignore -v LOCAL_TESTING_GUIDE.md
```

Expected: `.git/info/exclude` and the `/LOCAL_TESTING_GUIDE.md` pattern.

Then run:

```bash
git ls-files -- LOCAL_TESTING_GUIDE.md
```

Expected: no output, because the guide is not tracked. Normal `git add .` skips it;
do not use `git add -f` for this file. A new clone does not inherit this local exclusion.

The tracked `docs/demo-script.md` is a separate five-minute submission script. It was included
because `AGENTS.md` explicitly listed it as a required deliverable. This walkthrough does not
remove or publish any files on GitHub.
