import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { radius, spacing, themes, typography } from '../../constants/colors';
import { useSettingsStore } from '../../stores/settingsStore';

const ThemeContext = createContext(null);

/**
 * Resolves the persisted appearance preference ('system' | 'light' | 'dark' |
 * 'moneyq') into a concrete palette. 'system' follows the device scheme; every
 * other preference is pinned. The optional colorScheme prop still overrides
 * everything, for previews and tests.
 */
export function ThemeProvider({ children, colorScheme }) {
  const systemScheme = useColorScheme() ?? 'light';
  const preference = useSettingsStore((state) => state.theme);

  const requested = colorScheme ?? preference ?? 'system';
  const themeKey =
    requested === 'system' || !themes[requested]
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : requested;

  const value = useMemo(
    () => ({
      // moneyq is a dark-family palette; navigation and status bar follow it.
      scheme: themeKey === 'light' ? 'light' : 'dark',
      themeKey,
      preference: requested,
      colors: themes[themeKey],
      spacing,
      radius,
      typography,
    }),
    [themeKey, requested],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within a <ThemeProvider>');
  return theme;
}
