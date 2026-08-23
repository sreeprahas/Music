export interface ElectronAPI {
  platform: string;
  setTheme?: (theme: 'cyan' | 'purple' | 'green' | 'amber' | 'rose' | 'blue' | 'indigo' | 'orange' | 'mint' | 'magenta') => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
