import time
from typing import Optional, List, Dict, Any
import redis
import fakeredis

from app.core.config import settings
from app.core.logging import logger

EMAIL_QUEUE_NAME = "queue:email_jobs"
DEAD_LETTER_QUEUE_NAME = "queue:dead_letter"


class QueueService:
    """
    Redis Queue Interface for background asynchronous worker jobs.
    Uses real Redis by default, with automatic fallback handling.
    """

    def __init__(self):
        self.redis_client = None
        self._init_client()

    def _init_client(self):
        try:
            client = redis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            client.ping()
            self.redis_client = client
            self.is_real_redis = True
            logger.info(f"QueueService connected to native Redis at {settings.REDIS_URL}")
        except Exception as exc:
            logger.warning(
                f"Native Redis unavailable ({exc}). Initializing in-memory Queue fallback via fakeredis."
            )
            self.redis_client = fakeredis.FakeRedis(decode_responses=True)
            self.is_real_redis = False

    def enqueue_job(self, job_id: int, queue_name: str = EMAIL_QUEUE_NAME) -> bool:
        try:
            self.redis_client.rpush(queue_name, str(job_id))
            return True
        except Exception as exc:
            logger.error(f"Failed to enqueue job {job_id} into {queue_name}: {exc}")
            return False

    def dequeue_job(self, queue_name: str = EMAIL_QUEUE_NAME, timeout: int = 1) -> Optional[int]:
        try:
            # BLPOP returns a tuple of (queue_name, value) or None
            res = self.redis_client.blpop([queue_name], timeout=timeout)
            if res and len(res) == 2:
                return int(res[1])
            return None
        except Exception as exc:
            logger.error(f"Failed to dequeue from {queue_name}: {exc}")
            return None

    def push_dead_letter(self, job_id: int) -> bool:
        return self.enqueue_job(job_id, queue_name=DEAD_LETTER_QUEUE_NAME)

    def get_queue_length(self, queue_name: str = EMAIL_QUEUE_NAME) -> int:
        try:
            return self.redis_client.llen(queue_name)
        except Exception:
            return 0

    def get_dead_letter_count(self) -> int:
        return self.get_queue_length(DEAD_LETTER_QUEUE_NAME)

    def get_dead_letter_job_ids(self, limit: int = 100) -> List[int]:
        try:
            items = self.redis_client.lrange(DEAD_LETTER_QUEUE_NAME, 0, limit - 1)
            return [int(x) for x in items if x.isdigit()]
        except Exception:
            return []

    def requeue_job(self, job_id: int) -> bool:
        try:
            # Remove from dead-letter if present
            self.redis_client.lrem(DEAD_LETTER_QUEUE_NAME, 0, str(job_id))
            # Push back to active email queue
            self.redis_client.rpush(EMAIL_QUEUE_NAME, str(job_id))
            return True
        except Exception as exc:
            logger.error(f"Failed to requeue job {job_id}: {exc}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        try:
            ping_start = time.time()
            self.redis_client.ping()
            ping_latency_ms = round((time.time() - ping_start) * 1000, 2)
            is_connected = True
        except Exception:
            ping_latency_ms = -1
            is_connected = False

        return {
            "is_connected": is_connected,
            "is_real_redis": self.is_real_redis,
            "ping_latency_ms": ping_latency_ms,
            "pending_email_jobs": self.get_queue_length(EMAIL_QUEUE_NAME),
            "dead_letter_jobs": self.get_dead_letter_count(),
        }


queue_service = QueueService()
