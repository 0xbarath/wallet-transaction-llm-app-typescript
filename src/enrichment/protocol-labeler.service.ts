import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceItem, ProtocolHint } from './types/evidence.types';
import { AlchemyTransactionReceipt } from '../alchemy/types/alchemy-transfer.type';

@Injectable()
export class ProtocolLabelerService {
  private readonly logger = new Logger(ProtocolLabelerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async label(
    receipt: AlchemyTransactionReceipt,
    network: string,
    evidenceItems: EvidenceItem[],
  ): Promise<{ hints: ProtocolHint[]; evidenceItems: EvidenceItem[] }> {
    const addresses = new Set<string>();
    addresses.add(receipt.from.toLowerCase());
    if (receipt.to) addresses.add(receipt.to.toLowerCase());
    for (const log of receipt.logs) {
      addresses.add(log.address.toLowerCase());
    }

    const labels = await this.prisma.addressLabel.findMany({
      where: {
        network,
        address: { in: [...addresses] },
      },
    });

    const hints: ProtocolHint[] = [];
    const newItems: EvidenceItem[] = [];

    for (const label of labels) {
      hints.push({
        address: label.address,
        protocol: label.protocol,
        label: label.label,
        confidence: label.confidence.toString(),
        source: label.source,
        category: label.category,
      });

      let evidenceId: string;
      if (label.address === receipt.from.toLowerCase()) {
        evidenceId = 'ev:label:from';
      } else if (receipt.to && label.address === receipt.to.toLowerCase()) {
        evidenceId = 'ev:label:to';
      } else {
        evidenceId = `ev:label:${label.address}`;
      }

      newItems.push({
        id: evidenceId,
        type: 'label',
        fields: {
          address: label.address,
          protocol: label.protocol,
          label: label.label,
          confidence: label.confidence.toString(),
          source: label.source,
          category: label.category ?? '',
        },
      });
    }

    return {
      hints,
      evidenceItems: [...evidenceItems, ...newItems],
    };
  }
}
