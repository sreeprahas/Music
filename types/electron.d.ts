export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getAppPath: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
