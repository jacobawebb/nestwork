import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { scrypt } from 'node:crypto';
import { first, run } from './db/client';

// OWASP's 16 MiB scrypt profile. Cloudflare Workers supports node:crypto's
// native scrypt implementation, while its WebCrypto PBKDF2 implementation
// rejects the previously used 600,000-iteration request above 100,000.
const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 5;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_MAX_MEMORY_BYTES = 32 * 1024 * 1024;
const IDLE_MS = 30_000;
const LOCKOUT_MS = 15 * 60_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function deriveScrypt(value: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      SCRYPT_KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY_BYTES },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(new Uint8Array(derivedKey));
      },
    );
  });
}

export async function hashCredential(value: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SCRYPT_SALT_BYTES));
  const hash = await deriveScrypt(value, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyCredential(value: string, encoded: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, saltText, hashText, extra] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    nText !== String(SCRYPT_N) ||
    rText !== String(SCRYPT_R) ||
    pText !== String(SCRYPT_P) ||
    !saltText ||
    !hashText ||
    extra !== undefined
  ) return false;

  try {
    const salt = base64ToBytes(saltText);
    const expected = base64ToBytes(hashText);
    if (salt.length !== SCRYPT_SALT_BYTES || expected.length !== SCRYPT_KEY_BYTES) return false;
    const actual = await deriveScrypt(value, salt);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function secureSecretEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ]);
  return constantTimeEqual(new Uint8Array(a), new Uint8Array(b));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

export function randomToken(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function idleExpiry(now = new Date()): string {
  return new Date(now.getTime() + IDLE_MS).toISOString();
}

function cookieName(kind: 'parent' | 'child', production: boolean): string {
  return production ? `__Host-chores_${kind}` : `chores_${kind}`;
}

export function setSessionCookie(c: Context<any>, kind: 'parent' | 'child', token: string): void {
  const production = c.env.ENVIRONMENT === 'production';
  setCookie(c, cookieName(kind, production), token, {
    httpOnly: true,
    secure: production,
    sameSite: 'Lax',
    path: '/',
    maxAge: 86_400,
  });
}

export function readSessionCookie(c: Context<any>, kind: 'parent' | 'child'): string | undefined {
  const production = c.env.ENVIRONMENT === 'production';
  return getCookie(c, cookieName(kind, production));
}

export function clearSessionCookies(c: Context<any>): void {
  for (const name of ['chores_parent', 'chores_child', '__Host-chores_parent', '__Host-chores_child']) {
    deleteCookie(c, name, { path: '/', secure: name.startsWith('__Host-') });
  }
}

export function clientIp(c: Context<any>): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function attemptKey(kind: string, target: string, ip: string): Promise<string> {
  return sha256(`${kind}\u0000${target.toLowerCase()}\u0000${ip}`);
}

export async function assertNotLocked(db: D1Database, key: string, now = new Date()): Promise<void> {
  const row = await first<{ locked_until: string | null }>(db, 'SELECT locked_until FROM auth_attempts WHERE attempt_key = ?', key);
  if (row?.locked_until && new Date(row.locked_until).getTime() > now.getTime()) {
    throw new Error('LOCKED');
  }
}

export async function recordFailedAttempt(db: D1Database, key: string, now = new Date()): Promise<void> {
  const current = await first<{ failures: number; window_started_at: string }>(
    db,
    'SELECT failures, window_started_at FROM auth_attempts WHERE attempt_key = ?',
    key,
  );
  const windowExpired = !current || now.getTime() - new Date(current.window_started_at).getTime() > LOCKOUT_MS;
  const failures = windowExpired ? 1 : current.failures + 1;
  const lockedUntil = failures >= 5 ? new Date(now.getTime() + LOCKOUT_MS).toISOString() : null;
  await run(
    db,
    `INSERT INTO auth_attempts (attempt_key, failures, window_started_at, locked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(attempt_key) DO UPDATE SET failures=excluded.failures, window_started_at=excluded.window_started_at,
       locked_until=excluded.locked_until, updated_at=excluded.updated_at`,
    key,
    failures,
    windowExpired ? now.toISOString() : current.window_started_at,
    lockedUntil,
    now.toISOString(),
  );
}

export async function clearAttempts(db: D1Database, key: string): Promise<void> {
  await run(db, 'DELETE FROM auth_attempts WHERE attempt_key = ?', key);
}

export const securityConstants = {
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  SCRYPT_SALT_BYTES,
  SCRYPT_KEY_BYTES,
  SCRYPT_MAX_MEMORY_BYTES,
  IDLE_MS,
  LOCKOUT_MS,
} as const;
