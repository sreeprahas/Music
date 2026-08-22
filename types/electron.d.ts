export interface ElectronAPI {
  platform: string;
  setTheme?: (theme: 'cyan' | 'purple' | 'green' | 'amber' | 'rose') => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
