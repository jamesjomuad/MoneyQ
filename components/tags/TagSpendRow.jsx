import { Pressable, StyleSheet, View } from 'react-native';

import { TagBadge } from '../ui/TagBadge';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { resolveTagBorder } from '../../utils/colors';
import { formatCurrency } from '../../utils/currency';
import { formatPercent } from '../../utils/reports';

/** A tag's signed amount and share of its budget's total expenses. */
export function TagSpendRow({ tag, spent, expensePercent = 0, currency, active = false, onPress }) {
  const { colors, radius, spacing } = useTheme();
  const safePercent = Number.isFinite(expensePercent) ? expensePercent : 0;
  const fillPercent = Math.min(100, Math.max(0, safePercent));
  // Each chip is edged with its own tag colour (null when the tag has none).
  const tagBorder = resolveTagBorder(tag.color, colors);

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
          // The tag's own colour edges the chip, stepped only when the theme
          // would hide it; a tag with no saved colour keeps today's border.
          borderColor: tagBorder ?? (active ? colors.primary : colors.border),
          borderRadius: radius.md,
          padding: spacing.md,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {/* Label above amount, never beside it: on one row a wide amount takes
          the whole line (it is the one part that must not shrink) and leaves
          the tag's name and emoji a clipped sliver of a card. Stacked, the
          amount is its own line and can only ellipsize at the card's edge, so
          the label stays readable whatever the amount's length. */}
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
        <Text
          variant="caption"
          tone={active ? 'primary' : 'muted'}
          style={styles.progressValue}
        >
          {formatPercent(safePercent)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    minWidth: 0,
    overflow: 'hidden',
  },
  // A column (the React Native default), not a row: the label owns its line
  // across the full card width, and the amount gets the line below it.
  header: {
    minWidth: 0,
  },
  tag: {
    minWidth: 0,
  },
  amount: {
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
