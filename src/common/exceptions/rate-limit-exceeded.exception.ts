export class RateLimitExceededException extends Error {
  constructor(walletId: string) {
    super(`Rate limit exceeded for wallet: ${walletId}`);
    this.name = 'RateLimitExceededException';
  }
}
