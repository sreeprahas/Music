'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeName = 'cyan' | 'purple' | 'green' | 'amber' | 'rose' | 'blue' | 'indigo' | 'orange' | 'mint' | 'magenta';
export const THEME_PRESETS: Array<{ id: ThemeName; name: string; description: string }> = [
  { id: 'cyan', name: 'Neon cyan', description: 'The original electric accent' },
  { id: 'purple', name: 'Velvet purple', description: 'A calmer creative tone' },
  { id: 'green', name: 'Signal green', description: 'Bright and energetic' },
  { id: 'amber', name: 'Warm amber', description: 'Soft gold against charcoal' },
  { id: 'rose', name: 'Rose pulse', description: 'A vivid pink highlight' },
  { id: 'blue', name: 'Ocean blue', description: 'Calm and focused' },
  { id: 'indigo', name: 'Deep indigo', description: 'Rich night color' },
  { id: 'orange', name: 'Sunset orange', description: 'Warm and expressive' },
  { id: 'mint', name: 'Soft mint', description: 'Fresh and understated' },
  { id: 'magenta', name: 'Electric magenta', description: 'Bold creative energy' },
];
interface ThemeContextValue { theme: ThemeName; setTheme: (theme: ThemeName) => void; }
const ThemeContext = createContext<ThemeContextValue | null>(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('cyan');
  useEffect(() => { const stored = window.localStorage.getItem('music_theme') as ThemeName | null; if (stored && THEME_PRESETS.some((preset) => preset.id === stored)) setThemeState(stored); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('music_theme', theme);
    window.electron?.setTheme?.(theme);
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme: (next: ThemeName) => setThemeState(next) }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme(): ThemeContextValue { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider'); return value; }
