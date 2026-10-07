import { StyleSheet, TextInput, View } from 'react-native';

import { sanitizeAmount } from '../../utils/currency';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * Large right-aligned amount entry. Only digits and one decimal separator get
 * through (`sanitizeAmount`), and toMinor() converts what is left before it
 * touches a repository, so the storage layer only ever sees integer minor
 * units.
 */
export function AmountInput({
  symbol = '₱',
  value,
  onChangeText,
  autoFocus,
  editable = true,
  inputRef,
  decimalPlaces = 2,
  style,
}) {
  const { colors, radius, spacing } = useTheme();

  function handleChange(text) {
    if (!onChangeText) return;
    onChangeText(sanitizeAmount(text, decimalPlaces));
  }

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        },
        style,
      ]}
    >
      <Text variant="title" tone="muted" style={{ marginRight: spacing.sm }}>
        {symbol}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        editable={editable}
        autoFocus={autoFocus}
        placeholder="0.00"
        placeholderTextColor={colors.textFaint}
        keyboardType="decimal-pad"
        returnKeyType="done"
        selectionColor={colors.primary}
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 64,
  },
  input: {
    flex: 1,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    padding: 0,
    textAlign: 'right',
  },
});