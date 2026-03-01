export class InvalidCursorException extends Error {
  constructor(detail = 'Invalid cursor format') {
    super(detail);
    this.name = 'InvalidCursorException';
  }
}
