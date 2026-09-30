# Phase 1 Architecture Overview

## 1. System Context & High-Level Diagram

The Universal Productivity Platform Learning Lab (Phase 1) is structured as a layered production architecture:

```
[ Browser / Mobile Client ]
           │
           │ HTTPS / HTTP (JSON payloads)
           ▼
[ Vite Development / Static Gateway (Port 3000) ]
           │
           │ Reverse Proxy
           ▼
[ Uvicorn ASGI Server (Port 8001) ]
           │
           ▼
[ FastAPI Framework ]
     ├── Request ID & Structured Logging Middleware
     ├── CORS Middleware (Cross-Origin Resource Sharing)
     ├── Rate Limiting (In-Memory Sliding Window)
     ├── Authentication & Token Validation (Argon2id + JWT)
     ├── Role-Based Authorization (USER vs. ADMIN)
     ├── Business Logic Services (AuthService, EmailService)
     └── SQLAlchemy 2.0 ORM
           │
           ▼
[ Connection Pool (QueuePool, size=5, max_overflow=10) ]
           │
           ▼
[ PostgreSQL 15 Relational Database ]
     ├── users (Credentials, Verification, Passwords)
     ├── revoked_tokens (Blacklisted JTIs)
     ├── demo_items (Owner Foreign Key, Concurrency Versions)
     ├── idempotency_records (Duplicate Prevention)
     └── alembic_version (Schema Migration State)
```

---

## 2. Component Breakdown

### 2.1 The Browser & Frontend (React + TypeScript + Vite)
- **Why does it exist?** Provides the visual interface, input forms, state management, and real-time interaction for users on desktop and mobile browsers.
- **What problem does it solve?** Enables humans to interact with the platform without constructing manual HTTP requests or issuing raw database queries.
- **How does it work?** React compiles TSX into a virtual DOM, manages authentication state (`AuthContext`), handles client-side routing, and issues async `fetch` calls to backend endpoints.
- **What can fail?** Network timeouts, stale cached tokens, invalid user input, CORS rejections.
- **Detection & Recovery:** Global fetch interceptor catches HTTP 401/403/422/429/500 and presents user-friendly error banners without crashing the UI.

### 2.2 Uvicorn (ASGI Web Server)
- **Why does it exist?** Python code cannot directly listen on raw TCP sockets and understand the ASGI (Asynchronous Server Gateway Interface) protocol without a web server.
- **What problem does it solve?** Handles TCP connections, HTTP/1.1 parsing, keep-alive sockets, SSL termination, and concurrency event loops (uvloop).
- **How does it work?** Accepts incoming TCP socket connections, parses HTTP request lines/headers, constructs ASGI scopes and receive/send callables, and invokes the FastAPI application.
- **What can fail?** Socket exhaustion, worker crashes, unhandled OS signals.
- **At Larger Scale:** Run multiple Uvicorn worker processes behind an NGINX reverse proxy or AWS Application Load Balancer with auto-scaling.

### 2.3 FastAPI Framework
- **Why does it exist?** Translates raw HTTP requests into validated Python objects and orchestrates routing, dependencies, and responses.
- **What problem does it solve?** Eliminates boilerplate manual parsing, validates inputs via Pydantic, generates interactive OpenAPI documentation (`/docs`), and enforces modular dependency injection (`Depends()`).
- **How does it work?** Uses Python type annotations to validate payloads, match route patterns, inject database sessions, and serialize JSON responses.

### 2.4 SQLAlchemy 2.0 ORM & Connection Pool
- **Why does it exist?** Object-Relational Mapping decouples application business logic from raw SQL syntax dialect differences.
- **What problem does it solve?** Eliminates SQL injection risks (via parameterized statements), manages transactional boundaries, and maintains a pool of reusable TCP connections to avoid the high overhead of establishing a new database connection on every request.
- **How does it work?** Engine creates a `QueuePool`. `get_db()` borrows a session from the pool for the request duration, commits/rolls back, and returns the connection to the pool upon completion.

### 2.5 PostgreSQL 15 Relational Database
- **Why does it exist?** Provides durable, ACID-compliant, persistent relational storage.
- **What problem does it solve?** Protects data integrity with constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY with CASCADE), row-level locks, and write-ahead logging (WAL).
