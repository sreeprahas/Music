#!/usr/bin/env node

// This is a runtime loader that uses tsx to run TypeScript
require('tsx/cjs').register();

// Now load and run the electron-main.ts
require('./electron-main.ts');


