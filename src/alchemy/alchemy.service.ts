import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';
import {
  AlchemyTransfer,
  AlchemyTransfersResult,
  AlchemyTransactionReceipt,
} from './types/alchemy-transfer.type';
import { AlchemyApiException } from '../common/exceptions/alchemy-api.exception';

@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(AlchemyService.name);
  private readonly alchemy: Alchemy;

  constructor(private readonly configService: ConfigService) {
    this.alchemy = new Alchemy({
      apiKey: this.configService.get<string>('alchemy.apiKey'),
      network: Network.ETH_MAINNET,
    });
  }

  async getAssetTransfers(params: {
    fromBlock?: string;
    toBlock?: string;
    fromAddress?: string;
    toAddress?: string;
    category: AssetTransfersCategory[];
    maxCount?: number;
    pageKey?: string;
    order?: SortingOrder;
  }): Promise<AlchemyTransfersResult> {
    try {
      const result = await this.alchemy.core.getAssetTransfers({
        ...params,
        withMetadata: true,
      });

      const transfers: AlchemyTransfer[] = result.transfers.map((t) => ({
        uniqueId: t.uniqueId,
        hash: t.hash,
        from: t.from,
        to: t.to ?? null,
        value: t.value ?? null,
        asset: t.asset ?? null,
        category: t.category,
        blockNum: t.blockNum,
        rawContract: t.rawContract
          ? {
              address: t.rawContract.address ?? null,
              value: t.rawContract.value ?? null,
              decimal: t.rawContract.decimal != null ? Number(t.rawContract.decimal) : null,
            }
          : null,
        metadata: {
          blockTimestamp: (t as any).metadata?.blockTimestamp ?? null,
        },
        tokenId: (t as any).tokenId ?? null,
      }));

      return {
        transfers,
        pageKey: result.pageKey ?? null,
      };
    } catch (error: any) {
      this.logger.error(`Alchemy getAssetTransfers failed: ${error.message}`);
      throw new AlchemyApiException(error.message);
    }
  }

  async getTransactionReceipt(txHash: string): Promise<AlchemyTransactionReceipt | null> {
    try {
      const receipt = await this.alchemy.core.getTransactionReceipt(txHash);
      if (!receipt) return null;

      return {
        status: receipt.status === 1 ? '0x1' : '0x0',
        blockNumber: '0x' + receipt.blockNumber.toString(16),
        from: receipt.from,
        to: receipt.to ?? null,
        contractAddress: receipt.contractAddress ?? null,
        gasUsed: '0x' + receipt.gasUsed.toBigInt().toString(16),
        transactionHash: receipt.transactionHash,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          topics: [...log.topics],
          data: log.data,
          logIndex: '0x' + log.logIndex.toString(16),
          removed: log.removed,
        })),
      };
    } catch (error: any) {
      this.logger.error(`Alchemy getTransactionReceipt failed: ${error.message}`);
      throw new AlchemyApiException(error.message);
    }
  }
}
