import time
import threading
from services.background_service.src.config import Config

class TokenBucketLimiter:
    def __init__(self, rate_per_minute: int, allow_4k: bool):
        self.capacity = rate_per_minute
        self.tokens = rate_per_minute
        self.allow_4k = allow_4k
        self.lock = threading.Lock()
        self.last_refill = time.monotonic()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.last_refill
        refill = int(elapsed * (self.capacity / 60))
        if refill > 0:
            self.tokens = min(self.capacity, self.tokens + refill)
            self.last_refill = now

    def acquire(self, size):
        self._refill()
        with self.lock:
            if size[0] > 4096 or size[1] > 4096:
                if not self.allow_4k:
                    raise OversizeError('Requested size exceeds 4K and ALLOW_4K is not set')
            if self.tokens > 0:
                self.tokens -= 1
                return True
            raise RateLimitError('Too many requests')

class OversizeError(Exception):
    pass

class RateLimitError(Exception):
    pass
