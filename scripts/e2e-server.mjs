import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const stateDirectory = path.resolve(root, '.wrangler', 'e2e-state');
const allowedParent = `${path.resolve(root, '.wrangler')}${path.sep}`;
if (!stateDirectory.startsWith(allowedParent)) throw new Error('Refusing to reset an E2E state directory outside .wrangler.');
await rm(stateDirectory, { recursive: true, force: true });

const viteCli = path.resolve(root, 'node_modules', 'vite', 'bin', 'vite.js');
const wranglerCli = path.resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const run = (cli, args) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(viteCli, ['build']);
run(wranglerCli, ['d1', 'migrations', 'apply', 'nestwork-production', '--local', '--persist-to', stateDirectory]);

const worker = spawn(
  process.execPath,
  [
    wranglerCli,
    'dev', '--local', '--test-scheduled', '--port', '8790', '--persist-to', stateDirectory,
    '--var', 'BOOTSTRAP_SECRET:e2e-bootstrap-secret-at-least-32-characters',
    '--var', 'ENVIRONMENT:test', '--var', 'APP_VERSION:0.1.0-test', '--var', 'APP_COMMIT:e2e',
  ],
  { cwd: root, stdio: 'inherit' },
);

const stop = (signal) => {
  if (!worker.killed) worker.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
worker.on('exit', (code) => process.exit(code ?? 0));
