export interface ElectronAPI {
  platform: string;
  auth: {
    login: () => Promise<{ success: boolean; started?: boolean; error?: string; deviceCode?: { userCode: string; verificationUrl: string } }>;
    cancelLogin: () => Promise<{ cancelled: boolean }>;
    getSession: () => Promise<{ isAuthenticated: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean }>;
    onLoginSuccess: (callback: (payload: { isAuthenticated: boolean }) => void) => () => void;
    onLoginError: (callback: (payload: { message: string }) => void) => () => void;
    onDeviceCode: (callback: (payload: { userCode: string; verificationUrl: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
