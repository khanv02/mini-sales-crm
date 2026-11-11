import { AppError } from '../../src/common/errors/app-error';
import { decodeCursor, encodeCursor } from '../../src/common/pagination/cursor';

describe('cursor helpers', () => {
  it('round-trips a cursor payload', () => {
    const createdAt = new Date('2026-04-01T10:20:30.000Z');
    const cursor = encodeCursor({ id: 'user-1', createdAt });

    expect(decodeCursor(cursor)).toEqual({ id: 'user-1', createdAt });
  });

  it('produces an opaque base64url value', () => {
    const cursor = encodeCursor({ id: 'user-1', createdAt: new Date() });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(['not-base64!!', Buffer.from('{"id":1}').toString('base64url'), Buffer.from('plain').toString('base64url')])(
    'rejects a malformed cursor (%s)',
    (cursor) => {
      expect.assertions(3);
      try {
        decodeCursor(cursor);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('INVALID_CURSOR');
        expect((error as AppError).status).toBe(400);
      }
    },
  );
});
