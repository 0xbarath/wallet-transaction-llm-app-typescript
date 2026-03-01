export interface AlchemyTransfer {
  uniqueId: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  blockNum: string;
  rawContract: {
    address: string | null;
    value: string | null;
    decimal: number | null;
  } | null;
  metadata: {
    blockTimestamp: string | null;
  } | null;
  tokenId: string | null;
}

export interface AlchemyTransfersResult {
  transfers: AlchemyTransfer[];
  pageKey: string | null;
}

export interface AlchemyTransactionReceipt {
  status: string;
  blockNumber: string;
  from: string;
  to: string | null;
  contractAddress: string | null;
  gasUsed: string;
  transactionHash: string;
  logs: AlchemyLog[];
}

export interface AlchemyLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: string;
  removed: boolean;
}
