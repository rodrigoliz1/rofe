import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['--prefix', 'backend', 'run', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32', detached: process.platform !== 'win32' }),
  spawn(npm, ['run', 'dev:web', '--', '--host'], { stdio: 'inherit', shell: process.platform === 'win32', detached: process.platform !== 'win32' }),
];
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      try {
        if (process.platform === 'win32') child.kill();
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
for (const child of children) {
  child.on('error', (error) => {
    console.error(`No se pudo iniciar ROFÉ: ${error.message}`);
    process.exitCode = 1;
    stop('SIGTERM');
  });
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop('SIGTERM');
    }
  });
}
