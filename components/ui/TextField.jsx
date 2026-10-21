import { StyleSheet, TextInput, View } from 'react-native';

import { ClearButton } from './ClearButton';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function TextField({ label, hint, error, style, inputStyle, clearable = true, ...rest }) {
  const { colors, spacing } = useTheme();
  const { value, onChangeText, editable, multiline } = rest;
  // Only a controlled, editable field with something in it gets the button;
  // read-only and empty fields stay as they were.
  const canClear =
    clearable &&
    editable !== false &&
    typeof onChangeText === 'function' &&
    value !== undefined &&
    value !== null &&
    String(value).length > 0;

  return (
    <View style={[{ marginBottom: spacing.lg }, style]}>
      {label ? (
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
          {label}
        </Text>
      ) : null}

      <View style={styles.control}>
        <TextInput
          // RN never links the visible Text above to the input, so carry the
          // label into the a11y tree explicitly; an explicit prop still wins.
          accessibilityLabel={label ?? undefined}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          style={[
            styles.input,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: error ? colors.expense : colors.border,
              borderRadius: 50,
              color: colors.text,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              // Reserve the trailing edge so the value never runs under the
              // clear button.
              paddingRight: canClear ? spacing.xxl + spacing.md : spacing.md,
            },
            inputStyle,
          ]}
          {...rest}
        />

        {canClear ? (
          <View
            style={[
              styles.clearSlot,
              { right: spacing.xs },
              // Multi-line fields grow downwards, so the mark stays at the top
              // of the first line instead of floating in the middle of the box.
              multiline ? { justifyContent: 'flex-start', paddingTop: spacing.xs } : null,
            ]}
          >
            <ClearButton
              label={label ? `Clear ${label}` : 'Clear field'}
              onPress={() => onChangeText('')}
              color={colors.textMuted}
            />
          </View>
        ) : null}
      </View>

      {error ? (
        <Text
          variant="caption"
          tone="expense"
          // Announce validation failures to TalkBack/VoiceOver; a visible-only
          // error leaves screen-reader users stuck on an unexplained Save.
          accessibilityLiveRegion="polite"
          style={{ marginTop: spacing.xs }}
        >
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
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    width: '100%',
  },
  control: {
    position: 'relative',
  },
  clearSlot: {
    position: 'absolute',
    bottom: 0,
    justifyContent: 'center',
    top: 0,
  },
});
