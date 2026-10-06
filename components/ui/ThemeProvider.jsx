import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, radius, spacing, typography } from '../../constants/colors';

const ThemeContext = createContext(null);

export function ThemeProvider({ children, colorScheme }) {
  const systemScheme = useColorScheme();
  const scheme = colorScheme ?? systemScheme ?? 'light';

  const value = useMemo(
    () => ({
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      typography,
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within a <ThemeProvider>');
  return theme;
}