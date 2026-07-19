from datetime import datetime
import threading

class StatsCache:
    def __init__(self):
        self._cache = {}
        self._ttl = 30 # cache in 30 seconds
        self._lock = threading.Lock()
    
    def get(self, key):
        with self._lock:
            if key in self._cache:
                data, timestamp = self._cache[key]
                if datetime.now().timestamp() - timestamp < self._ttl:
                    return data
        return None
    
    def set(self, key, data):
        with self._lock:
            self._cache[key] = (data, datetime.now().timestamp())
    
    def clear(self):
        with self._lock:
            self._cache = {}

global_stats_cache = StatsCache()
