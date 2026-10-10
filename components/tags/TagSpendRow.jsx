import { Pressable, StyleSheet, View } from 'react-native';

import { TagBadge } from '../ui/TagBadge';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';

/** A tag's signed share of a budget: + for income, − for expense, plain for 0. */
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
      <View style={styles.tag}>
        <TagBadge tag={tag} />
      </View>
      <Text numberOfLines={1} variant="heading" tone={active ? 'primary' : 'default'} style={styles.amount}>
        {formatCurrency(spent, { currency, showSign: true })}
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
    minWidth: 0,
    overflow: 'hidden',
  },
  tag: {
    flex: 1,
    minWidth: 0,
  },
  amount: {
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
});
