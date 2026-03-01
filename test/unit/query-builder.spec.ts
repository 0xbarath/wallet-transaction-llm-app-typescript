import { buildWhereClause, buildOrderBy } from '../../src/transaction/query-builder.util';
import { QuerySpec } from '../../src/transaction/types/query-spec';

describe('QueryBuilder', () => {
  const baseSpec: QuerySpec = {
    walletId: 'wallet-1',
    limit: 50,
    sort: 'createdAt_desc',
  };

  describe('buildWhereClause', () => {
    it('should always include walletId', () => {
      const where = buildWhereClause(baseSpec, false);
      expect(where.walletId).toBe('wallet-1');
    });

    it('should add direction filter', () => {
      const where = buildWhereClause({ ...baseSpec, direction: 'IN' }, false);
      expect(where.direction).toBe('IN');
    });

    it('should add category filter for admin', () => {
      const where = buildWhereClause(
        { ...baseSpec, categories: ['INTERNAL', 'EXTERNAL'] },
        true,
      );
      expect(where.category).toEqual({ in: ['INTERNAL', 'EXTERNAL'] });
    });

    it('should strip INTERNAL for non-admin', () => {
      const where = buildWhereClause(
        { ...baseSpec, categories: ['INTERNAL', 'EXTERNAL'] },
        false,
      );
      expect(where.category).toEqual({ in: ['EXTERNAL'] });
    });

    it('should exclude INTERNAL by default for non-admin', () => {
      const where = buildWhereClause(baseSpec, false);
      expect(where.category).toEqual({ not: 'INTERNAL' });
    });

    it('should not exclude INTERNAL for admin with no categories', () => {
      const where = buildWhereClause(baseSpec, true);
      expect(where.category).toBeUndefined();
    });

    it('should add asset filter', () => {
      const where = buildWhereClause({ ...baseSpec, assets: ['ETH', 'USDC'] }, false);
      expect(where.asset).toEqual({ in: ['ETH', 'USDC'] });
    });

    it('should add value range', () => {
      const where = buildWhereClause(
        { ...baseSpec, minValue: '1.0', maxValue: '100.0' },
        false,
      );
      expect(where.valueDecimal).toBeDefined();
    });

    it('should add counterparty filter with OR', () => {
      const addr = '0x1234567890abcdef1234567890abcdef12345678';
      const where = buildWhereClause({ ...baseSpec, counterparty: addr }, false);
      expect(where.OR).toHaveLength(2);
    });

    it('should add time range', () => {
      const where = buildWhereClause(
        {
          ...baseSpec,
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-12-31T23:59:59Z',
        },
        false,
      );
      expect(where.createdAt).toBeDefined();
    });
  });

  describe('buildOrderBy', () => {
    it('should default to desc', () => {
      const order = buildOrderBy();
      expect(order[0]).toEqual({ createdAt: 'desc' });
      expect(order[1]).toEqual({ id: 'desc' });
    });

    it('should support asc', () => {
      const order = buildOrderBy('createdAt_asc');
      expect(order[0]).toEqual({ createdAt: 'asc' });
      expect(order[1]).toEqual({ id: 'asc' });
    });
  });
});
