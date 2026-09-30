import time
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import HTTPException, Request, status


class InMemoryRateLimiter:
    """
    Sliding window in-memory rate limiter for development and educational demonstration.
    Tracks timestamps of requests per client IP / key.
    
    Production Note:
    In a distributed multi-instance deployment, an in-memory dictionary is isolated
    to each container process. For Phase 4/5 scale, Redis with a leaky bucket or
    Redis token bucket algorithm ensures shared rate limits across all replicas.
    """

    def __init__(self, requests_per_minute: int = 15):
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        # key -> list of timestamps
        self.history: Dict[str, List[float]] = defaultdict(list)

    def is_rate_limited(self, key: str) -> Tuple[bool, int]:
        now = time.time()
        window_start = now - self.window_seconds

        # Prune older entries
        valid_timestamps = [ts for ts in self.history[key] if ts > window_start]
        self.history[key] = valid_timestamps

        if len(valid_timestamps) >= self.requests_per_minute:
            oldest = valid_timestamps[0]
            retry_after = max(1, int(oldest + self.window_seconds - now))
            return True, retry_after

        # Record this request
        self.history[key].append(now)
        return False, 0

    def check_request(self, request: Request, custom_key: str = ""):
        client_ip = request.client.host if request.client else "unknown"
        endpoint = request.url.path
        key = f"{client_ip}:{endpoint}" if not custom_key else f"{client_ip}:{custom_key}"

        limited, retry_after = self.is_rate_limited(key)
        if limited:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Too many requests. Please wait {retry_after} seconds before trying again.",
                        "retry_after_seconds": retry_after,
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )


# Global rate limiter instances
auth_rate_limiter = InMemoryRateLimiter(requests_per_minute=20)
general_rate_limiter = InMemoryRateLimiter(requests_per_minute=100)
