export class ForbiddenCategoryException extends Error {
  constructor(message = 'INTERNAL transfers are only accessible to admins') {
    super(message);
    this.name = 'ForbiddenCategoryException';
  }
}
