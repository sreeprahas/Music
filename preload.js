const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  setTheme: (theme) => ipcRenderer.send('music-theme-changed', theme),
});
