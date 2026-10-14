import { memo, useCallback } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { resolveRowChip } from '../../utils/colors';
import { computeBudgetBalance } from '../../utils/calculations';
import { formatDateRange } from '../../utils/dates';

/**
 * A Budget on Home as a compact list row: a chip painted with the budget's
 * exact saved color, the name over a "Budget · period" detail line, the
 * remaining amount, and a muted chevron. Rows live inside a shared rounded
 * card and are separated by hairlines, matching the folder rows above them.
 * There is no progress bar or limit, because a budget only holds transactions
 * rather than capping them.
 *
 * Handlers receive the budget (or its id for the pin), so list screens pass
 * one stable callback instead of a fresh closure per card — the memo below
 * only pays off when props stay referentially equal between renders.
 */
export const BudgetCard = memo(function BudgetCard({ budget, onPress, onTogglePin, pinned = false, currency, onLongPress, selected = false, isLast = false }) {
  const { colors, radius, spacing } = useTheme();
  const balance = computeBudgetBalance(budget.income ?? 0, budget.spent ?? 0);
  // A user-selected color paints the chip exactly in every theme; budgets
  // without one fall back to the theme's primary tokens.
  const chip = resolveRowChip(budget.color, colors);
  const period = formatDateRange(budget.start_date, budget.end_date);

  const handlePress = useCallback(() => onPress?.(budget), [onPress, budget]);
  const handleLongPress = useCallback(() => onLongPress?.(budget), [onLongPress, budget]);
  const handleTogglePin = useCallback(() => onTogglePin?.(budget.id), [onTogglePin, budget.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${budget.name}, ${formatCurrency(budget.spent, { currency })} spent, ${formatCurrency(balance, { currency })} balance`}
      accessibilityState={{ selected }}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <View
        style={[
          styles.iconChip,
          { backgroundColor: chip.background, borderRadius: radius.md },
        ]}
      >
        <Icon name="wallet" size={20} color={chip.icon} />
      </View>

      <View style={styles.copy}>
        <Text variant="heading" numberOfLines={1}>
          {budget.name}
        </Text>
        {period ? (
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.detail}>
            Budget · {period}
          </Text>
        ) : null}
      </View>

      <View style={styles.amountBlock}>
        <Text
          variant="body"
          tone={balance < 0 ? 'expense' : 'default'}
          numberOfLines={1}
          style={styles.amount}
        >
          {formatCurrency(balance, { currency })}
        </Text>
        <Text variant="caption" tone="faint" style={styles.amountLabel}>
          remaining
        </Text>
      </View>

      {onTogglePin ? (
        <Pressable
          // react-native-web maps accessibilityRole="button" to a real
          // <button>, and a <button> cannot nest inside the card's own
          // <button>. The web build drops the role; native keeps it.
          accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
          accessibilityLabel={pinned ? `Unpin ${budget.name}` : `Pin ${budget.name}`}
          accessibilityState={{ selected: pinned }}
          onPress={handleTogglePin}
          hitSlop={8}
          style={pinned ? null : styles.pinDimmed}
        >
          <Icon name={pinned ? 'pinFilled' : 'pin'} size={16} color={chip.onSurface} />
        </Pressable>
      ) : null}

      {selected ? (
        <View
          style={[
            styles.checkmark,
            { backgroundColor: colors.primary, borderRadius: radius.pill },
          ]}
        >
          <Icon name="check" size={14} color={colors.onPrimary} />
        </View>
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  iconChip: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  detail: {
    marginTop: 2,
  },
  amountBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
  amountLabel: {
    marginTop: 1,
  },
  pinDimmed: {
    opacity: 0.45,
  },
  checkmark: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
});
