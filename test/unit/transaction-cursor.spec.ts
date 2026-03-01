import { encodeCursor, decodeCursor } from '../../src/transaction/transaction-cursor';
import { InvalidCursorException } from '../../src/common/exceptions/invalid-cursor.exception';

describe('TransactionCursor', () => {
  it('should roundtrip encode/decode', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    const id = '550e8400-e29b-41d4-a716-446655440000';

    const cursor = encodeCursor(date, id);
    const decoded = decodeCursor(cursor);

    expect(decoded.createdAt.toISOString()).toBe(date.toISOString());
    expect(decoded.id).toBe(id);
  });

  it('should produce base64url string', () => {
    const cursor = encodeCursor(new Date('2024-01-01T00:00:00Z'), 'test-id');
    expect(cursor).not.toContain('+');
    expect(cursor).not.toContain('/');
    expect(cursor).not.toContain('=');
  });

  it('should throw InvalidCursorException for empty string', () => {
    expect(() => decodeCursor('')).toThrow(InvalidCursorException);
  });

  it('should throw InvalidCursorException for garbage', () => {
    expect(() => decodeCursor('not-a-valid-cursor!!!')).toThrow(InvalidCursorException);
  });

  it('should throw InvalidCursorException for missing separator', () => {
    const noSep = Buffer.from('nodatenoId').toString('base64url');
    expect(() => decodeCursor(noSep)).toThrow(InvalidCursorException);
  });

  it('should throw InvalidCursorException for bad date', () => {
    const badDate = Buffer.from('not-a-date|some-id').toString('base64url');
    expect(() => decodeCursor(badDate)).toThrow(InvalidCursorException);
  });

  it('should throw InvalidCursorException for missing id', () => {
    const noId = Buffer.from('2024-01-01T00:00:00.000Z|').toString('base64url');
    expect(() => decodeCursor(noId)).toThrow(InvalidCursorException);
  });
});
