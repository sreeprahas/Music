export interface ElectronAPI {
  platform: string;
  setTheme?: (theme: 'cyan' | 'purple' | 'green' | 'amber' | 'rose') => void;
  openSpotApiPopup?: () => Promise<{ connected: boolean }>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
