import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';

/**
 * The contextual bottom bar shown while a list is in selection mode: a
 * cancel control, the selected count, and whatever actions the owning
 * screen supplies (e.g. "Move"). Actions are disabled while
 * nothing is selected, so screens never wire their own count checks.
 *
 * The bar knows nothing about what the actions do — business logic and
 * confirmations stay in the screen.
 */
export function SelectionToolbar({ count, onCancel, actions = [], cancelLabel = 'Cancel' }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          gap: spacing.sm,
          // Sit above the system navigation bar, not under it.
          paddingBottom: Math.max(insets.bottom, spacing.md, 4),
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel selection"
        onPress={onCancel}
        hitSlop={8}
        style={({ pressed }) => [
          styles.cancel,
          {
            backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
          },
        ]}
      >
        <Text variant="label" tone="muted">
          {cancelLabel}
        </Text>
      </Pressable>
      <Text variant="body" tone="muted" style={styles.count}>
        {count} selected
      </Text>
      {actions.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          icon={action.icon}
          variant={action.variant}
          disabled={count === 0 || Boolean(action.disabled)}
          onPress={action.onPress}
          style={styles.action}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    // A screen may supply more than one action ("Move" + "Remove").
    // Wrapping keeps both reachable on narrow phones instead of overflowing
    // the row, without shrinking either label.
    flexWrap: 'wrap',
  },
  cancel: {
    borderWidth: 1,
  },
  count: {
    flex: 1,
    textAlign: 'right',
  },
  action: {
    marginLeft: 8,
  },
});
