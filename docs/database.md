# Database Architecture & Connection Pooling

## 1. Relational Schema Design

```
+-------------------------------------------------------------+
| users                                                       |
+-------------------------------------------------------------+
| id                             INT PRIMARY KEY AUTOINCREMENT |
| email                          VARCHAR(255) UNIQUE NOT NULL  |
| hashed_password                VARCHAR(255) NOT NULL         |
| name                           VARCHAR(255)                  |
| role                           ENUM('USER', 'ADMIN')         |
| is_active                      BOOLEAN DEFAULT TRUE          |
| email_verified                 BOOLEAN DEFAULT FALSE         |
| email_verified_at              TIMESTAMPTZ                   |
| verification_token_hash        VARCHAR(255)                  |
| verification_token_expires_at  TIMESTAMPTZ                   |
| reset_token_hash               VARCHAR(255)                  |
| reset_token_expires_at         TIMESTAMPTZ                   |
| created_at                     TIMESTAMPTZ DEFAULT NOW()     |
| updated_at                     TIMESTAMPTZ DEFAULT NOW()     |
+-------------------------------------------------------------+
          │
          │ 1:N (Foreign Key: owner_id -> users.id, ON DELETE CASCADE)
          ▼
+-------------------------------------------------------------+
| demo_items                                                  |
+-------------------------------------------------------------+
| id                             INT PRIMARY KEY AUTOINCREMENT |
| title                          VARCHAR(255) NOT NULL         |
| description                    TEXT                          |
| status                         VARCHAR(50) DEFAULT 'active'  |
| counter                        INT DEFAULT 0                 |
| version                        INT DEFAULT 1                 |
| owner_id                       INT NOT NULL REFERENCES users |
| created_at                     TIMESTAMPTZ DEFAULT NOW()     |
| updated_at                     TIMESTAMPTZ DEFAULT NOW()     |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
| revoked_tokens                                              |
+-------------------------------------------------------------+
| id                             INT PRIMARY KEY AUTOINCREMENT |
| jti                            VARCHAR(64) UNIQUE NOT NULL   |
| revoked_at                     TIMESTAMPTZ DEFAULT NOW()     |
| expires_at                     TIMESTAMPTZ NOT NULL          |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
| idempotency_records                                         |
+-------------------------------------------------------------+
| id                             INT PRIMARY KEY AUTOINCREMENT |
| idempotency_key                VARCHAR(128) UNIQUE NOT NULL  |
| user_id                        INT REFERENCES users(id)      |
| status_code                    INT NOT NULL                  |
| response_body                  TEXT NOT NULL                 |
| created_at                     TIMESTAMPTZ DEFAULT NOW()     |
+-------------------------------------------------------------+
```

---

## 2. Connection Pooling (QueuePool)

### Why Connection Pooling is Critical
Creating a new PostgreSQL TCP connection requires:
1. TCP 3-way handshake (SYN, SYN-ACK, ACK)
2. TLS handshake (certificates and key exchange)
3. PostgreSQL backend authentication and session fork
4. Allocation of memory on the PostgreSQL server per process

Without pooling, 500 concurrent requests would initiate 500 parallel connection handshakes, causing CPU spikes, high memory consumption, and potential socket exhaustion (`FATAL: remaining connection slots are reserved for non-replication superuser connections`).

### Configuration
```python
engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,          # Number of permanent persistent connections
    max_overflow=10,      # Temporary surge connections under burst load
    pool_timeout=30.0,    # Seconds to wait for a connection before raising TimeoutError
    pool_recycle=1800,    # Recycle connections every 30 minutes to prevent stale sockets
    pool_pre_ping=True,   # Validates socket health before handing connection to worker
)
```

---

## 3. Schema Migrations with Alembic

### The Problem Migrations Solve
Without version-controlled schema migrations:
- Developers modify local database tables manually.
- Staging and production drift out of sync.
- Rollbacks are manual, error-prone, and risk data corruption.

### How Alembic Works
1. `alembic/versions/` stores sequential Python migration scripts.
2. The `alembic_version` table in PostgreSQL tracks the current schema revision ID.
3. On deployment, `alembic upgrade head` inspects the delta between the database revision and the repository head, running only the needed upgrades inside a single transactional block.
