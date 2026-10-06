import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { TagBadge } from '../ui/TagBadge';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { dayLabel } from '../../utils/dates';

/**
 * One transaction in a budget. Transfers are shown without a tag and with a
 * neutral amount, because they move money between accounts rather than
 * counting as income or spending.
 */
export function TransactionRow({ transaction, tag, currency, onDelete, isLast }) {
  const { colors, spacing } = useTheme();

  const isExpense = transaction.type === 'expense';
  const isIncome = transaction.type === 'income';
  const sign = isIncome ? '+' : isExpense ? '-' : '';
  const tone = isIncome ? 'income' : isExpense ? 'expense' : 'muted';

  const title =
    transaction.description ||
    (transaction.type === 'transfer' ? 'Transfer' : tag?.name ?? 'Transaction');
  const subtitle = transaction.type === 'transfer'
    ? dayLabel(transaction.transaction_date)
    : [tag?.name, dayLabel(transaction.transaction_date)].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        },
      ]}
    >
      <View style={styles.left}>
        <TagBadge tag={transaction.type === 'transfer' ? null : tag} size="sm" />
        <View style={[styles.copy, { marginLeft: spacing.sm }]}>
          <Text variant="body" numberOfLines={1}>
            {title}
          </Text>
          {subtitle && subtitle !== title ? (
            <Text variant="caption" tone="faint" numberOfLines={1} style={{ marginTop: 1 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <Text variant="body" tone={tone} style={styles.amount}>
          {sign}
          {formatCurrency(transaction.amount, { currency })}
        </Text>

        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${title}`}
            onPress={onDelete}
            hitSlop={10}
            style={({ pressed }) => [{ marginTop: 4, opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name="trash" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
});