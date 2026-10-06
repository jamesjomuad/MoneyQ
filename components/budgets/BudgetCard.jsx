import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { formatDateRange } from '../../utils/dates';

/**
 * A Budget is rendered as a folder: a tab sitting on top of the card body with
 * the period and derived spend inside it. There is no progress bar or limit,
 * because a budget only holds transactions rather than capping them.
 */
export function BudgetCard({ budget, onPress, currency }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${budget.name}, ${formatCurrency(budget.spent, { currency })} spent`}
      onPress={onPress}
      style={({ pressed }) => [{ marginBottom: spacing.lg }, pressed && { opacity: 0.82 }]}
    >
      <View style={[styles.tab, { backgroundColor: colors.folderBorder }]} />

      <View
        style={[
          styles.body,
          {
            backgroundColor: colors.folder,
            borderColor: colors.folderBorder,
            borderRadius: radius.md,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Icon name="folder" size={20} color={colors.folderInk} />
          <Text variant="heading" numberOfLines={1} style={[styles.title, { color: colors.folderInk }]}>
            {budget.name}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.folderInk} />
        </View>

        <Text variant="caption" style={{ color: colors.folderInk, marginTop: 2, opacity: 0.85 }}>
          {formatDateRange(budget.start_date, budget.end_date)}
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.folderBorder }]} />

        <View style={styles.statsRow}>
          <Text variant="heading" style={{ color: colors.folderInk }}>
            {formatCurrency(budget.spent, { currency })} spent
          </Text>
          <Text variant="caption" style={{ color: colors.folderInk, opacity: 0.85 }}>
            {budget.transaction_count} {budget.transaction_count === 1 ? 'transaction' : 'transactions'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

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
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    opacity: 0.9,
  },
  statsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});