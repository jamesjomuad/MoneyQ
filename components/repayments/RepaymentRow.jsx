import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { computeRepaymentState } from '../../utils/calculations';
import { formatCurrency } from '../../utils/currency';
import { formatShortDate } from '../../utils/dates';

/**
 * One pending repayment on Home: who owes what, when it is due, whether a
 * reminder is armed, and a one-tap way to settle it. Tapping the row opens
 * the transaction, so the list never grows its own editing path.
 *
 * The mark-paid control is a sibling of the row pressable rather than nested
 * inside it — nested pressables render as buttons inside buttons on web.
 */
export function RepaymentRow({ transaction, budgetName, currency, onOpen, onMarkPaid, isLast, busy = false }) {
  const { colors, spacing } = useTheme();

  const state = computeRepaymentState(transaction);
  const name = String(transaction.description ?? '').trim() || 'Repayment';
  const hasReminder = transaction.reminder_enabled === 1;

  const parts = [];
  if (budgetName) parts.push(budgetName);
  parts.push(
    state === 'overdue'
      ? `🔴 Overdue · Due ${formatShortDate(transaction.due_date)}`
      : `🔵 Due ${formatShortDate(transaction.due_date)}`,
  );
  if (hasReminder) parts.push('🔔 Reminder set');

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}, ${formatCurrency(transaction.amount, { currency })}`}
        onPress={() => onOpen(transaction)}
        style={({ pressed }) => [styles.pressable, { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}
      >
        <View style={styles.copy}>
          <Text variant="body" numberOfLines={1}>
            {name}
          </Text>
          <Text
            variant="caption"
            tone={state === 'overdue' ? 'expense' : 'faint'}
            numberOfLines={1}
            style={{ marginTop: 1 }}
          >
            {parts.join(' · ')}
          </Text>
        </View>

        <Text variant="heading" style={styles.amount}>
          {formatCurrency(transaction.amount, { currency })}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mark ${name} as paid`}
        onPress={() => onMarkPaid(transaction)}
        hitSlop={8}
        disabled={busy}
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [styles.mark, { opacity: busy ? 0.5 : pressed ? 0.6 : 1 }]}
      >
        <Icon name="check" size={14} color={colors.primary} />
        <Text variant="label" tone="primary">
          {busy ? 'Saving…' : 'Mark as Paid'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'space-between',
  },
  pressable: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    minWidth: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
  mark: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    minHeight: 32,
  },
});
