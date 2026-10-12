import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/** options: [{ value, label, icon? }] — `icon` is an Icon name shown before the label. */
export function SegmentedControl({ options, value, onChange, style, dense = false }) {
  const { colors, spacing } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        {
          backgroundColor: colors.surfaceMuted,
          // The segments are capsules; the track is the capsule radius plus
          // the padding so the outline wraps the segments concentrically.
          borderRadius: 54,
          padding: spacing.xs,
        },
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
              dense && styles.optionDense,
              {
                backgroundColor: active ? colors.surface : 'transparent',
                borderColor: active ? colors.border : 'transparent',
                borderRadius: 50,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={dense ? 14 : 16}
                color={active ? colors.primary : colors.textMuted}
              />
            ) : null}
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
    flexDirection: 'row',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
  optionDense: {
    minHeight: 36,
    paddingVertical: 4,
  },
});