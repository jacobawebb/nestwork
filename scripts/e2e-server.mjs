import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const stateDirectory = path.resolve(root, '.wrangler', 'e2e-state');
const allowedParent = `${path.resolve(root, '.wrangler')}${path.sep}`;
if (!stateDirectory.startsWith(allowedParent)) throw new Error('Refusing to reset an E2E state directory outside .wrangler.');
await rm(stateDirectory, { recursive: true, force: true });

const packageManagerCli = process.env.npm_execpath;
if (!packageManagerCli) {
  throw new Error('Run the E2E server through the package script: pnpm e2e:server.');
}

const packageManagerCommand = [process.execPath, packageManagerCli];
const run = (args) => {
  const result = spawnSync(packageManagerCommand[0], [...packageManagerCommand.slice(1), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['build']);
run(['exec', 'wrangler', 'd1', 'migrations', 'apply', 'nestwork-production', '--local', '--persist-to', stateDirectory]);

const worker = spawn(
  packageManagerCommand[0],
  [
    ...packageManagerCommand.slice(1),
    'exec', 'wrangler', 'dev', '--local', '--test-scheduled', '--port', '8790', '--persist-to', stateDirectory,
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
