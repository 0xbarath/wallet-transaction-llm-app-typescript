export interface TransferResponse {
  id: string;
  walletId: string;
  network: string;
  hash: string;
  blockNum: string;
  blockTs: string | null;
  fromAddr: string;
  toAddr: string | null;
  direction: string;
  asset: string | null;
  category: string;
  valueDecimal: string | null;
  tokenId: string | null;
  createdAt: string;
}
