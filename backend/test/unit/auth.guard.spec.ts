import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { extractBearerToken, JwtAuthGuard } from '../../src/common/auth/jwt-auth.guard';
import { PrincipalService } from '../../src/common/auth/principal.service';
import type { PrincipalRepository } from '../../src/common/auth/principal.repository';
import { ROLES_KEY } from '../../src/common/auth/roles.decorator';
import { RolesGuard } from '../../src/common/auth/roles.guard';
import type { TokenService } from '../../src/common/auth/token.service';
import { AppError } from '../../src/common/errors/app-error';

jest.mock('../../src/common/logging/request-context', () => ({
  updateRequestContext: jest.fn(),
}));

interface FakeRequest {
  headers: { authorization?: string };
  user?: unknown;
}

function createContext(request: FakeRequest, handler?: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler ?? {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('extractBearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['Bearer   abc  ', 'abc'],
    [undefined, undefined],
    ['abc', undefined],
    ['Basic abc', undefined],
  ])('parses %s', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe('JwtAuthGuard', () => {
  const principal = { userId: 'user-1', orgId: 'org-1', role: 'ADMIN' as const, active: true };

  function createGuard(
    options: { claims?: unknown; principal?: unknown; error?: Error } = {},
  ): JwtAuthGuard {
    const tokens = {
      verifyAccessToken: jest.fn(() => {
        if (options.error) {
          throw options.error;
        }
        return options.claims ?? { sub: 'user-1' };
      }),
    } as unknown as TokenService;
    const principals = {
      load: jest.fn().mockResolvedValue(options.principal === undefined ? principal : options.principal),
    } as unknown as PrincipalService;
    return new JwtAuthGuard(tokens, principals);
  }

  it('rejects a request without a bearer token', async () => {
    await expect(createGuard().canActivate(createContext({ headers: {} }))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
  });

  it('propagates the token verification error', async () => {
    const guard = createGuard({ error: new AppError('TOKEN_EXPIRED', 401, 'expired') });
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('rejects an unknown user', async () => {
    const guard = createGuard({ principal: null });
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects a deactivated user', async () => {
    const guard = createGuard({ principal: { ...principal, active: false } });
    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE', status: 401 });
  });

  it('attaches the database-backed principal to the request', async () => {
    const request: FakeRequest = { headers: { authorization: 'Bearer abc' } };
    await expect(createGuard().canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual(principal);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows a route without @Roles', () => {
    expect(guard.canActivate(createContext({ headers: {} }))).toBe(true);
  });

  it('allows a matching role', () => {
    const handler = { name: 'list' };
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], handler);
    const request: FakeRequest = { headers: {}, user: { role: 'ADMIN' } };
    expect(guard.canActivate(createContext(request, handler))).toBe(true);
  });

  it('rejects a lower role with 403', () => {
    const handler = { name: 'update' };
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], handler);
    const request: FakeRequest = { headers: {}, user: { role: 'SALES' } };

    expect.assertions(2);
    try {
      guard.canActivate(createContext(request, handler));
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
  });

  it('rejects an unauthenticated caller', () => {
    const handler = { name: 'create' };
    Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], handler);

    expect.assertions(2);
    try {
      guard.canActivate(createContext({ headers: {} }, handler));
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('PrincipalService', () => {
  function createService(user: unknown = { userId: 'u1', orgId: 'o1', role: 'SALES', active: true }) {
    const repository = {
      findById: jest.fn().mockResolvedValue(user),
    } as unknown as PrincipalRepository;
    return { service: new PrincipalService(repository), repository };
  }

  it('caches the lookup for the TTL window', async () => {
    const { service, repository } = createService();
    await service.load('u1');
    await service.load('u1');
    expect(repository.findById).toHaveBeenCalledTimes(1);
  });

  it('caches a missing user so the guard keeps returning 401', async () => {
    const { service, repository } = createService(null);
    expect(await service.load('u1')).toBeNull();
    expect(await service.load('u1')).toBeNull();
    expect(repository.findById).toHaveBeenCalledTimes(1);
  });

  it('re-reads after invalidation so a role change applies on the next request', async () => {
    const { service, repository } = createService();
    await service.load('u1');
    service.invalidate('u1');
    await service.load('u1');
    expect(repository.findById).toHaveBeenCalledTimes(2);

    service.clear();
    await service.load('u1');
    expect(repository.findById).toHaveBeenCalledTimes(3);
  });
});
