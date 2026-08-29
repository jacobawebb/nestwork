import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const required = [
  'BENCHMARK_BASE_URL', 'BENCHMARK_PARENT_NAME', 'BENCHMARK_PARENT_EMAIL', 'BENCHMARK_PARENT_PASSWORD',
  'BENCHMARK_CHILD_NAME', 'BENCHMARK_CHILD_PIN',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing benchmark environment variables: ${missing.join(', ')}`);

const baseUrl = process.env.BENCHMARK_BASE_URL.replace(/\/$/, '');
const origin = new globalThis.URL(baseUrl).origin;
const samples = Math.min(10, Math.max(1, Number.parseInt(process.env.BENCHMARK_SAMPLES ?? '3', 10) || 3));

async function request(path, { method = 'GET', body, cookie } = {}) {
  const started = globalThis.performance.now();
  const headers = new globalThis.Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('Origin', origin);
  if (cookie) headers.set('Cookie', cookie);
  const response = await globalThis.fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  return { response, payload, elapsedMs: globalThis.performance.now() - started };
}

function sessionCookie(headers, kind) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') ?? ''];
  const pattern = kind === 'parent'
    ? /(__Host-chores_parent|chores_parent)=([^;,\s]+)/g
    : /(__Host-chores_child|chores_child)=([^;,\s]+)/g;
  const matches = values.flatMap((value) => [...value.matchAll(pattern)]).filter((match) => match[2]);
  const match = matches.at(-1);
  if (!match) throw new Error(`The ${kind} login response did not set the expected secure session cookie.`);
  return `${match[1]}=${match[2]}`;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function expectStatus(result, status, label) {
  if (result.response.status !== status) {
    const code = result.payload?.error?.code ?? 'UNKNOWN';
    throw new Error(`${label} returned HTTP ${result.response.status} (${code}); expected ${status}.`);
  }
}

const profilesResult = await request('/profiles');
await expectStatus(profilesResult, 200, 'Profile selector');
if (!profilesResult.payload?.initialized) throw new Error('The remote deployment has not completed /setup.');
const parent = profilesResult.payload.profiles.find((profile) => profile.type === 'PARENT' && profile.displayName === process.env.BENCHMARK_PARENT_NAME);
const child = profilesResult.payload.profiles.find((profile) => profile.type === 'CHILD' && profile.displayName === process.env.BENCHMARK_CHILD_NAME);
if (!parent || !child) throw new Error('Benchmark parent or child profile name did not match the remote selector.');

const parentTimes = [];
let parentCookie;
for (let sample = 0; sample < samples; sample += 1) {
  const result = await request('/login/parent', {
    method: 'POST',
    body: { profileId: parent.id, email: process.env.BENCHMARK_PARENT_EMAIL, password: process.env.BENCHMARK_PARENT_PASSWORD },
  });
  await expectStatus(result, 200, 'Parent password sign-in');
  parentTimes.push(result.elapsedMs);
  parentCookie = sessionCookie(result.response.headers, 'parent');
  if (sample < samples - 1) await request('/session/logout', { method: 'POST', body: {}, cookie: parentCookie });
}

const maintenance = await request('/parent/maintenance/run', { method: 'POST', body: {}, cookie: parentCookie });
await expectStatus(maintenance, 200, 'Manual scheduled maintenance');

const childTimes = [];
let childCookie;
let childLoginFinishedAt = 0;
for (let sample = 0; sample < samples; sample += 1) {
  const result = await request('/login/child', {
    method: 'POST',
    body: { profileId: child.id, pin: process.env.BENCHMARK_CHILD_PIN },
  });
  await expectStatus(result, 200, 'Child PIN sign-in');
  childTimes.push(result.elapsedMs);
  childCookie = sessionCookie(result.response.headers, 'child');
  childLoginFinishedAt = globalThis.performance.now();
  if (sample < samples - 1) await request('/session/logout', { method: 'POST', body: {}, cookie: childCookie });
}

await delay(10_100);
const stale = await request('/session', { cookie: childCookie });
await expectStatus(stale, 401, 'Stale session check');
if (stale.payload?.error?.code !== 'SESSION_LOCKED') throw new Error('The stale session did not fail with SESSION_LOCKED.');
const lockObservedMs = globalThis.performance.now() - childLoginFinishedAt;

const report = {
  target: new globalThis.URL(baseUrl).host,
  samples,
  workFactor: { algorithm: 'scrypt', N: 2 ** 14, r: 8, p: 5, memoryMiB: 16 },
  parentPasswordSignInMs: { samples: parentTimes.map(Math.round), median: Math.round(median(parentTimes)) },
  childPinSignInMs: { samples: childTimes.map(Math.round), median: Math.round(median(childTimes)) },
  scheduledMaintenanceMs: Math.round(maintenance.elapsedMs),
  scheduledMaintenanceResult: maintenance.payload,
  idleLockObservedMs: Math.round(lockObservedMs),
  staleSessionRejected: true,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
