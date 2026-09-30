# Production Security Hardening

## 1. Threat Mitigation Matrix

| Attack Vector | Vulnerability | Defense Implemented in Platform |
| :--- | :--- | :--- |
| **Brute-Force & Credential Stuffing** | Rapid automated password guessing | Sliding-window IP rate limiter (`429 Too Many Requests` + `Retry-After`) |
| **Credential Timing Attacks** | User enumeration via timing differences | Constant-time dummy Argon2id verification when user is not found |
| **SQL Injection** | Unsanitized user inputs in queries | Parameterized queries enforced via SQLAlchemy ORM |
| **Insecure Direct Object References** | Users reading/modifying other users' records | Explicit `owner_id == current_user.id` verification on every resource |
| **Cross-Origin Abuse** | Malicious third-party scripts fetching API | Explicit CORS whitelist with allowed headers, methods, and credentials |
| **Token Hijacking & Replay** | Reusing leaked or old tokens | Short token lifespan (60m) + JTI revocation on logout + HTTPS |
| **Information Disclosure** | Stack traces leaking library versions/paths | Custom exception handlers returning clean JSON without stack traces |
| **Double-Submit / Network Retries** | Duplicate order/item creations | `Idempotency-Key` header with cached response replay |

---

## 2. Rate Limiting Mechanics

The platform implements a sliding-window rate limiter in `app/core/rate_limit.py`:
- Tracks timestamped events per IP address.
- Automatically discards entries older than the evaluation window (e.g. 60 seconds).
- Returns HTTP 429 with standard `Retry-After` header when limit is exceeded.
- Resets automatically once the rate cools down.
