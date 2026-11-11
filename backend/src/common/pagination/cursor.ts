import { AppError, ERROR_CODES } from '../errors/app-error';

export interface DecodedCursor {
  id: string;
  createdAt: Date;
}

/** Opaque cursor (docs/api-conventions.md section 3): base64url JSON `{ id, createdAt }`. */
export function encodeCursor(payload: DecodedCursor): string {
  return Buffer.from(JSON.stringify({ id: payload.id, createdAt: payload.createdAt.toISOString() })).toString(
    'base64url',
  );
}

/** Malformed cursors are a client error: 400 `INVALID_CURSOR`. */
export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { id?: unknown; createdAt?: unknown };
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      throw new Error('cursor shape');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('cursor date');
    }
    return { id: parsed.id, createdAt };
  } catch {
    throw new AppError(ERROR_CODES.INVALID_CURSOR, 400, 'The cursor is not valid.');
  }
}
