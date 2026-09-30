# Authentication Architecture

## 1. Password Hashing with Argon2id

### Why Argon2id?
- **MD5 / SHA-256 / SHA-512**: Designed for high-throughput checksums. Dedicated GPUs and ASICs can compute billions of SHA-256 hashes per second, making brute-force cracking trivial.
- **bcrypt**: CPU-bound and resistant to GPU cracking, but has a 72-byte password length truncation limit and does not require large memory.
- **Argon2id (Winner of the Password Hashing Competition)**: Combines data-dependent and data-independent memory access. It is **memory-hard**, meaning an attacker cannot parallelize cracking on specialized hardware without allocating vast amounts of physical RAM.

### Configuration
```python
PasswordHasher(
    time_cost=3,       # Iterations over memory
    memory_cost=65536, # 64 Megabytes of RAM per hash
    parallelism=4,     # 4 concurrent threads
    hash_len=32,       # Output length
    salt_len=16,       # Random cryptographic salt
)
```

---

## 2. JWT Access Tokens & Lifecycle

### Token Structure
- **Header:** Algorithm (`HS256`), Type (`JWT`)
- **Payload:**
  - `sub`: User ID (subject)
  - `role`: Role (`USER` or `ADMIN`)
  - `jti`: Unique random token ID (UUID4)
  - `exp`: Expiration timestamp (default: 60 minutes)
  - `iat`: Issued-at timestamp
- **Signature:** HMAC-SHA256(Base64(Header) + "." + Base64(Payload), SECRET_KEY)

### Security Features
1. **Stateless Verification:** Microservices or API instances verify tokens without hitting the database on every read, checking cryptographic signature and expiration.
2. **Stateless Logout via `jti` Revocation:**
   - Standard JWTs cannot be revoked until expiration.
   - We implement a hybrid model: upon `/auth/logout`, the token's unique `jti` is written to the `revoked_tokens` table.
   - Subsequent authenticated requests verify that the `jti` is not in the revoked list.
3. **Email Verification & Password Reset Tokens:**
   - Generated as 32-byte cryptographic random hex strings (`secrets.token_urlsafe(32)`).
   - Only the **SHA-256 hash** of the token is stored in the database.
   - If the database is compromised, attackers cannot use the stored hash to reset user passwords.
   - Single-use and time-limited (24 hours for email verification, 1 hour for password reset).
