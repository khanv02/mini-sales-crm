import { TokenService, parseDurationSeconds } from '../../src/common/auth/token.service';
import type { Env } from '../../src/common/config/env';
import { AppError } from '../../src/common/errors/app-error';
import { buildTestEnv } from '../support/test-env';

const env = buildTestEnv();

function createService(overrides: Partial<Env> = {}): TokenService {
  return new TokenService(buildTestEnv(overrides));
}

describe('parseDurationSeconds', () => {
  it.each([
    ['15m', 900],
    ['7d', 604_800],
    ['30s', 30],
    ['2h', 7_200],
    ['nonsense', 0],
  ])('parses %s as %i seconds', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });
});

describe('TokenService', () => {
  it('exposes the configured TTLs', () => {
    expect(createService().accessTokenTtlSeconds).toBe(900);
    expect(createService().refreshTokenTtlSeconds).toBe(604_800);
  });

  it('signs an access token with the required claims', () => {
    const service = createService();
    const issued = service.signAccessToken({
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      role: 'ADMIN',
      active: true,
    });

    const claims = service.verifyAccessToken(issued.token);
    expect(claims).toMatchObject({
      sub: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      role: 'ADMIN',
      active: true,
    });
    expect(typeof claims.jti).toBe('string');
    expect(claims.exp - claims.iat).toBe(900);
    expect(issued.expiresIn).toBe(900);
  });

  it('rejects a token signed with another secret as TOKEN_INVALID', () => {
    const foreign = new TokenService(buildTestEnv({ JWT_ACCESS_SECRET: 'x'.repeat(40) }));
    const issued = foreign.signAccessToken({
      id: 'a',
      orgId: 'b',
      role: 'SALES',
      active: true,
    });

    expect.assertions(2);
    try {
      createService().verifyAccessToken(issued.token);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('TOKEN_INVALID');
    }
  });

  it('rejects an expired token as TOKEN_EXPIRED', () => {
    const expired = createService().signAccessToken(
      { id: 'a', orgId: 'b', role: 'SALES', active: true },
      { now: new Date(Date.now() - 3_600_000) },
    );

    expect.assertions(2);
    try {
      createService().verifyAccessToken(expired.token);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('TOKEN_EXPIRED');
    }
  });

  it('rejects a malformed token as TOKEN_INVALID', () => {
    expect.assertions(2);
    try {
      createService().verifyAccessToken('not-a-jwt');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('TOKEN_INVALID');
    }
  });

  it('issues opaque refresh tokens and hashes them with the pepper', () => {
    const service = createService();
    const token = service.issueRefreshToken();
    const other = service.issueRefreshToken();

    expect(token).not.toBe(other);
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(32);

    const hashed = service.hashRefreshToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(token);
    expect(service.refreshTokenMatches(hashed, service.hashRefreshToken(token))).toBe(true);
    expect(service.refreshTokenMatches(hashed, service.hashRefreshToken(other))).toBe(false);
    expect(service.refreshTokenMatches(hashed, 'short')).toBe(false);
  });

  it('uses a different hash when the pepper changes', () => {
    const token = 'fixed-token-value';
    expect(createService().hashRefreshToken(token)).not.toBe(
      createService({ JWT_REFRESH_PEPPER: 'p'.repeat(40) }).hashRefreshToken(token),
    );
  });

  it('computes the refresh expiry from the configured TTL', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(createService().refreshTokenExpiry(now).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('falls back to safe defaults when the TTLs are unparsable', () => {
    const service = createService({ JWT_ACCESS_TTL: 'oops', JWT_REFRESH_TTL: '' });
    expect(service.accessTokenTtlSeconds).toBe(900);
    expect(service.refreshTokenTtlSeconds).toBe(604_800);
  });
});

describe('test environment fixture', () => {
  it('keeps the access TTL at 15 minutes for the assertions above', () => {
    expect(env.JWT_ACCESS_TTL).toBe('15m');
  });
});
