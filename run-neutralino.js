const { spawn } = require('child_process');
const { join } = require('path');

const cwd = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const neutralinoCli = join(cwd, 'node_modules', '@neutralinojs', 'neu', 'bin', 'neu.js');

function spawnHidden(command, args) {
  return spawn(command, args, {
    cwd,
    windowsHide: true,
    stdio: 'ignore',
  });
}

const server = spawnHidden(npmCmd, ['run', 'start']);
const neu = spawnHidden(process.execPath, [neutralinoCli, 'run']);

function terminate(code = 0) {
  [server, neu].forEach((child) => {
    if (child && !child.killed) {
      child.kill();
    }
  });
  process.exit(code);
}

server.on('exit', (code) => {
  if (!neu.killed) {
    neu.kill();
  }
  terminate(code ?? 0);
});

neu.on('exit', (code) => {
  if (!server.killed) {
    server.kill();
  }
  terminate(code ?? 0);
});

process.on('SIGINT', () => terminate(0));
process.on('SIGTERM', () => terminate(0));
process.on('uncaughtException', () => terminate(1));
