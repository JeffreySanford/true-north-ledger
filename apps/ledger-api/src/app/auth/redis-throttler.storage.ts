import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createClient } from 'redis';

interface RedisClientLike {
  isOpen: boolean;
  connect(): Promise<void>;
  quit(): Promise<void>;
  destroy?(): void;
  exists(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  pExpire(key: string, milliseconds: number): Promise<number>;
  pTTL(key: string): Promise<number>;
  set(key: string, value: string, options: { PX: number }): Promise<string | null>;
}

interface LocalBucket {
  totalHits: number;
  expiresAt: number;
  blockExpiresAt: number;
}

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

type RedisClientFactory = (options: { url: string }) => RedisClientLike;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly localBuckets = new Map<string, LocalBucket>();
  private redisClient: RedisClientLike | null = null;
  private redisReady = false;
  private redisUnavailable = false;

  constructor(
    private readonly redisUrl: string | undefined = process.env.REDIS_URL,
    private readonly clientFactory: RedisClientFactory = (options) => createClient(options) as unknown as RedisClientLike,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (await this.ensureRedis()) {
      try {
        return await this.incrementRedis(key, ttl, limit, blockDuration, throttlerName);
      } catch {
        this.redisUnavailable = true;
        this.redisReady = false;
        await this.closeRedisClient();
      }
    }

    return this.incrementLocal(key, ttl, limit, blockDuration);
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRedisClient();
  }

  reset(): void {
    this.localBuckets.clear();
  }

  private counterKey(throttlerName: string, key: string): string {
    return `throttle:${throttlerName}:${key}:hits`;
  }

  private blockKey(throttlerName: string, key: string): string {
    return `throttle:${throttlerName}:${key}:block`;
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = this.counterKey(throttlerName, key);
    const blockKey = this.blockKey(throttlerName, key);

    const isBlocked = (await this.redisClient?.exists(blockKey)) === 1;
    if (isBlocked) {
      const totalHits = (await this.redisClient?.exists(counterKey)) === 1 ? await this.redisClient?.incr(counterKey) : limit + 1;
      const counterTtl = await this.redisClient?.pTTL(counterKey);
      const blockTtl = await this.redisClient?.pTTL(blockKey);

      return {
        totalHits: totalHits ?? limit + 1,
        timeToExpire: this.toSeconds(counterTtl, ttl),
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(blockTtl, blockDuration),
      };
    }

    const totalHits = (await this.redisClient?.incr(counterKey)) ?? 1;
    if (totalHits === 1) {
      await this.redisClient?.pExpire(counterKey, ttl);
    }

    const counterTtl = await this.redisClient?.pTTL(counterKey);

    if (totalHits > limit) {
      await this.redisClient?.set(blockKey, '1', { PX: blockDuration });
      const blockTtl = await this.redisClient?.pTTL(blockKey);

      return {
        totalHits,
        timeToExpire: this.toSeconds(counterTtl, ttl),
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(blockTtl, blockDuration),
      };
    }

    return {
      totalHits,
      timeToExpire: this.toSeconds(counterTtl, ttl),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  private incrementLocal(key: string, ttl: number, limit: number, blockDuration: number): ThrottlerStorageRecord {
    const now = Date.now();
    const existing = this.localBuckets.get(key);

    if (!existing || existing.expiresAt <= now) {
      const created: LocalBucket = {
        totalHits: 1,
        expiresAt: now + ttl,
        blockExpiresAt: 0,
      };
      this.localBuckets.set(key, created);

      return {
        totalHits: created.totalHits,
        timeToExpire: this.toSeconds(created.expiresAt - now, ttl),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    if (existing.blockExpiresAt > now) {
      return {
        totalHits: existing.totalHits,
        timeToExpire: this.toSeconds(existing.expiresAt - now, ttl),
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(existing.blockExpiresAt - now, blockDuration),
      };
    }

    existing.totalHits += 1;

    if (existing.totalHits > limit) {
      existing.blockExpiresAt = now + blockDuration;

      return {
        totalHits: existing.totalHits,
        timeToExpire: this.toSeconds(existing.expiresAt - now, ttl),
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(existing.blockExpiresAt - now, blockDuration),
      };
    }

    return {
      totalHits: existing.totalHits,
      timeToExpire: this.toSeconds(existing.expiresAt - now, ttl),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  private toSeconds(timeMs: number | undefined, fallbackMs: number): number {
    const normalizedMs = typeof timeMs === 'number' && timeMs > 0 ? timeMs : fallbackMs;
    return Math.max(1, Math.ceil(normalizedMs / 1000));
  }

  private async ensureRedis(): Promise<boolean> {
    if (this.redisUnavailable) {
      return false;
    }

    if (this.redisReady && this.redisClient) {
      return true;
    }

    try {
      if (!this.redisClient) {
        const url = this.redisUrl ?? 'redis://localhost:6379';
        this.redisClient = this.clientFactory({ url });
      }

      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }

      this.redisReady = true;
      return true;
    } catch {
      this.redisUnavailable = true;
      this.redisReady = false;
      await this.closeRedisClient();
      return false;
    }
  }

  private async closeRedisClient(): Promise<void> {
    const client = this.redisClient;
    this.redisClient = null;
    this.redisReady = false;

    if (!client) {
      return;
    }

    try {
      if (client.isOpen) {
        await client.quit();
      } else {
        client.destroy?.();
      }
    } catch {
      client.destroy?.();
    }
  }
}
