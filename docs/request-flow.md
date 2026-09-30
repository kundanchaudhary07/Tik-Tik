# Request Flow: Step-by-Step Lifecycle

## The Complete Path of an HTTP Request

This document follows a request from a user's browser all the way to PostgreSQL and back.

```
[Browser Client]
       │
   (1) │ DNS resolution -> TCP Handshake -> TLS Handshake
       ▼
[Port 3000: Vite Proxy / Gateway]
       │
   (2) │ Forwards /auth, /api, /health to 127.0.0.1:8001
       ▼
[Port 8001: Uvicorn ASGI Server]
       │
   (3) │ Parses HTTP wire protocol, headers, body stream
       ▼
[FastAPI Application Pipeline]
       │
   (4) │ Middleware 1: Logging & Request ID
       │   - Generates or reads `X-Request-ID`
       │   - Starts microsecond latency timer
       ▼
   (5) │ Middleware 2: CORS Header Verification
       │   - Validates Origin against whitelist
       │   - Handles OPTIONS preflight requests
       ▼
   (6) │ Router Matching
       │   - Compares HTTP Method (POST) and Path (/auth/login)
       │   - Extracts path, query, and header parameters
       ▼
   (7) │ Dependency Injection: Rate Limiter
       │   - Computes sliding window counter for client IP
       │   - If count > limit: Raises HTTP 429 Too Many Requests
       ▼
   (8) │ Pydantic Input Validation
       │   - Parses JSON body against `LoginRequest` schema
       │   - Validates email syntax and string length
       │   - If invalid: Raises HTTP 422 Unprocessable Content
       ▼
   (9) │ Dependency Injection: Database Session
       │   - Fetches available connection from SQLAlchemy QueuePool
       │   - Begins database transaction
       ▼
  (10) │ Authentication & Security Logic
       │   - Queries user by email in PostgreSQL
       │   - Invokes Argon2id constant-time password verification
       │   - If mismatch: Constant-time dummy verification + HTTP 401
       │   - Generates JWT access token with unique `jti` claim
       ▼
  (11) │ Database Commit & Session Teardown
       │   - Session committed and returned to pool
       ▼
  (12) │ Response Formatting
       │   - Serializes Pydantic response model to JSON
       ▼
  (13) │ Middleware Response Phase
       │   - Attaches `X-Request-ID` and timing headers
       │   - Emits structured JSON log line with latency
       ▼
  (14) │ Uvicorn serializes HTTP response bytes
       ▼
  (15) │ Browser parses JSON and updates application state
```

---

## What Happens When Components Fail?

1. **Database connection failure during step 9/10:**
   - SQLAlchemy raises `OperationalError`.
   - FastAPI exception handler catches it, rolls back any partial state, and returns HTTP 500 with a structured error JSON containing the `request_id`.
   - The user sees "An internal server error occurred" while operators search the logs using `request_id`.

2. **Validation failure during step 8:**
   - Pydantic immediately halts execution before any database call is made.
   - Returns HTTP 422 with exact field names that failed validation.

3. **CORS rejection during step 5:**
   - Request from an unauthorized origin is blocked without executing backend business logic.
