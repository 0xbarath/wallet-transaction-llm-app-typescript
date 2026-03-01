import { Injectable, Logger } from '@nestjs/common';
import { EvidenceCollectorService } from './evidence-collector.service';
import { ProtocolLabelerService } from './protocol-labeler.service';
import { OperationClassifierService } from './operation-classifier.service';
import { LlmExplainerService } from './llm-explainer.service';
import { ExplainRequestDto } from './dto/explain-request.dto';
import { ExplainResult } from './types/evidence.types';

@Injectable()
export class TransactionExplainService {
  private readonly logger = new Logger(TransactionExplainService.name);

  constructor(
    private readonly evidenceCollector: EvidenceCollectorService,
    private readonly protocolLabeler: ProtocolLabelerService,
    private readonly operationClassifier: OperationClassifierService,
    private readonly llmExplainer: LlmExplainerService,
  ) {}

  async explain(request: ExplainRequestDto): Promise<ExplainResult> {
    // 1. Collect evidence
    const bundle = await this.evidenceCollector.collectEvidence(request.txHash, request.network);

    if (!bundle) {
      return {
        txHash: request.txHash,
        network: request.network,
        status: 'FAILED',
        protocolHints: [],
        operation: null,
        explanation: null,
        evidence: [],
        localTransfers: [],
        humanReadable: null,
      };
    }

    // 2. Protocol labeling
    const { hints, evidenceItems } = await this.protocolLabeler.label(
      bundle.receipt,
      request.network,
      bundle.items,
    );

    // 3. Operation classification
    const operation = this.operationClassifier.classify(bundle.receipt);

    // 4. LLM explanation (if requested)
    let explanation = null;
    let status: 'ENRICHED' | 'PARTIAL' = 'ENRICHED';

    if (request.explain) {
      explanation = await this.llmExplainer.explain(evidenceItems, hints);
      if (!explanation) {
        status = 'PARTIAL';
      }
    }

    // 5. Human-readable format
    let humanReadable: string | null = null;
    if (request.format === 'human' && explanation) {
      humanReadable = this.formatHumanReadable(explanation, hints, operation);
    }

    return {
      txHash: request.txHash,
      network: request.network,
      status,
      protocolHints: hints,
      operation,
      explanation,
      evidence: evidenceItems,
      localTransfers: bundle.localTransfers,
      humanReadable,
    };
  }

  private formatHumanReadable(explanation: any, hints: any[], operation: any): string {
    const lines: string[] = [];
    lines.push(`Summary: ${explanation.summary}`);
    lines.push('');

    if (operation && operation.name !== 'unknown') {
      lines.push(`Operation: ${operation.name} (confidence: ${operation.confidence})`);
      lines.push('');
    }

    if (hints.length > 0) {
      lines.push('Protocols:');
      for (const h of hints) {
        lines.push(`  - ${h.label} (${h.protocol}) at ${h.address}`);
      }
      lines.push('');
    }

    lines.push('Steps:');
    for (let i = 0; i < explanation.steps.length; i++) {
      lines.push(`  ${i + 1}. ${explanation.steps[i].text}`);
    }

    if (explanation.unknowns.length > 0) {
      lines.push('');
      lines.push('Unknowns:');
      for (const u of explanation.unknowns) {
        lines.push(`  - ${u}`);
      }
    }

    if (explanation.safetyNotes.length > 0) {
      lines.push('');
      lines.push('Safety Notes:');
      for (const n of explanation.safetyNotes) {
        lines.push(`  - ${n}`);
      }
    }

    return lines.join('\n');
  }
}
