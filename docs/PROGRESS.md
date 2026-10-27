# Delivery progress

Last updated: 2026-10-27

## M0 — Repository foundation

Status: In progress

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
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- Unit suite: 2 files and 6 tests passed with Vitest 5.0.5.
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
- Docker build and `docker compose up`: Docker daemon access is denied in this sandbox.
- Branch, commit, and pull request: the repository has no configured remote and GitHub CLI
  authentication is currently invalid.

Known limitations:

- M0 readiness proves TCP reachability only. M1 will use real PostgreSQL and Redis client pings.
- Testcontainers currently brings a deprecated `glob@10.5.0` transitively through Archiver. The
  selected Testcontainers release is current and the offline security audit reports no advisory.
- All later milestones (schema/auth through infrastructure/docs) remain unstarted.
