import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuerySpec } from './types/query-spec';
import { TransferResponse } from './dto/transfer-response.dto';
import { PageResponse } from './dto/page-response.dto';
import { buildWhereClause, buildOrderBy } from './query-builder.util';
import { encodeCursor } from './transaction-cursor';
import { ForbiddenCategoryException } from '../common/exceptions/forbidden-category.exception';

@Injectable()
export class TransactionQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(spec: QuerySpec, role: string): Promise<PageResponse<TransferResponse>> {
    const isAdmin = role === 'admin';

    // RBAC: non-admin requesting INTERNAL
    if (
      !isAdmin &&
      spec.categories &&
      spec.categories.includes('INTERNAL') &&
      spec.categories.length === 1
    ) {
      throw new ForbiddenCategoryException();
    }

    const where = buildWhereClause(spec, isAdmin);
    const orderBy = buildOrderBy(spec.sort);
    const take = spec.limit + 1;

    const transfers = await this.prisma.transfer.findMany({
      where,
      orderBy,
      take,
    });

    const hasMore = transfers.length > spec.limit;
    const items = hasMore ? transfers.slice(0, spec.limit) : transfers;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor(last.createdAt, last.id);
    }

    return {
      items: items.map(this.toTransferResponse),
      nextCursor,
      querySpec: spec,
    };
  }

  private toTransferResponse(transfer: any): TransferResponse {
    return {
      id: transfer.id,
      walletId: transfer.walletId,
      network: transfer.network,
      hash: transfer.hash,
      blockNum: transfer.blockNum.toString(),
      blockTs: transfer.blockTs?.toISOString() ?? null,
      fromAddr: transfer.fromAddr,
      toAddr: transfer.toAddr,
      direction: transfer.direction,
      asset: transfer.asset,
      category: transfer.category,
      valueDecimal: transfer.valueDecimal?.toString() ?? null,
      tokenId: transfer.tokenId,
      createdAt: transfer.createdAt.toISOString(),
    };
  }
}
