export class AlchemyApiException extends Error {
  constructor(message: string) {
    super(`External API error: ${message}`);
    this.name = 'AlchemyApiException';
  }
}
