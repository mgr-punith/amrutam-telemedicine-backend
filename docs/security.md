# Security checklist and threat model

## Scope and data classification

This is a security-oriented assignment implementation, not a certification claim. Production use
would additionally require organizational policies, vendor due diligence, incident response,
retention/legal review, and applicable healthcare agreements.

| Data                                      | Classification               | Protection                                                    |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| Passwords, recovery codes, refresh tokens | Credential                   | Argon2id or SHA-256 hashes; never logged                      |
| JWT/MFA/encryption/payment keys           | Secret                       | Environment/Secrets Manager; rotation runbook                 |
| Phone and DOB                             | PII/PHI-adjacent             | AES-256-GCM at rest with key version                          |
| Consultation linkage and prescription     | PHI                          | Ownership checks, encrypted prescription, audit               |
| Doctor license/profile                    | PII/public professional data | RBAC for mutation; bounded public fields                      |
| Payment amount/reference                  | Financial                    | Integer minor units, signed events, safe audit metadata       |
| Logs/metrics/traces                       | Operational                  | No bodies/query values/tokens; opaque IDs only where required |

## Implemented security checklist

- [x] Argon2id passwords; RS256 JWTs with pinned algorithm, issuer, audience, key ID, and short TTL.
- [x] Opaque refresh tokens stored only as hashes, transactional rotation, family revocation on reuse.
- [x] TOTP MFA for doctors/admins; encrypted MFA secret and one-time hashed recovery codes.
- [x] RBAC plus patient/assigned-doctor ownership checks; admins cannot read prescription content.
- [x] AES-256-GCM with random 96-bit IV and versioned keys for phone, DOB, MFA secret, prescription.
- [x] Strict bounded Zod schemas, unknown-field rejection, JSON limit, Helmet, CORS allowlist.
- [x] Auth rate limiting; reference WAF includes managed rules and an IP rate-based rule.
- [x] Idempotency required for authenticated non-auth mutations; no unexpected 5xx is retained.
- [x] Atomic conditional booking, exclusion/unique database constraints, and concurrent-winner test.
- [x] Exact-body HMAC payment webhook verification and concurrent event deduplication.
- [x] Safe audit events for auth, booking, payment, consultation, prescription, and admin analytics.
- [x] JSON logs with request ID, normalized route, status, and duration; no request/response bodies.
- [x] Metrics and traces use normalized route templates and never query strings or prescription data.
- [x] Non-root, read-only runtime container; private reference tasks/databases; encryption in transit.
- [x] CI includes format/lint/typecheck/tests/build/OpenAPI, npm audit, Gitleaks, Trivy, Terraform,
      and Checkov.
- [x] KMS rotation, Secrets Manager, immutable ECR tags, scan-on-push, encrypted logs, VPC flow logs.

## Attack surface

The public surface is HTTPS ALB/WAF to Express endpoints, including auth, doctor search, signed
payment webhook, and non-production Swagger/dev simulator. Internal surfaces are PostgreSQL, Redis,
BullMQ, metrics ports, OTLP collector, and cloud control planes. Swagger and the payment simulator
are disabled in production. Metrics/OTLP ports must remain private. The API never accepts patient
identifiers in query strings; path IDs are opaque UUIDs.

## STRIDE and OWASP threats

| Threat                 | Example                             | Implemented mitigation                                        | Residual/production action                              |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Spoofing               | Stolen password or token            | Argon2id, MFA, signed JWT, short access TTL, refresh rotation | Device/session view and adaptive risk controls          |
| Tampering              | Forged payment or double booking    | HMAC, event dedupe, DB transactions/constraints, idempotency  | Provider mTLS/IP allowlist and reconciliation           |
| Repudiation            | Deny creating prescription/refund   | Request IDs and safe audit events                             | Immutable archive/SIEM and privileged access review     |
| Information disclosure | IDOR, logs/traces leak PHI          | Ownership, admin denial, encryption, normalized telemetry     | DLP monitoring and formal privacy review                |
| Denial of service      | Login flood, expensive search       | Bounds, rate limit, WAF, autoscaling, timeouts                | Redis distributed limiter and load-tested quotas        |
| Elevation of privilege | Patient invokes doctor/admin action | MFA roles, route role guards, service ownership checks        | Periodic authorization tests and access recertification |
| Injection (OWASP)      | SQL/JSON/header injection           | Prisma/parameterized SQL, Zod, Helmet, no unsafe raw SQL      | WAF tuning and SAST/DAST                                |
| Cryptographic failure  | Plaintext PHI or weak key handling  | AES-GCM, KMS reference, TLS, Secrets Manager                  | HSM-backed keys and scheduled rotation evidence         |
| SSRF/supply chain      | Malicious provider URL/package      | No user-defined outbound URLs; lockfile and CI scans          | Egress proxy/allowlist, SBOM signing and provenance     |

## Key and secret rotation

Encryption uses a map of version to 256-bit key plus an active version. To rotate: add the new key,
deploy readers that accept old/new versions, switch the active version, re-encrypt records in bounded
audited batches, verify counts/decryption, then retire the old key after backup retention. Never
delete an old key while ciphertext references it.

JWT rotation uses overlapping signing/public keys and `kid`: publish/accept the new public key,
switch signing, wait beyond the maximum access-token TTL, then retire the old key. Refresh-token
families are unaffected because they are opaque and hashed. Payment webhook secrets require an
overlap period or provider-coordinated cutover. The composite application secret is intentionally not
blindly auto-rotated by Terraform because these changes require dual-key coordination and rollback.

## Logging, audit, retention, and incident response

Logs must not contain request bodies, authorization/cookie headers, email, phone, DOB, prescription,
MFA data, raw tokens, webhook signatures, or SQL values. Metrics use method/normalized route/status;
traces use route templates and workflow status only. Prescription reads and writes are audited, but
audit metadata excludes prescription content. Cloud reference logs retain 365 days; application data
retention and deletion periods require legal approval before production.

On suspected compromise: contain affected credentials/service, preserve encrypted logs/audit and
database snapshots, revoke refresh-token families, rotate relevant secrets/keys, analyze request and
trace IDs, notify authorized stakeholders under the applicable breach process, restore from known
good state, and document corrective actions. Restore and key-rotation exercises should be rehearsed.

## Verified and deferred

Verified locally: unit/integration tests, ciphertext-at-rest checks, IDOR/admin denial, idempotency and
concurrency proof, live dependency audit, full-history Gitleaks scan, Docker build, Terraform validate,
and Checkov. The Gitleaks ignore file contains four exact historical fingerprints: the public RFC 6238
Appendix B test vector and three non-secret idempotency fixtures. The flagged idempotency fixtures
now generate UUIDs at runtime; these exceptions do not suppress new findings. CI scans all fetched Git history using Gitleaks
8.24.3. The runtime image omits npm/npx (retained in build stages), removing ten fixable high findings
from the base image's bundled npm dependencies; Trivy 0.70.0 passed the rebuilt image at the
high/critical threshold with `--ignore-unfixed`.

Deferred: external penetration test, DAST, production SBOM signing, real payment/video providers,
formal HIPAA/DISHA/GDPR assessment, tamper-evident audit archive, automated cross-region restore,
and measured load/SLO validation.
