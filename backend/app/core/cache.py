from datetime import datetime

class StatsCache:
    def __init__(self):
        self._cache = {}
        self._ttl = 30 # cache in 30 seconds
    
    def get(self, key):
        if key in self._cache:
            data, timestamp = self._cache[key]
            if datetime.now().timestamp() - timestamp < self._ttl:
                return data
        return None
    
    def set(self, key, data):
        self._cache[key] = (data, datetime.now().timestamp())
    
    def clear(self):
        self._cache = {}

global_stats_cache = StatsCache()
