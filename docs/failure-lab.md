# Failure Scenarios & Interactive Labs

This platform includes dedicated interactive labs to reproduce, observe, and diagnose real-world production failures.

## 1. Database Transaction Rollback (Step 7)
- **Scenario:** An operation requires creating two related items (A and B). Item A succeeds, but Item B raises a validation or integrity error.
- **Without Transactions:** Item A is left orphaned in the database, causing data inconsistency.
- **With ACID Transactions:** The entire transaction rolls back. Neither Item A nor Item B is saved.
- **Verification:** Run `POST /api/demo/transactions/test` with `{"fail_second_operation": true}`. The response confirms `operation_a_rolled_back: true`.

---

## 2. Insecure Direct Object Reference (Step 12)
- **Scenario:** User A logs in and accesses item `42`. User B logs in and attempts to access `GET /api/demo/42` or `DELETE /api/demo/42`.
- **Detection:** Backend verifies `item.owner_id == current_user.id`.
- **Response:** HTTP 403 Forbidden with `IDOR_PROTECTION_TRIGGERED`. A security audit warning is emitted to structured logs with caller ID and target resource ID.

---

## 3. Rate Limit Flood (Step 17)
- **Scenario:** An attacker runs an automated brute-force script against `/auth/login`.
- **Detection:** Sliding-window counter exceeds 20 requests per minute from that IP.
- **Response:** HTTP 429 Too Many Requests with `Retry-After: 60` header. Protects server CPU and PostgreSQL from authentication overload.

---

## 4. Idempotency Key Replay (Step 18)
- **Scenario:** A mobile user submits an order, network drops right before receiving the response, and the app retries the POST request.
- **Detection:** The backend checks the `idempotency_records` table for `Idempotency-Key: <UUID>`.
- **Response:** The saved response is returned immediately with `X-Idempotency-Replayed: true`. No duplicate item is created.

---

## 5. Concurrency Race Conditions & Row Locking (Step 19)
- **Scenario:** Two simultaneous requests attempt to increment a counter (`counter = counter + 1`).
- **Unprotected:** Both read value `5`, both compute `6`, write `6`. Lost update: final value is 6 instead of 7.
- **Pessimistic Locking (`with_for_update`):** The first transaction acquires a PostgreSQL row-level lock. The second transaction pauses until the first commits, reading the updated value `6` and writing `7`.
