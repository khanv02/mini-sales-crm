import { PasswordService } from '../../src/common/security/password.service';
import { buildTestEnv } from '../support/test-env';

const service = new PasswordService(buildTestEnv());

describe('PasswordService', () => {
  it('hashes with Argon2id and never stores the plaintext', async () => {
    const hash = await service.hash('Password123!');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Password123!');
    expect(hash.length).toBeGreaterThan(40);
  });

  it('produces a different hash every time (random salt)', async () => {
    const [first, second] = await Promise.all([service.hash('Password123!'), service.hash('Password123!')]);
    expect(first).not.toBe(second);
  });

  it('matches the correct password and rejects a wrong one', async () => {
    const hash = await service.hash('Password123!');

    await expect(service.matches(hash, 'Password123!')).resolves.toBe(true);
    await expect(service.matches(hash, 'password123!')).resolves.toBe(false);
    await expect(service.matches(hash, 'Password123! ')).resolves.toBe(false);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(service.matches('not-a-hash', 'Password123!')).resolves.toBe(false);
  });
});
