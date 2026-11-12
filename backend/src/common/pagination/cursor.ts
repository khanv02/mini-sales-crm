import { AppError, ERROR_CODES } from '../errors/app-error';

export interface DecodedCursor {
  id: string;
  createdAt: Date;
  /** Sort key when the list is not ordered by `createdAt` (for example `lower(name)`). */
  sortValue?: string;
}

/** Opaque cursor (docs/api-conventions.md section 3): base64url JSON `{ id, createdAt, sortValue? }`. */
export function encodeCursor(payload: DecodedCursor): string {
  const body: Record<string, unknown> = {
    id: payload.id,
    createdAt: payload.createdAt.toISOString(),
  };
  if (payload.sortValue !== undefined) {
    body.sortValue = payload.sortValue;
  }
  return Buffer.from(JSON.stringify(body)).toString('base64url');
}

/** Malformed cursors are a client error: 400 `INVALID_CURSOR`. */
export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { id?: unknown; createdAt?: unknown; sortValue?: unknown };
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      throw new Error('cursor shape');
    }
    if (parsed.sortValue !== undefined && typeof parsed.sortValue !== 'string') {
      throw new Error('cursor sort value');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('cursor date');
    }
    return parsed.sortValue === undefined
      ? { id: parsed.id, createdAt }
      : { id: parsed.id, createdAt, sortValue: parsed.sortValue };
  } catch {
    throw new AppError(ERROR_CODES.INVALID_CURSOR, 400, 'The cursor is not valid.');
  }
}
