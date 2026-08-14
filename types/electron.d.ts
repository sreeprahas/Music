export interface ElectronAPI {
  platform: string;
  auth: {
    login: () => Promise<{ success: boolean; started?: boolean; error?: string }>;
    cancelLogin: () => Promise<{ cancelled: boolean }>;
    getSession: () => Promise<{ isAuthenticated: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean }>;
    onLoginSuccess: (callback: (payload: { isAuthenticated: boolean }) => void) => () => void;
    onLoginError: (callback: (payload: { message: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
