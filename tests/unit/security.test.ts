import { describe, expect, it, vi } from 'vitest';
import { hashCredential, idleExpiry, secureSecretEqual, verifyCredential } from '@/server/security';

describe('Worker-compatible credential and idle security', () => {
  it('stores a unique salted slow hash and verifies without storing the secret', async () => {
    const first = await hashCredential('StrongPassword123');
    const second = await hashCredential('StrongPassword123');
    expect(first).not.toBe(second);
    expect(first).not.toContain('StrongPassword123');
    expect(await verifyCredential('StrongPassword123', first)).toBe(true);
    expect(await verifyCredential('WrongPassword123', first)).toBe(false);
  });

  it('does not request PBKDF2 work above the Cloudflare Workers per-call limit', async () => {
    const originalDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits').mockImplementation((algorithm, key, length) => {
      if (typeof algorithm === 'object' && algorithm.name === 'PBKDF2' && (algorithm as Pbkdf2Params).iterations > 100_000) {
        return Promise.reject(new Error('Pbkdf2 failed: iteration counts above 100000 are not supported'));
      }
      return originalDeriveBits(algorithm, key, length);
    });

    try {
      const encoded = await hashCredential('StrongPassword123');
      expect(await verifyCredential('StrongPassword123', encoded)).toBe(true);
    } finally {
      deriveBits.mockRestore();
    }
  });

  it('compares bootstrap secrets safely and sets exactly a thirty-second idle expiry', async () => {
    expect(await secureSecretEqual('same-value', 'same-value')).toBe(true);
    expect(await secureSecretEqual('same-value', 'different-value')).toBe(false);
    expect(idleExpiry(new Date('2026-08-28T10:00:00.000Z'))).toBe('2026-08-28T10:00:30.000Z');
  });
});
