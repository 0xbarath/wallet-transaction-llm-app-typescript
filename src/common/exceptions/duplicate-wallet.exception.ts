export class DuplicateWalletException extends Error {
  constructor(address: string, network: string) {
    super(`Wallet already registered: ${address} on ${network}`);
    this.name = 'DuplicateWalletException';
  }
}
