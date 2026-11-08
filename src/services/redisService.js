let Redis;
try {
  Redis = require('ioredis');
} catch (e) {
  Redis = null;
}

class RedisService {
  constructor() {
    this.memoryStore = new Map();
    this.client = null;

    if (Redis && process.env.REDIS_URL) {
      try {
        this.client = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false
        });
        this.client.on('error', () => {});
      } catch (e) {
        this.client = null;
      }
    }
  }

  async hset(key, fieldOrObj, val) {
    if (this.client) {
      try {
        if (typeof fieldOrObj === 'object') {
          return await this.client.hset(key, fieldOrObj);
        }
        return await this.client.hset(key, fieldOrObj, val);
      } catch (e) {}
    }
    const current = this.memoryStore.get(key) || {};
    if (typeof fieldOrObj === 'object') {
      Object.assign(current, fieldOrObj);
    } else {
      current[fieldOrObj] = val;
    }
    this.memoryStore.set(key, current);
    return 1;
  }

  async hgetall(key) {
    if (this.client) {
      try {
        return await this.client.hgetall(key);
      } catch (e) {}
    }
    return this.memoryStore.get(key) || {};
  }

  async set(key, value, ...args) {
    if (this.client) {
      try {
        return await this.client.set(key, value, ...args);
      } catch (e) {}
    }
    this.memoryStore.set(key, value);
    return 'OK';
  }

  async get(key) {
    if (this.client) {
      try {
        return await this.client.get(key);
      } catch (e) {}
    }
    return this.memoryStore.get(key) || null;
  }

  async del(key) {
    if (this.client) {
      try {
        return await this.client.del(key);
      } catch (e) {}
    }
    const had = this.memoryStore.has(key);
    this.memoryStore.delete(key);
    return had ? 1 : 0;
  }

  async deleteExamKeys(attemptId) {
    const id = String(attemptId);
    await Promise.all([
      this.del(`exam:active:${id}`),
      this.del(`exam:active:${id}:device`)
    ]);
  }
}

module.exports = new RedisService();
