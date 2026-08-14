import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors, type ThemeMode } from './colors';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  colors: lightColors,
  isDark: false,
  setMode: () => {},
  cycleMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  useEffect(() => {
    if (mode === 'light') Appearance.setColorScheme('light');
    else if (mode === 'dark') Appearance.setColorScheme('dark');
    else Appearance.setColorScheme('unspecified');
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      colors: isDark ? darkColors : lightColors,
      isDark,
      setMode: setModeState,
      cycleMode: () => {
        setModeState((m) => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'));
      },
    }),
    [mode, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
