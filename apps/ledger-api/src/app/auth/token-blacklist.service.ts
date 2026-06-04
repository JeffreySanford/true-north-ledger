import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

type RedisClientFactory = (options: { url: string }) => RedisClientType;

@Injectable()
export class TokenBlacklistService implements OnModuleDestroy {
  private readonly localBlacklist = new Map<string, number>();
  private redisClient: RedisClientType | null = null;
  private redisReady = false;
  private redisUnavailable = false;
  private clientFactory: RedisClientFactory = (options) => createClient(options);

  setClientFactoryForTesting(clientFactory: RedisClientFactory): void {
    this.clientFactory = clientFactory;
  }

  async blacklistJti(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) {
      return;
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.localBlacklist.set(jti, expiresAt);

    if (await this.ensureRedis()) {
      try {
        await this.redisClient?.set(this.redisKey(jti), '1', { EX: ttlSeconds });
      } catch {
        this.redisUnavailable = true;
        this.redisReady = false;
        await this.closeRedisClient();
      }
    }
  }

  async isJtiBlacklisted(jti: string): Promise<boolean> {
    if (!jti) {
      return false;
    }

    const localExpiry = this.localBlacklist.get(jti);
    if (localExpiry && localExpiry > Date.now()) {
      return true;
    }

    if (localExpiry && localExpiry <= Date.now()) {
      this.localBlacklist.delete(jti);
    }

    if (!(await this.ensureRedis())) {
      return false;
    }

    try {
      const exists = await this.redisClient?.exists(this.redisKey(jti));
      return exists === 1;
    } catch {
      this.redisUnavailable = true;
      this.redisReady = false;
      await this.closeRedisClient();
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRedisClient();
  }

  private redisKey(jti: string): string {
    return `auth:blacklist:jti:${jti}`;
  }

  private async ensureRedis(): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return false;
    }

    if (this.redisUnavailable) {
      return false;
    }

    if (this.redisReady && this.redisClient) {
      return true;
    }

    try {
      if (!this.redisClient) {
        const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
        this.redisClient = this.clientFactory({ url });
        this.redisClient.on('error', () => {
          this.redisUnavailable = true;
          this.redisReady = false;
          void this.closeRedisClient();
        });
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
        (client as RedisClientType & { destroy?: () => void }).destroy?.();
      }
    } catch {
      (client as RedisClientType & { destroy?: () => void }).destroy?.();
    }
  }
}
