import { pbkdf2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import process from 'node:process';

const derive = promisify(pbkdf2);
const credential = process.env.CREDENTIAL;
const kind = process.env.CREDENTIAL_KIND ?? 'parent';
if (!credential) throw new Error('Set CREDENTIAL in the environment; never pass a real credential on the command line.');
if (kind === 'parent' && (credential.length < 12 || !/[a-z]/.test(credential) || !/[A-Z]/.test(credential) || !/[0-9]/.test(credential))) {
  throw new Error('A parent password needs 12+ characters with uppercase, lowercase, and a number.');
}
if (kind === 'child' && !/^\d{4,6}$/.test(credential)) throw new Error('A child PIN needs 4–6 digits.');
if (!['parent', 'child'].includes(kind)) throw new Error('CREDENTIAL_KIND must be parent or child.');

const iterations = 600_000;
const salt = randomBytes(16);
const hash = await derive(credential, salt, iterations, 32, 'sha256');
process.stdout.write(`pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}\n`);
