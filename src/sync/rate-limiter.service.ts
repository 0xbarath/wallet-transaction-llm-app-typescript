import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly tokensPerSecond: number;
  private readonly capacity: number;
  private static readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(private readonly configService: ConfigService) {
    this.tokensPerSecond = this.configService.get<number>('rateLimit.tokensPerSecond') ?? 2;
    this.capacity = this.configService.get<number>('rateLimit.capacity') ?? 5;
  }

  tryConsume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.tokensPerSecond);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  @Cron('*/10 * * * *')
  evictStale() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > RateLimiterService.TTL_MS) {
        this.buckets.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      this.logger.log(`Evicted ${evicted} stale rate-limit buckets`);
    }
  }
}
