import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserSession } from '../types';

interface AuthContextType {
  user: UserSession | null;
  authorizedEmail: string;
  loading: boolean;
  error: string | null;
  quickLogin: (email?: string) => Promise<boolean>;
  googleLogin: (email: string, name?: string, image?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [authorizedEmail, setAuthorizedEmail] = useState<string>('minecraftprahas@gmail.com');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkSession = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/session');
      const data = await res.json();

      if (data.authorizedEmail) {
        setAuthorizedEmail(data.authorizedEmail);
      }

      if (data.user && data.user.isAuthorized) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Session check failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const quickLogin = async (emailInput?: string): Promise<boolean> => {
    try {
      setError(null);
      const res = await fetch('/api/auth/quick-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput || authorizedEmail }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'Authentication failed. Check your authorized email.');
        return false;
      }

      setUser(data.user);
      return true;
    } catch (err: any) {
      setError('Network error during authentication.');
      return false;
    }
  };

  const googleLogin = async (email: string, name?: string, image?: string): Promise<boolean> => {
    try {
      setError(null);
      const res = await fetch('/api/auth/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, image }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || `Access denied. Only ${authorizedEmail} is permitted.`);
        return false;
      }

      setUser(data.user);
      return true;
    } catch (err) {
      setError('Failed to authenticate with Google OAuth.');
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    } finally {
      setUser(null);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        authorizedEmail,
        loading,
        error,
        quickLogin,
        googleLogin,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
