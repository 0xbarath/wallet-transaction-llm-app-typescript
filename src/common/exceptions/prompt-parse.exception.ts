export class PromptParseException extends Error {
  public readonly needsClarification: string[];

  constructor(message: string, needsClarification: string[] = []) {
    super(message);
    this.name = 'PromptParseException';
    this.needsClarification = needsClarification;
  }
}
