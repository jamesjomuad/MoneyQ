import { StyleSheet, View } from 'react-native';

import { useTheme } from './ThemeProvider';

export function Card({ children, style, padded = true, onLayout }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      onLayout={onLayout}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: padded ? spacing.lg : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}