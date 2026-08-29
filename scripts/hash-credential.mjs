import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import process from 'node:process';

const derive = promisify(scrypt);
const credential = process.env.CREDENTIAL;
const kind = process.env.CREDENTIAL_KIND ?? 'parent';
if (!credential) throw new Error('Set CREDENTIAL in the environment; never pass a real credential on the command line.');
if (kind === 'parent' && (credential.length < 12 || !/[a-z]/.test(credential) || !/[A-Z]/.test(credential) || !/[0-9]/.test(credential))) {
  throw new Error('A parent password needs 12+ characters with uppercase, lowercase, and a number.');
}
if (kind === 'child' && !/^\d{4,6}$/.test(credential)) throw new Error('A child PIN needs 4–6 digits.');
if (!['parent', 'child'].includes(kind)) throw new Error('CREDENTIAL_KIND must be parent or child.');

const N = 2 ** 14;
const r = 8;
const p = 5;
const salt = randomBytes(16);
const hash = await derive(credential, salt, 32, { N, r, p, maxmem: 32 * 1024 * 1024 });
process.stdout.write(`scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}\n`);
