import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';

/** Floating action button, rendered as a sibling of <Screen/> inside a flex:1 View. */
export function Fab({ onPress, icon = 'add', accessibilityLabel = 'Add' }) {
  const { colors, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: colors.primary,
          right: spacing.lg,
          bottom: spacing.xl,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <View>
        <Icon name={icon} size={26} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    borderRadius: 28,
    elevation: 6,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    width: 56,
  },
});