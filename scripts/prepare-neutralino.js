const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESOURCES_APP = path.join(ROOT, 'resources', 'app');
const SERVER_SRC = path.join(ROOT, 'server');
const NEXT_STANDALONE = path.join(ROOT, '.next', 'standalone');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyServer() {
  ensureDir(RESOURCES_APP);
  const dest = path.join(RESOURCES_APP, 'server');
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  if (fs.existsSync(NEXT_STANDALONE)) {
    fs.cpSync(NEXT_STANDALONE, dest, { recursive: true });
    console.log('Copied Next standalone ->', dest);
  } else if (fs.existsSync(SERVER_SRC)) {
    fs.cpSync(SERVER_SRC, dest, { recursive: true });
    console.log('Copied server ->', dest);
  } else {
    console.warn('No server artifact found; skipped copying server into resources.');
  }
}

function writeWrappers() {
  ensureDir(RESOURCES_APP);
  const bat = path.join(RESOURCES_APP, 'start-server.bat');
  const sh = path.join(RESOURCES_APP, 'start-server.sh');

  const batContent = [`@echo off`, `SET APP_DIR=%~dp0`, `if exist "%APP_DIR%node\\node.exe" (`, `  if exist "%APP_DIR%server\\server.js" (`, `    "%APP_DIR%node\\node.exe" "%APP_DIR%server\\server.js" %*`, `  ) else if exist "%APP_DIR%server\\index.js" (`, `    "%APP_DIR%node\\node.exe" "%APP_DIR%server\\index.js" %*`, `  ) else (`, `    "%APP_DIR%node\\node.exe" -e "console.error('No server entry found'); process.exit(1)"`, `  )`, `) else (`, `  if exist "%APP_DIR%server\\server.js" (`, `    node "%APP_DIR%server\\server.js" %*`, `  ) else if exist "%APP_DIR%server\\index.js" (`, `    node "%APP_DIR%server\\index.js" %*`, `  ) else (`, `    node -e "console.error('No server entry found'); process.exit(1)"`, `  )`, `)`].join('\r\n');
  fs.writeFileSync(bat, batContent, 'utf-8');
  fs.chmodSync(bat, 0o755);

  const shContent = ['#!/usr/bin/env bash', 'APP_DIR="$(dirname "$0")"', 'if [ -x "$APP_DIR/node/node" ]; then', '  if [ -f "$APP_DIR/server/server.js" ]; then', '    "$APP_DIR/node/node" "$APP_DIR/server/server.js" "$@"', '  elif [ -f "$APP_DIR/server/index.js" ]; then', '    "$APP_DIR/node/node" "$APP_DIR/server/index.js" "$@"', '  else', '    echo "No server entry found"; exit 1', '  fi', 'else', '  if [ -f "$APP_DIR/server/server.js" ]; then', '    node "$APP_DIR/server/server.js" "$@"', '  elif [ -f "$APP_DIR/server/index.js" ]; then', '    node "$APP_DIR/server/index.js" "$@"', '  else', '    echo "No server entry found"; exit 1', '  fi', 'fi'].join('\n');
  fs.writeFileSync(sh, shContent, 'utf-8');
  fs.chmodSync(sh, 0o755);

  console.log('Wrote start-server wrappers.');
}

function prepare() {
  if (!fs.existsSync(SERVER_SRC)) {
    console.warn('No server folder found at', SERVER_SRC);
    return;
  }
  copyServer();
  writeWrappers();
}

prepare();
