# Amrutam Telemedicine Backend

Production-oriented TypeScript backend for the Amrutam telemedicine assignment. The repository
is being delivered milestone by milestone; M0 establishes the HTTP, test, container, and CI
foundation without pulling domain features forward.

## Current scope

- Node.js 22.22+, TypeScript strict mode, Express 5.
- Zod-validated configuration and fail-fast startup.
- Pino JSON logs with request correlation and redaction.
- `/health/live` process liveness and `/health/ready` Postgres/Redis reachability.
- Vitest, Supertest, Testcontainers harness, Docker, and GitHub Actions skeleton.

See [delivery progress](docs/PROGRESS.md) for verified results and current limitations.

## Local setup

Prerequisites: Node.js 22.22+ LTS, npm, Docker, and Docker Compose.

```bash
cp .env.example .env
npm ci
npm run lint
npm run typecheck
npm test
docker compose up --build
```

The API listens on `http://localhost:3000`:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

## Development commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
npm run test:unit
npm run test:integration
```

Database migrations, authentication, booking, OpenAPI, observability, Terraform, and the final
security documentation are delivered in later milestones defined in `AGENTS.md`.
