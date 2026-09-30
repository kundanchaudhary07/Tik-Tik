# Structured JSON Logging & Observability

## 1. Why JSON Logs?

Traditional unstructured text logs:
```
[2026-09-22 10:00:00] INFO - User 42 logged in from 192.168.1.1 in 14.5ms
```
Parsing this in Datadog, CloudWatch, or Elasticsearch requires brittle regular expressions.

Structured JSON logs:
```json
{
  "timestamp": "2026-09-22T10:00:00.000Z",
  "level": "INFO",
  "logger": "productivity_platform",
  "message": "HTTP POST /auth/login -> 200 (14.5ms)",
  "request_id": "9f8e7d6c5b4a3210",
  "method": "POST",
  "endpoint": "/auth/login",
  "status_code": 200,
  "latency_ms": 14.5,
  "ip": "192.168.1.1"
}
```
Any log aggregator can instantly filter:
`status_code >= 500 AND latency_ms > 200`.

---

## 2. Request Correlation via `X-Request-ID`

Every incoming request is assigned a unique `request_id` (either preserved from the client/proxy header or generated via `secrets.token_hex(8)`).
- Bound to the request state in FastAPI middleware.
- Included in every log record emitted during that request.
- Returned to the client in the `X-Request-ID` response header.
- Returned inside error JSON bodies for zero-friction debugging.
