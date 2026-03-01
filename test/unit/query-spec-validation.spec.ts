import { normalizeQuerySpec } from '../../src/transaction/types/query-spec';

describe('QuerySpec normalization', () => {
  it('should default limit to 50', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1' });
    expect(spec.limit).toBe(50);
  });

  it('should cap limit at 200', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1', limit: 500 });
    expect(spec.limit).toBe(200);
  });

  it('should accept limit within range', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1', limit: 100 });
    expect(spec.limit).toBe(100);
  });

  it('should fix zero limit to default', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1', limit: 0 });
    expect(spec.limit).toBe(50);
  });

  it('should fix negative limit to default', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1', limit: -1 });
    expect(spec.limit).toBe(50);
  });

  it('should default sort to createdAt_desc', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1' });
    expect(spec.sort).toBe('createdAt_desc');
  });

  it('should preserve provided sort', () => {
    const spec = normalizeQuerySpec({ walletId: 'w1', sort: 'createdAt_asc' });
    expect(spec.sort).toBe('createdAt_asc');
  });
});
