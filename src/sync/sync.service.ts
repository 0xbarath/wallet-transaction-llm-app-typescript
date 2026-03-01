import { Injectable, Logger } from '@nestjs/common';
import { AssetTransfersCategory } from 'alchemy-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AlchemyService } from '../alchemy/alchemy.service';
import { RateLimiterService } from './rate-limiter.service';
import { SyncRequestDto } from './dto/sync-request.dto';
import { SyncResponse } from './dto/sync-response.dto';
import { WalletNotFoundException } from '../common/exceptions/wallet-not-found.exception';
import { SyncInProgressException } from '../common/exceptions/sync-in-progress.exception';
import { RateLimitExceededException } from '../common/exceptions/rate-limit-exceeded.exception';
import { Direction, TransferCategory, Prisma } from '@prisma/client';
import { AlchemyTransfer } from '../alchemy/types/alchemy-transfer.type';

const BLOCKS_PER_DAY = 7200;
const DEFAULT_LOOKBACK_DAYS = 30;
const ALL_CATEGORIES = [
  AssetTransfersCategory.EXTERNAL,
  AssetTransfersCategory.INTERNAL,
  AssetTransfersCategory.ERC20,
  AssetTransfersCategory.ERC721,
  AssetTransfersCategory.ERC1155,
];

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alchemyService: AlchemyService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async sync(walletId: string, request: SyncRequestDto): Promise<SyncResponse> {
    if (!this.rateLimiter.tryConsume(walletId)) {
      throw new RateLimitExceededException(walletId);
    }

    const [wallet, syncState] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { id: walletId } }),
      this.prisma.walletSyncState.findUnique({ where: { walletId } }),
    ]);
    if (!wallet || !syncState) {
      throw new WalletNotFoundException(walletId);
    }

    // Optimistic lock: attempt to set syncInProgress
    try {
      await this.prisma.walletSyncState.update({
        where: { walletId, version: syncState.version },
        data: { syncInProgress: true, version: { increment: 1 } },
      });
    } catch {
      throw new SyncInProgressException(walletId);
    }

    let transfersSynced = 0;
    let maxBlock: bigint | null = syncState.lastSyncedBlock;

    try {
      const fromBlock = this.computeFromBlock(request, syncState.lastSyncedBlock);

      // Fetch IN + OUT transfers in parallel
      const [inTransfers, outTransfers] = await Promise.all([
        this.fetchAllTransfers({ toAddress: wallet.address, fromBlock }),
        this.fetchAllTransfers({ fromAddress: wallet.address, fromBlock }),
      ]);

      const allTransfers = [...inTransfers, ...outTransfers];
      if (allTransfers.length === 0) {
        return this.buildResponse(walletId, 0, syncState);
      }

      const records = allTransfers.map((t) =>
        this.mapTransfer(t, walletId, wallet.address, wallet.network),
      );

      // skipDuplicates handles dedup at DB level via unique constraint
      const result = await this.prisma.transfer.createMany({
        data: records,
        skipDuplicates: true,
      });
      transfersSynced = result.count;

      // Track max block
      for (const r of records) {
        const bn = BigInt(r.blockNum);
        if (maxBlock === null || bn > maxBlock) {
          maxBlock = bn;
        }
      }
    } finally {
      // Release lock
      const now = new Date();
      await this.prisma.walletSyncState.update({
        where: { walletId },
        data: {
          syncInProgress: false,
          lastSyncedBlock: maxBlock,
          lastSyncedAt: transfersSynced > 0 ? now : syncState.lastSyncedAt,
          version: { increment: 1 },
        },
      });
    }

    return {
      walletId,
      status: 'COMPLETED',
      transfersSynced,
      lastSyncedBlock: maxBlock?.toString() ?? null,
      lastSyncedAt: transfersSynced > 0 ? new Date().toISOString() : (syncState.lastSyncedAt?.toISOString() ?? null),
    };
  }

  private computeFromBlock(request: SyncRequestDto, lastSyncedBlock: bigint | null): string {
    if (request.startTime) {
      const startDate = new Date(request.startTime);
      const now = new Date();
      const daysAgo = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const blocksAgo = daysAgo * BLOCKS_PER_DAY;
      return '0x' + Math.max(0, blocksAgo).toString(16);
    }

    if (request.lookbackDays) {
      const blocksAgo = request.lookbackDays * BLOCKS_PER_DAY;
      return '0x' + blocksAgo.toString(16);
    }

    if (lastSyncedBlock !== null) {
      return '0x' + (lastSyncedBlock + 1n).toString(16);
    }

    const defaultBlocksAgo = DEFAULT_LOOKBACK_DAYS * BLOCKS_PER_DAY;
    return '0x' + defaultBlocksAgo.toString(16);
  }

  private async fetchAllTransfers(params: {
    fromAddress?: string;
    toAddress?: string;
    fromBlock: string;
  }): Promise<AlchemyTransfer[]> {
    const allTransfers: AlchemyTransfer[] = [];
    let pageKey: string | undefined;

    do {
      const result = await this.alchemyService.getAssetTransfers({
        fromBlock: params.fromBlock,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        category: ALL_CATEGORIES,
        maxCount: 1000,
        pageKey,
      });

      allTransfers.push(...result.transfers);
      pageKey = result.pageKey ?? undefined;
    } while (pageKey);

    return allTransfers;
  }

  private mapTransfer(
    t: AlchemyTransfer,
    walletId: string,
    walletAddress: string,
    network: string,
  ): Prisma.TransferCreateManyInput {
    const fromAddr = t.from?.toLowerCase() ?? '';
    const toAddr = t.to?.toLowerCase() ?? null;
    const direction = toAddr === walletAddress ? Direction.IN : Direction.OUT;
    const category = this.mapCategory(t.category);
    const blockNum = BigInt(t.blockNum);

    return {
      walletId,
      network,
      uniqueId: t.uniqueId,
      hash: t.hash,
      blockNum,
      blockTs: t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp) : null,
      fromAddr,
      toAddr,
      direction,
      asset: t.asset ?? null,
      category,
      valueDecimal: t.value != null ? new Prisma.Decimal(t.value.toString()) : null,
      rawValue: t.rawContract?.value ?? null,
      rawContractAddr: t.rawContract?.address ?? null,
      rawContractDecimals: t.rawContract?.decimal ?? null,
      tokenId: t.tokenId ?? null,
    };
  }

  private mapCategory(category: string): TransferCategory {
    switch (category.toLowerCase()) {
      case 'external':
        return TransferCategory.EXTERNAL;
      case 'internal':
        return TransferCategory.INTERNAL;
      case 'erc20':
        return TransferCategory.ERC20;
      case 'erc721':
        return TransferCategory.ERC721;
      case 'erc1155':
        return TransferCategory.ERC1155;
      default:
        return TransferCategory.EXTERNAL;
    }
  }

  private buildResponse(
    walletId: string,
    transfersSynced: number,
    syncState: any,
  ): SyncResponse {
    return {
      walletId,
      status: 'COMPLETED',
      transfersSynced,
      lastSyncedBlock: syncState.lastSyncedBlock?.toString() ?? null,
      lastSyncedAt: syncState.lastSyncedAt?.toISOString() ?? null,
    };
  }
}
