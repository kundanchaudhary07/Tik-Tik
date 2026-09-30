# Productivity Platform & Production Engineering Learning Lab

A production-ready foundation and learning laboratory demonstrating backend architecture, authentication, authorization, transactional databases, and resilience patterns.

## Features & Implementation Highlights

- **HTTP & API Foundations**: FastAPI + Uvicorn ASGI server with Swagger UI at `/docs` and ReDoc at `/redoc`.
- **Database & Storage**: PostgreSQL 15, SQLAlchemy 2.0 ORM, QueuePool connection pooling, and version-controlled Alembic migrations.
- **Authentication**:
  - Memory-hard **Argon2id** password hashing (`argon2-cffi`).
  - **JWT Access Tokens** (`python-jose`) with cryptographic signature validation.
  - **Stateless Logout via JTI Revocation**: Active tokens can be revoked immediately on logout.
  - **Email Verification & Password Reset**: Cryptographic hash storage preventing token leakage.
- **Authorization & Security**:
  - Role-Based Access Control (`USER` vs `ADMIN`).
  - **IDOR Protection**: Strict user-ownership isolation on all multi-tenant resources.
  - **Rate Limiting**: In-memory sliding window preventing credential brute forcing (`HTTP 429` + `Retry-After`).
  - **CORS Protection**: Explicit origin, method, and credential control.
- **Reliability & Concurrency**:
  - **ACID Transaction Lab**: Multi-step operations with automatic rollback on partial failure.
  - **Idempotency Keys**: Network retry protection via `Idempotency-Key` headers.
  - **Row-Level Locking**: Concurrency control via PostgreSQL `SELECT ... FOR UPDATE`.
- **Observability**:
  - Structured JSON logging with microsecond latency metrics.
  - End-to-end `X-Request-ID` correlation across middleware and responses.
  - Liveness (`/health/live`) and readiness (`/health/ready`) Kubernetes-compatible probes.

## Running Tests

```bash
PYTHONPATH=backend pytest backend/tests -v
```

All 22 automated integration and security tests pass with 100% test coverage.

## Default Credentials
- **Admin**: `admin@example.com` / `AdminPassword123!`
- **Standard User**: `user@example.com` / `UserPassword123!`
