import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/** options: [{ value, label }] */
export function SegmentedControl({ options, value, onChange, style }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xs },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: active ? colors.surface : 'transparent',
                borderColor: active ? colors.border : 'transparent',
                borderRadius: radius.sm,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text variant="label" tone={active ? 'primary' : 'muted'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
  },
  option: {
    alignItems: 'center',
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
});