# Error Handling & Standard Responses

## 1. Unified JSON Error Format

All errors across the platform adhere to the following schema:

```json
{
  "error": {
    "code": "ERROR_CODE_CONSTANT",
    "message": "Human-readable explanation of the error",
    "details": []
  },
  "request_id": "a1b2c3d4e5f60718"
}
```

### HTTP Status Code Usage

| Code | Meaning | When Used |
| :--- | :--- | :--- |
| **200 OK** | Successful read or non-creation write | GET, PATCH, DELETE operations |
| **201 Created** | Successful resource creation | POST `/auth/register`, POST `/api/demo` |
| **400 Bad Request** | Malformed request or expired token | Invalid reset token, malformed format |
| **401 Unauthorized** | Missing or invalid authentication | Bad password, missing Bearer token |
| **403 Forbidden** | Authenticated but insufficient permissions | Non-admin accessing admin route, IDOR access |
| **404 Not Found** | Resource does not exist | Item ID not found |
| **409 Conflict** | State collision or duplicate key | Email already registered, optimistic concurrency mismatch |
| **422 Unprocessable Content** | Schema or validation failure | Pydantic field constraint violated |
| **429 Too Many Requests** | Rate limit exceeded | > 20 requests per minute on auth endpoints |
| **500 Internal Server Error** | Unexpected unhandled server exception | Database down, uncaught system error |
