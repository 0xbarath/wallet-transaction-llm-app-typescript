export interface SyncResponse {
  walletId: string;
  status: string;
  transfersSynced: number;
  lastSyncedBlock: string | null;
  lastSyncedAt: string | null;
}
