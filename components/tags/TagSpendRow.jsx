import { Pressable, StyleSheet } from 'react-native';

import { TagBadge } from '../ui/TagBadge';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';

/** A tag's share of a budget's spending. Tapping filters the transaction list. */
export function TagSpendRow({ tag, spent, currency, active = false, onPress }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter by ${tag.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: active ? colors.primarySoft : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <TagBadge tag={tag} />
      <Text variant="heading" tone={active ? 'primary' : 'default'} style={styles.amount}>
        {formatCurrency(spent, { currency })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: 8,
  },
  amount: {
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
});