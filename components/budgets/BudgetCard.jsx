import { memo, useCallback } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { resolveFolderPalette } from '../../utils/colors';
import { computeBudgetBalance } from '../../utils/calculations';
import { formatDateRange } from '../../utils/dates';

/**
 * A Budget is rendered as a folder: a tab sitting on top of the card body with
 * the period and derived spend inside it. There is no progress bar or limit,
 * because a budget only holds transactions rather than capping them.
 *
 * Handlers receive the budget (or its id for the pin), so list screens pass
 * one stable callback instead of a fresh closure per card — the memo below
 * only pays off when props stay referentially equal between renders.
 */
export const BudgetCard = memo(function BudgetCard({ budget, onPress, onTogglePin, pinned = false, currency, onLongPress, selected = false }) {
  const { colors, radius, spacing } = useTheme();
  const balance = computeBudgetBalance(budget.income ?? 0, budget.spent ?? 0);
  // A user-selected folder color paints identically in every theme; budgets
  // without one fall back to the theme-driven folder colors.
  const folder = resolveFolderPalette(budget.color, colors);

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
      style={({ pressed }) => [{ marginBottom: spacing.lg }, pressed && { opacity: 0.82 }]}
    >
      <View style={[styles.tab, { backgroundColor: folder.folderBorder }]} />

      <View
        style={[
          styles.body,
          {
            backgroundColor: folder.folder,
            borderColor: selected ? folder.folderInk : folder.folderBorder,
            borderRadius: radius.md,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        {selected ? (
          <View style={[styles.checkmark, { backgroundColor: folder.folderInk, borderRadius: radius.pill }]}>
            <Icon name="check" size={14} color={folder.folder} />
          </View>
        ) : null}
        <View style={styles.headerRow}>
          <Icon name="wallet" size={20} color={folder.folderInk} />
          <Text variant="heading" numberOfLines={1} style={[styles.title, { color: folder.folderInk }]}>
            {budget.name}
          </Text>
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
              <Icon name={pinned ? 'pinFilled' : 'pin'} size={16} color={folder.folderInk} />
            </Pressable>
          ) : null}
          <Icon name="chevronRight" size={16} color={folder.folderInk} />
        </View>

        <Text variant="caption" style={{ color: folder.folderInk, marginTop: 2, opacity: 0.85 }}>
          {formatDateRange(budget.start_date, budget.end_date)}
          {' · '}
          {budget.transaction_count} {budget.transaction_count === 1 ? 'transaction' : 'transactions'}
        </Text>

        <View style={[styles.divider, { backgroundColor: folder.folderBorder }]} />

        <View style={styles.statsRow}>
          <Text
            variant="heading"
            numberOfLines={1}
            style={[styles.stat, { color: folder.folderInk }]}
          >
            {formatCurrency(budget.spent, { currency })} spent
          </Text>
          <Text
            variant="heading"
            numberOfLines={1}
            style={[styles.stat, { color: folder.folderInk, textAlign: 'right' }]}
          >
            {formatCurrency(balance, { currency })} balance
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tab: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    height: 7,
    marginLeft: 18,
    width: 92,
  },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    position: 'relative',
  },
  checkmark: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 22,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  pinDimmed: {
    opacity: 0.45,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    opacity: 0.9,
  },
  statsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
  },
});