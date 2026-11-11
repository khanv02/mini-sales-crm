import { AuditService, redactSnapshot } from '../../src/common/audit/audit.service';
import { getRequestId } from '../../src/common/logging/request-context';

jest.mock('../../src/common/logging/request-context', () => ({
  getRequestId: jest.fn(() => 'req-from-context'),
}));

const mockedGetRequestId = jest.mocked(getRequestId);

describe('redactSnapshot', () => {
  it('removes secrets at the top level and keeps the rest', () => {
    const redacted = redactSnapshot({
      email: 'admin@acme.test',
      password: 'super-secret',
      passwordHash: '$argon2id$v=19$...',
      active: true,
    });

    expect(redacted).toEqual({
      email: 'admin@acme.test',
      password: '[REDACTED]',
      passwordHash: '[REDACTED]',
      active: true,
    });
  });

  it('removes secrets in nested objects and arrays', () => {
    const redacted = redactSnapshot({
      sessions: [{ refreshToken: 'raw-token', userAgent: 'jest' }],
      meta: { authorization: 'Bearer abc', cookie: 'pulse_refresh=xyz', safe: 'ok' },
    });

    expect(redacted).toEqual({
      sessions: [{ refreshToken: '[REDACTED]', userAgent: 'jest' }],
      meta: { authorization: '[REDACTED]', cookie: '[REDACTED]', safe: 'ok' },
    });
    expect(JSON.stringify(redacted)).not.toContain('raw-token');
  });

  it('ignores snake_case keys and returns undefined for empty input', () => {
    expect(redactSnapshot({ password_hash: 'x', access_token: 'y' })).toEqual({
      password_hash: '[REDACTED]',
      access_token: '[REDACTED]',
    });
    expect(redactSnapshot(undefined)).toBeUndefined();
    expect(redactSnapshot(null)).toBeUndefined();
  });

  it('truncates overly deep structures instead of walking forever', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let depth = 0; depth < 10; depth += 1) {
      deep = { nested: deep };
    }
    expect(JSON.stringify(redactSnapshot(deep))).toContain('[REDACTED]');
  });
});

describe('AuditService', () => {
  const audit = new AuditService();

  function fakeTx(): { auditLog: { create: jest.Mock } } {
    return { auditLog: { create: jest.fn().mockResolvedValue({}) } };
  }

  beforeEach(() => {
    mockedGetRequestId.mockReturnValue('req-from-context');
  });

  it('writes org, actor, entity and action inside the caller transaction', async () => {
    const tx = fakeTx();

    await audit.record(tx as never, {
      orgId: 'org-1',
      actorId: 'user-1',
      entity: 'User',
      entityId: 'user-1',
      action: 'UPDATE',
      before: { role: 'ADMIN' },
      after: { role: 'MANAGER' },
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: 'org-1',
        actorId: 'user-1',
        entity: 'User',
        entityId: 'user-1',
        action: 'UPDATE',
        before: { role: 'ADMIN' },
        after: { role: 'MANAGER' },
        requestId: 'req-from-context',
        ip: null,
      }),
    });
  });

  it('prefers an explicit requestId and redacts the snapshots', async () => {
    const tx = fakeTx();

    await audit.record(tx as never, {
      orgId: 'org-1',
      entity: 'User',
      entityId: 'user-2',
      action: 'CREATE',
      after: { email: 'new@acme.test', password: 'plain' },
      requestId: 'explicit-id',
      ip: '127.0.0.1',
    });

    const payload = tx.auditLog.create.mock.calls[0][0].data;
    expect(payload.requestId).toBe('explicit-id');
    expect(payload.ip).toBe('127.0.0.1');
    expect(payload.actorId).toBeNull();
    expect(payload.after).toEqual({ email: 'new@acme.test', password: '[REDACTED]' });
  });
});
