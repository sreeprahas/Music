const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  setTheme: (theme) => ipcRenderer.send('music-theme-changed', theme),
  openSpotApiPopup: () => ipcRenderer.invoke('spotify-open-popup'),
});
