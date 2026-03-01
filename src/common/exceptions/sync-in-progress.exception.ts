export class SyncInProgressException extends Error {
  constructor(walletId: string) {
    super(`Sync already in progress for wallet: ${walletId}`);
    this.name = 'SyncInProgressException';
  }
}
