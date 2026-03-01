import { Prisma } from '@prisma/client';
import { QuerySpec } from './types/query-spec';
import { decodeCursor } from './transaction-cursor';

export function buildWhereClause(spec: QuerySpec, isAdmin: boolean): Prisma.TransferWhereInput {
  const where: Prisma.TransferWhereInput = {
    walletId: spec.walletId,
  };

  if (spec.direction) {
    where.direction = spec.direction as any;
  }

  if (spec.categories && spec.categories.length > 0) {
    const filtered = isAdmin
      ? spec.categories
      : spec.categories.filter((c) => c !== 'INTERNAL');
    if (filtered.length > 0) {
      where.category = { in: filtered as any[] };
    }
  } else if (!isAdmin) {
    where.category = { not: 'INTERNAL' as any };
  }

  if (spec.assets && spec.assets.length > 0) {
    where.asset = { in: spec.assets };
  }

  if (spec.minValue || spec.maxValue) {
    const valueFilter: any = {};
    if (spec.minValue) valueFilter.gte = new Prisma.Decimal(spec.minValue);
    if (spec.maxValue) valueFilter.lte = new Prisma.Decimal(spec.maxValue);
    where.valueDecimal = valueFilter;
  }

  if (spec.counterparty) {
    const addr = spec.counterparty.toLowerCase();
    where.OR = [{ fromAddr: addr }, { toAddr: addr }];
  }

  if (spec.startTime || spec.endTime) {
    const timeFilter: any = {};
    if (spec.startTime) timeFilter.gte = new Date(spec.startTime);
    if (spec.endTime) timeFilter.lte = new Date(spec.endTime);
    where.createdAt = timeFilter;
  }

  if (spec.cursor) {
    const cursorVal = decodeCursor(spec.cursor);
    const isDesc = !spec.sort || spec.sort === 'createdAt_desc';

    if (isDesc) {
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursorVal.createdAt } },
            {
              createdAt: cursorVal.createdAt,
              id: { lt: cursorVal.id },
            },
          ],
        },
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      ];
    } else {
      where.AND = [
        {
          OR: [
            { createdAt: { gt: cursorVal.createdAt } },
            {
              createdAt: cursorVal.createdAt,
              id: { gt: cursorVal.id },
            },
          ],
        },
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      ];
    }
  }

  return where;
}

export function buildOrderBy(
  sort?: string,
): Prisma.TransferOrderByWithRelationInput[] {
  if (sort === 'createdAt_asc') {
    return [{ createdAt: 'asc' }, { id: 'asc' }];
  }
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}
