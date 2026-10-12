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
  bare = false,
  ink,
  centered = false,
  large = false,
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
        centered && { justifyContent: 'center' },
        bare
          ? { backgroundColor: 'transparent', borderWidth: 0 }
          : {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.lg,
              borderWidth: StyleSheet.hairlineWidth,
            },
        { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
        large && { minHeight: 72, paddingVertical: spacing.sm },
        style,
      ]}
    >
      <Text
        variant="title"
        tone={ink ? 'default' : 'muted'}
        style={{ marginRight: spacing.sm, fontSize: large ? 24 : 20, ...(ink ? { color: ink } : null) }}
      >
        {symbol}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        editable={editable}
        autoFocus={autoFocus}
        placeholder="0.00"
        placeholderTextColor={ink ?? colors.textFaint}
        keyboardType="decimal-pad"
        returnKeyType="done"
        selectionColor={ink ?? colors.primary}
        style={[
          styles.input,
          { color: ink ?? colors.text },
          large && { fontSize: 40, letterSpacing: -0.8 },
          centered && { flex: 0, minWidth: 44, textAlign: 'center' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
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