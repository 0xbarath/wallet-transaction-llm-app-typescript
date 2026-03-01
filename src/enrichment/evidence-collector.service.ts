import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlchemyService } from '../alchemy/alchemy.service';
import { EvidenceBundle, EvidenceItem, LocalTransferSummary } from './types/evidence.types';

const MAX_LOGS = 50;
const MAX_DATA_LENGTH = 1024;

@Injectable()
export class EvidenceCollectorService {
  private readonly logger = new Logger(EvidenceCollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alchemyService: AlchemyService,
  ) {}

  async collectEvidence(txHash: string, network: string): Promise<EvidenceBundle | null> {
    // Fetch receipt and local transfers in parallel
    const [receipt, localTransfers] = await Promise.all([
      this.alchemyService.getTransactionReceipt(txHash),
      this.prisma.transfer.findMany({
        where: { hash: txHash, network },
        select: {
          walletId: true,
          direction: true,
          asset: true,
          valueDecimal: true,
          category: true,
          blockNum: true,
        },
      }),
    ]);
    if (!receipt) return null;

    const items: EvidenceItem[] = [];

    // ev:tx
    items.push({
      id: 'ev:tx',
      type: 'transaction',
      fields: {
        from: receipt.from,
        to: receipt.to ?? '',
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        contractAddress: receipt.contractAddress ?? '',
        transactionHash: receipt.transactionHash,
      },
    });

    // ev:log:N
    const logs = receipt.logs.slice(0, MAX_LOGS);
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const data = log.data.length > MAX_DATA_LENGTH ? log.data.substring(0, MAX_DATA_LENGTH) : log.data;
      items.push({
        id: `ev:log:${i}`,
        type: 'log',
        fields: {
          address: log.address,
          topics: JSON.stringify(log.topics),
          data,
          logIndex: log.logIndex,
          removed: String(log.removed),
        },
      });
    }

    // ev:transfer:N — local DB transfers matching this tx hash

    const transferSummaries: LocalTransferSummary[] = localTransfers.map((t, i) => {
      items.push({
        id: `ev:transfer:${i}`,
        type: 'transfer',
        fields: {
          walletId: t.walletId,
          direction: t.direction,
          asset: t.asset ?? '',
          value: t.valueDecimal?.toString() ?? '',
          category: t.category,
          blockNum: t.blockNum.toString(),
        },
      });

      return {
        walletId: t.walletId,
        direction: t.direction,
        asset: t.asset,
        value: t.valueDecimal?.toString() ?? null,
        category: t.category,
        blockNum: t.blockNum.toString(),
      };
    });

    return { receipt, items, localTransfers: transferSummaries };
  }
}
