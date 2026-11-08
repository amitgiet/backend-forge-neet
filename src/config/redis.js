const Redis = (() => {
  try {
    return require('ioredis');
  } catch {
    try {
      return require('redis');
    } catch {
      return null;
    }
  }
})();

class MemoryRedis {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    const val = this.store.get(key);
    return val !== undefined ? String(val) : null;
  }

  async set(key, value, ...args) {
    this.store.set(key, String(value));
    return 'OK';
  }

  async incr(key) {
    const current = parseInt(await this.get(key) || '0', 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    this.ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  duplicate() {
    return this;
  }
}

let client = null;
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
if (Redis) {
  try {
    client = typeof Redis === 'function'
      ? new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy(times) {
            return Math.min(times * 100, 3000);
          }
        })
      : Redis.createClient({ url: redisUrl });
    if (client.on) {
      client.on('error', () => {});
    }
  } catch {
    client = new MemoryRedis();
  }
} else {
  client = new MemoryRedis();
}

module.exports = client;
