import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { readJSON, writeJSON } from '@/lib/storage';

// Same tokens as the website (src/app/globals.css).
const light = {
  background: '#fafaf8', foreground: '#121212', surface: '#ffffff', surface2: '#f2f1ed', surface3: '#e9e7e1',
  muted: '#6b6a66', subtle: '#9a9893', border: '#e5e3de', borderStrong: '#d3d0c9',
  primary: '#121212', primaryForeground: '#fafaf8', accent: '#2f5d46', accentSoft: '#e4ece6',
  sale: '#b42318', saleSoft: '#fdecea', success: '#2f7a4b', successSoft: '#e3f1e8', warning: '#a15c07', star: '#1a1a1a',
  overlay: 'rgba(10,10,10,0.45)',
};
const dark: typeof light = {
  background: '#0e0e0d', foreground: '#f2f1ed', surface: '#161615', surface2: '#1d1d1b', surface3: '#272725',
  muted: '#a3a19b', subtle: '#75736e', border: '#2a2a28', borderStrong: '#3a3a37',
  primary: '#f2f1ed', primaryForeground: '#121212', accent: '#8fc2a4', accentSoft: '#1d2b23',
  sale: '#ff8a7a', saleSoft: '#3a1714', success: '#6fcf97', successSoft: '#17301f', warning: '#f2b45a', star: '#f2f1ed',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof light;
export type ThemeMode = 'system' | 'light' | 'dark';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999 };
export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }),
};

type Value = { colors: Colors; dark: boolean; mode: ThemeMode; setMode: (m: ThemeMode) => void };
const ThemeContext = createContext<Value | null>(null);
const KEY = 'herufi-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => readJSON<ThemeMode>(KEY, 'system'));
  const setMode = useCallback((m: ThemeMode) => { writeJSON(KEY, m); setModeState(m); }, []);
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const value = useMemo(() => ({ colors: isDark ? dark : light, dark: isDark, mode, setMode }), [isDark, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
