import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BarChart } from "../../components/reports/BarChart";
import { DateRangeSheet } from "../../components/reports/DateRangeSheet";
import { ExpenseTrendChart } from "../../components/reports/ExpenseTrendChart";
import { PieChart } from "../../components/reports/PieChart";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Stat } from "../../components/ui/Stat";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useReportsStore } from "../../stores/reportsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatCurrency } from "../../utils/currency";
import { REPORT_PERIODS } from "../../utils/reports";

const TREND_GRANULARITY = {
  monthly: "Daily",
  months: "Monthly",
  yearly: "Monthly",
  allTime: "By Year",
};

/**
 * Reports tab: one filter (This Month / Last Month / This Year / Custom
 * range) drives the summary, the income-vs-expenses bars, the
 * expenses-by-tag pie and the expenses-over-time chart, whose granularity
 * follows the filter. Custom opens the DateRangeSheet and applies only on
 * Apply. All figures come from the reports store, which reads transactions
 * straight from storage — the charts never hold their own numbers.
 */
export default function ReportsScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [rangeOpen, setRangeOpen] = useState(false);
  const filter = useReportsStore((state) => state.filter);
  const custom = useReportsStore((state) => state.custom);
  const setCustomRange = useReportsStore((state) => state.setCustomRange);
  const period = useReportsStore((state) => state.period);
  const summary = useReportsStore((state) => state.summary);
  const barGroups = useReportsStore((state) => state.barGroups);
  const tagSlices = useReportsStore((state) => state.tagSlices);
  const trend = useReportsStore((state) => state.trend);
  const trendView = useReportsStore((state) => state.trendView);
  const isLoading = useReportsStore((state) => state.isLoading);
  const error = useReportsStore((state) => state.error);
  const load = useReportsStore((state) => state.load);
  const setFilter = useReportsStore((state) => state.setFilter);
  const currency = useSettingsStore((state) => state.currency);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.fill}>
      <Screen contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {error ? (
          <Text variant="body" tone="expense" style={{ marginTop: spacing.md }}>
            {error.message ?? String(error)}
          </Text>
        ) : null}

        {isLoading && summary.transactionCount === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
              Loading reports…
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
            <Card>
              <View style={styles.summaryRow}>
                <Stat
                  label="Income"
                  value={formatCurrency(summary.income, { currency })}
                  tone="income"
                />
                <Stat
                  label="Expenses"
                  value={formatCurrency(summary.expense, { currency })}
                  tone="expense"
                />
                <Stat
                  label="Net"
                  value={formatCurrency(summary.remaining, { currency })}
                  tone={summary.remaining >= 0 ? "income" : "expense"}
                />
              </View>
            </Card>

            <View>
              <SectionHeader
                title={`Expenses Over Time · ${TREND_GRANULARITY[trendView] ?? "Daily"}`}
              />
              <Card>
                <View style={styles.trendHead}>
                  <Text variant="label" tone="muted" numberOfLines={1}>
                    {trend.label}
                  </Text>
                  <Text variant="heading" tone="expense" numberOfLines={1}>
                    {formatCurrency(trend.total, { currency })}
                  </Text>
                </View>

                {trend.total === 0 ? (
                  <EmptyState
                    icon="wallet"
                    title="No spending in this period"
                    description={
                      filter === "custom"
                        ? `Nothing was recorded as an expense in ${trend.label}. Widen the date range in the filter below.`
                        : `Nothing was recorded as an expense in ${trend.label.toLowerCase()}. Switch the period filter below or record an expense to see bars.`
                    }
                  />
                ) : (
                  <ExpenseTrendChart
                    key={`${trendView}-${trend.start}`}
                    view={trendView}
                    buckets={trend.buckets}
                    currency={currency}
                  />
                )}
              </Card>
            </View>

            <View>
              <SectionHeader
                title={
                  filter === "thisYear"
                    ? "Income vs Expenses · Monthly"
                    : "Income vs Expenses"
                }
              />
              <Card>
                <BarChart groups={barGroups} currency={currency} />
              </Card>
            </View>

            <View>
              <SectionHeader title="Expenses by Tag" />
              <Card>
                {tagSlices.length === 0 ? (
                  <EmptyState
                    icon="pie"
                    title="No expenses yet"
                    description={`Nothing was tagged as spending in ${period.label.toLowerCase()}. Recorded expenses show up here as slices of the pie.`}
                  />
                ) : (
                  <PieChart slices={tagSlices} currency={currency} />
                )}
              </Card>
            </View>
          </View>
        )}
      </Screen>

      {/* Sticky bottom filter bar: pinned outside the ScrollView, so the
          period selector stays reachable while the charts scroll. */}
      <View
        style={[
          styles.filterBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        {filter === "custom" ? (
          <View style={[styles.rangeRow, { marginBottom: spacing.sm }]}>
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {period.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit date range"
              onPress={() => setRangeOpen(true)}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text variant="label" tone="primary">
                EDIT RANGE
              </Text>
            </Pressable>
          </View>
        ) : null}

        <SegmentedControl
          options={REPORT_PERIODS}
          value={filter}
          onChange={(value) => {
            if (value === "custom") setRangeOpen(true);
            else setFilter(value);
          }}
        />
      </View>

      {rangeOpen ? (
        <DateRangeSheet
          initial={custom}
          onClose={() => setRangeOpen(false)}
          onApply={(range) => {
            setRangeOpen(false);
            setCustomRange(range);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filterBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  loading: { alignItems: "center", paddingVertical: 48 },
  summaryRow: { flexDirection: "row" },
  rangeRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  trendHead: {
    alignItems: "center",
    gap: 2,
    marginBottom: 12,
  },
});
