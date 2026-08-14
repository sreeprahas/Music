const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

let mainWindow;
let nextProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Remove default menu
  Menu.setApplicationMenu(null);

  if (isDev) {
    // In development, connect to the dev server
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, start the Next.js server
    const nextStart = spawn('npm', ['run', 'start'], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    nextProcess = nextStart;
    
    // Give the server time to start
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:3000');
    }, 3000);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Add a small delay to ensure dev server is ready (if using electron-dev)
  setTimeout(createWindow, 1000);
});

app.on('window-all-closed', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
