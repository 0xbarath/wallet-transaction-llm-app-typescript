import { Module } from '@nestjs/common';
import { EnrichmentController } from './enrichment.controller';
import { TransactionExplainService } from './transaction-explain.service';
import { EvidenceCollectorService } from './evidence-collector.service';
import { ProtocolLabelerService } from './protocol-labeler.service';
import { OperationClassifierService } from './operation-classifier.service';
import { LlmExplainerService } from './llm-explainer.service';
import { AlchemyModule } from '../alchemy/alchemy.module';

@Module({
  imports: [AlchemyModule],
  controllers: [EnrichmentController],
  providers: [
    TransactionExplainService,
    EvidenceCollectorService,
    ProtocolLabelerService,
    OperationClassifierService,
    LlmExplainerService,
  ],
})
export class EnrichmentModule {}
