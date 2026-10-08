import { StyleSheet, View } from 'react-native';

import { Text } from '../ui/Text';
import { useTheme } from '../ui/ThemeProvider';
import { formatCurrency } from '../../utils/currency';

/**
 * Income vs. expenses bars drawn with plain Views (no chart library).
 * One group = the selected period; twelve groups = the months of 'This Year',
 * each a paired Income/Expense column. Heights are pixels scaled to the
 * largest value so proportions stay exact on any screen width.
 */
const CHART_HEIGHT = 150;
const MAX_BAR = 132;
const ZERO_STUB = 2;

export function BarChart({ groups = [], currency }) {
  const { colors, spacing } = useTheme();

  const max = Math.max(
    0,
    ...groups.flatMap((group) => [group.income, group.expense]),
  );

  if (groups.length === 0 || max === 0) {
    return (
      <View style={[styles.empty, { paddingVertical: spacing.xl }]}>
        <Text variant="body" tone="faint">
          No income or expenses in this period.
        </Text>
      </View>
    );
  }

  const single = groups.length === 1;

  return (
    <View>
      <View style={[styles.row, { height: CHART_HEIGHT + 28, gap: single ? spacing.xl : 4 }]}>
        {single
          ? groups[0] &&
            ['income', 'expense'].map((key) => {
              const value = groups[0][key];
              return (
                <View key={key} style={styles.singleColumn}>
                  <Text variant="caption" tone={key === 'income' ? 'income' : 'expense'} numberOfLines={1}>
                    {formatCurrency(value, { currency, hideDecimals: true })}
                  </Text>
                  <Bar
                    series={key}
                    value={value}
                    max={max}
                    colors={colors}
                    width="100%"
                    style={styles.wideBar}
                  />
                  <Text variant="caption" tone="muted">
                    {key === 'income' ? 'Income' : 'Expenses'}
                  </Text>
                </View>
              );
            })
          : groups.map((group, index) => (
              <View key={`${group.label}-${index}`} style={styles.groupColumn}>
                <View style={styles.barRow}>
                  <Bar series="income" value={group.income} max={max} colors={colors} thin />
                  <Bar series="expense" value={group.expense} max={max} colors={colors} thin />
                </View>
                <Text variant="caption" tone="faint" style={styles.groupLabel}>
                  {group.label}
                </Text>
              </View>
            ))}
      </View>

      <View style={[styles.baseline, { backgroundColor: colors.border }]} />

      <View style={[styles.legend, { marginTop: spacing.sm }]}>
        <LegendDot color={colors.income} label="Income" />
        <LegendDot color={colors.expense} label="Expenses" />
      </View>
    </View>
  );
}

function Bar({ series, value, max, colors, thin = false, width, style }) {
  const height = value > 0 ? Math.max((value / max) * MAX_BAR, 4) : ZERO_STUB;
  return (
    <View
      accessibilityLabel={`${series === 'income' ? 'Income' : 'Expenses'}: ${Math.round((value / max) * 100)} percent of the tallest bar`}
      style={[
        styles.bar,
        {
          backgroundColor: series === 'income' ? colors.income : colors.expense,
          height,
          opacity: value > 0 ? 1 : 0.3,
          width: width ?? (thin ? 8 : 44),
        },
        style,
      ]}
    />
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 4,
  },
  barRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
  },
  baseline: {
    height: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
  },
  groupColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  groupLabel: {
    fontSize: 10,
  },
  singleColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  wideBar: {
    maxWidth: 72,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  row: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
});
