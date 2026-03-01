export interface EvidenceItem {
  id: string;
  type: string;
  fields: Record<string, string>;
}

export interface EvidenceBundle {
  receipt: any;
  items: EvidenceItem[];
  localTransfers: LocalTransferSummary[];
}

export interface LocalTransferSummary {
  walletId: string;
  direction: string;
  asset: string | null;
  value: string | null;
  category: string;
  blockNum: string;
}

export interface ProtocolHint {
  address: string;
  protocol: string;
  label: string;
  confidence: string;
  source: string;
  category: string | null;
}

export interface OperationResult {
  name: string;
  confidence: number;
  evidenceIds: string[];
}

export interface Explanation {
  summary: string;
  steps: ExplanationStep[];
  unknowns: string[];
  safetyNotes: string[];
}

export interface ExplanationStep {
  text: string;
  evidenceIds: string[];
}

export interface ExplainResult {
  txHash: string;
  network: string;
  status: 'ENRICHED' | 'PARTIAL' | 'FAILED';
  protocolHints: ProtocolHint[];
  operation: OperationResult | null;
  explanation: Explanation | null;
  evidence: EvidenceItem[];
  localTransfers: LocalTransferSummary[];
  humanReadable: string | null;
}
