import { Pressable, StyleSheet, View } from 'react-native';

import { TagBadge } from '../ui/TagBadge';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';
import { formatPercent } from '../../utils/reports';

/** A tag's signed amount and share of its budget's total expenses. */
export function TagSpendRow({ tag, spent, expensePercent = 0, currency, active = false, onPress }) {
  const { colors, radius, spacing } = useTheme();
  const safePercent = Number.isFinite(expensePercent) ? expensePercent : 0;
  const fillPercent = Math.min(100, Math.max(0, safePercent));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter by ${tag.name}. ${formatPercent(safePercent)} of budget expenses`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: active ? colors.primarySoft : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.header, { gap: spacing.sm }]}>
        <View style={styles.tag}>
          <TagBadge tag={tag} background={false} />
        </View>
        <Text
          numberOfLines={1}
          variant="heading"
          tone={active ? 'primary' : 'default'}
          style={styles.amount}
        >
          {formatCurrency(spent, { currency, showSign: true })}
        </Text>
      </View>

      <View style={[styles.progress, { gap: spacing.xs, marginTop: spacing.sm }]}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${tag.name} expense share`}
          accessibilityValue={{ min: 0, max: 100, now: fillPercent }}
          style={[
            styles.progressTrack,
            {
              backgroundColor: active ? colors.surface : colors.surfaceMuted,
              borderRadius: radius.pill,
              height: spacing.xs,
            },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.expense,
                borderRadius: radius.pill,
                height: spacing.xs,
                width: `${fillPercent}%`,
              },
            ]}
          />
        </View>
        <Text variant="caption" tone={active ? 'primary' : 'faint'} style={styles.progressValue}>
          {formatPercent(safePercent)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 0,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  tag: {
    flex: 1,
    minWidth: 0,
  },
  amount: {
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  progressTrack: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  progressFill: {},
  progressValue: {
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
});
