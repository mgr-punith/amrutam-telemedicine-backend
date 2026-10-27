# ADR 0001: Modular Express foundation with manual dependency injection

- Status: Accepted
- Date: 2026-10-27

Express 5 is the fixed HTTP framework, but route handlers must remain transport-only as the
domain grows. The application is therefore assembled in `src/container.ts`: controllers and
services receive dependencies through constructors, while `src/app.ts` only configures HTTP
middleware and routes. Health readiness checks use the same injected interface, which keeps
tests deterministic and leaves database/client choices replaceable in later milestones.

This adds a little explicit wiring, but avoids a decorator-based DI framework, hidden runtime
state, and hard-to-test global clients. M0 uses TCP reachability for Postgres and Redis; M1 will
replace those checks with the real clients while preserving the health service contract.
