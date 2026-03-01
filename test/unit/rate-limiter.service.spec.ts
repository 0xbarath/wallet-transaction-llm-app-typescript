import { RateLimiterService } from '../../src/sync/rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'rateLimit.tokensPerSecond') return 2;
        if (key === 'rateLimit.capacity') return 5;
        return undefined;
      }),
    };
    service = new RateLimiterService(mockConfig as any);
  });

  it('should allow initial requests up to capacity', () => {
    for (let i = 0; i < 5; i++) {
      expect(service.tryConsume('wallet-1')).toBe(true);
    }
  });

  it('should reject when bucket exhausted', () => {
    for (let i = 0; i < 5; i++) {
      service.tryConsume('wallet-1');
    }
    expect(service.tryConsume('wallet-1')).toBe(false);
  });

  it('should track separate buckets per key', () => {
    for (let i = 0; i < 5; i++) {
      service.tryConsume('wallet-1');
    }
    expect(service.tryConsume('wallet-1')).toBe(false);
    expect(service.tryConsume('wallet-2')).toBe(true);
  });

  it('should refill tokens over time', () => {
    for (let i = 0; i < 5; i++) {
      service.tryConsume('wallet-1');
    }
    expect(service.tryConsume('wallet-1')).toBe(false);

    // Simulate time passing by manipulating bucket
    const buckets = (service as any).buckets;
    const bucket = buckets.get('wallet-1');
    bucket.lastRefill = Date.now() - 2000; // 2 seconds ago → should refill 4 tokens

    expect(service.tryConsume('wallet-1')).toBe(true);
  });
});
