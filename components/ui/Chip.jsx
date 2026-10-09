import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/** Small selectable pill used for date shortcuts and tag pickers. */
export function Chip({ label, emoji, active = false, onPress, style }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primarySoft : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {emoji ? <Text variant="caption">{emoji}</Text> : null}
        <Text variant="label" tone={active ? 'primary' : 'muted'}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 6,
    marginBottom: 6,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
});