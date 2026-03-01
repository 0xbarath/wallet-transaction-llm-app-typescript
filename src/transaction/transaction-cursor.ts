import { InvalidCursorException } from '../common/exceptions/invalid-cursor.exception';

export interface CursorValue {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  const payload = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(payload).toString('base64url');
}

export function decodeCursor(cursor: string): CursorValue {
  try {
    const payload = Buffer.from(cursor, 'base64url').toString('utf-8');
    const separatorIndex = payload.indexOf('|');
    if (separatorIndex === -1) {
      throw new InvalidCursorException('Invalid cursor format');
    }

    const dateStr = payload.substring(0, separatorIndex);
    const id = payload.substring(separatorIndex + 1);

    const createdAt = new Date(dateStr);
    if (isNaN(createdAt.getTime())) {
      throw new InvalidCursorException('Invalid cursor: bad date');
    }
    if (!id) {
      throw new InvalidCursorException('Invalid cursor: missing id');
    }

    return { createdAt, id };
  } catch (error) {
    if (error instanceof InvalidCursorException) throw error;
    throw new InvalidCursorException('Invalid cursor format');
  }
}
