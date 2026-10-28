/**
 * Log runner for fix-stack on Windows: `node stack-log-runner.mjs <logFile> <cmd> [args...]`.
 *
 * fix-stack starts the API and the web server detached so they outlive the command that started them. On Windows a
 * detached process has no console, and the output of what it starts was lost (the slot logs stayed empty, so there
 * were no http.request timings). This runner is the detached process: it starts the real command attached to itself
 * with pipes and appends both streams to the log file. Stopping the stack kills the whole tree (taskkill /T).
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

const [logFile, cmd, ...args] = process.argv.slice(2);
if (!logFile || !cmd) {
  console.error('usage: node stack-log-runner.mjs <logFile> <cmd> [args...]');
  process.exit(2);
}

const out = createWriteStream(logFile, { flags: 'a' });
const child = spawn(cmd, args, {
  env: process.env,
  shell: process.platform === 'win32',
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(out, { end: false });
child.stderr.pipe(out, { end: false });
child.on('error', (e) => out.write(`[stack-log-runner] failed to start ${cmd}: ${e.message}\n`));
child.on('exit', (code, signal) => {
  out.end(`[stack-log-runner] ${cmd} exited (${signal ?? code})\n`, () => process.exit(code ?? 0));
});
