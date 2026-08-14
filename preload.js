const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    cancelLogin: () => ipcRenderer.invoke('auth:cancel-login'),
    getSession: () => ipcRenderer.invoke('auth:get-session'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onLoginSuccess: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('auth:login-success', handler);
      return () => ipcRenderer.removeListener('auth:login-success', handler);
    },
    onLoginError: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('auth:login-error', handler);
      return () => ipcRenderer.removeListener('auth:login-error', handler);
    },
  },
});
