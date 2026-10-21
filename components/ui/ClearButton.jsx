import { Pressable, StyleSheet } from 'react-native';

import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';

/**
 * The shared "clear this field" affordance. The visible mark is deliberately
 * small so it sits quietly inside a pill, so the 36px box is padded out to the
 * 44px touch target with hitSlop instead of growing the field.
 */
export function ClearButton({ label = 'Clear', onPress, color, size = 15, style }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.55 : 1 }, style]}
    >
      <Icon name="close" size={size} color={color ?? colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
