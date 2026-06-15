const { spawn } = require('child_process');
console.log('Spawning node dist/index.js...');
const child = spawn('node', ['dist/index.js']);

child.stdout.on('data', (data) => {
  console.log(`STDOUT: ${data}`);
});

child.stderr.on('data', (data) => {
  console.error(`STDERR: ${data}`);
});

child.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});

setTimeout(() => {
  console.log('3 seconds elapsed. Killing child process to see if it works...');
  child.kill();
  process.exit(0);
}, 3000);
