import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';

/** Floating action button, rendered as a sibling of <Screen/> inside a flex:1 View. */
export function Fab({ onPress, icon = 'add', accessibilityLabel = 'Add', bottomOffset = 0 }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

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
          // Clear Android's system navigation bar: content extends behind it
          // edge-to-edge, so a fixed offset leaves the button under the toolbar.
          bottom: spacing.xl + insets.bottom + bottomOffset,
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