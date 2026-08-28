import { describe, expect, it } from 'vitest';
import { hashCredential, idleExpiry, secureSecretEqual, verifyCredential } from '@/server/security';

describe('Worker-compatible credential and idle security', () => {
  it('stores a unique salted PBKDF2 hash and verifies without storing the secret', async () => {
    const first = await hashCredential('StrongPassword123', 100_000);
    const second = await hashCredential('StrongPassword123', 100_000);
    expect(first).not.toBe(second);
    expect(first).not.toContain('StrongPassword123');
    expect(await verifyCredential('StrongPassword123', first)).toBe(true);
    expect(await verifyCredential('WrongPassword123', first)).toBe(false);
  });

  it('compares bootstrap secrets safely and sets exactly a ten-second idle expiry', async () => {
    expect(await secureSecretEqual('same-value', 'same-value')).toBe(true);
    expect(await secureSecretEqual('same-value', 'different-value')).toBe(false);
    expect(idleExpiry(new Date('2026-08-28T10:00:00.000Z'))).toBe('2026-08-28T10:00:10.000Z');
  });
});
