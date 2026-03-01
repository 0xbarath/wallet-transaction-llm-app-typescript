import { Injectable, Logger } from '@nestjs/common';
import { AlchemyTransactionReceipt } from '../alchemy/types/alchemy-transfer.type';
import { OperationResult } from './types/evidence.types';
import * as eventSignatures from './data/event-signatures.json';

interface EventSignature {
  name: string;
  protocol: string;
  operation: string;
}

@Injectable()
export class OperationClassifierService {
  private readonly logger = new Logger(OperationClassifierService.name);
  private readonly signatures: Record<string, EventSignature>;

  constructor() {
    this.signatures = eventSignatures as Record<string, EventSignature>;
  }

  classify(receipt: AlchemyTransactionReceipt): OperationResult {
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      if (log.topics.length === 0) continue;

      const topic0 = log.topics[0].toLowerCase();
      const sig = this.signatures[topic0];
      if (sig) {
        return {
          name: sig.operation,
          confidence: 0.9,
          evidenceIds: [`ev:log:${i}`],
        };
      }
    }

    return {
      name: 'unknown',
      confidence: 0.0,
      evidenceIds: [],
    };
  }
}
