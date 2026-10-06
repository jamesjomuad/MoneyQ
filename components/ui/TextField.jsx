import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function TextField({ label, hint, error, style, inputStyle, ...rest }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={[{ marginBottom: spacing.lg }, style]}>
      {label ? (
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
          {label}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: error ? colors.expense : colors.border,
            borderRadius: radius.md,
            color: colors.text,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
          },
          inputStyle,
        ]}
        {...rest}
      />

      {error ? (
        <Text variant="caption" tone="expense" style={{ marginTop: spacing.xs }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    fontWeight: '400',
    width: '100%',
  },
});