import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { BarChart } from "../../components/reports/BarChart";
import { ExpenseTrendChart } from "../../components/reports/ExpenseTrendChart";
import { PieChart } from "../../components/reports/PieChart";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Stat } from "../../components/ui/Stat";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useReportsStore } from "../../stores/reportsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatCurrency } from "../../utils/currency";
import { REPORT_PERIODS, TREND_VIEWS } from "../../utils/reports";

const TREND_NOUN = { weekly: "week", monthly: "month", yearly: "year" };

/**
 * Reports tab: one filter (This Month / Last Month / This Year / All Time)
 * drives the summary, the income-vs-expenses bars and the expenses-by-tag
 * pie. The expenses-over-time chart adds its own Weekly/Monthly/Yearly
 * window with prev/next navigation that never enters future periods. All
 * figures come from the reports store, which reads transactions straight
 * from storage — the charts never hold their own numbers.
 */
export default function ReportsScreen() {
  const { colors, spacing } = useTheme();
  const filter = useReportsStore((state) => state.filter);
  const period = useReportsStore((state) => state.period);
  const summary = useReportsStore((state) => state.summary);
  const barGroups = useReportsStore((state) => state.barGroups);
  const tagSlices = useReportsStore((state) => state.tagSlices);
  const trend = useReportsStore((state) => state.trend);
  const trendView = useReportsStore((state) => state.trendView);
  const trendOffset = useReportsStore((state) => state.trendOffset);
  const isTrendLoading = useReportsStore((state) => state.isTrendLoading);
  const isLoading = useReportsStore((state) => state.isLoading);
  const error = useReportsStore((state) => state.error);
  const load = useReportsStore((state) => state.load);
  const loadTrend = useReportsStore((state) => state.loadTrend);
  const setFilter = useReportsStore((state) => state.setFilter);
  const setTrendView = useReportsStore((state) => state.setTrendView);
  const shiftTrend = useReportsStore((state) => state.shiftTrend);
  const currency = useSettingsStore((state) => state.currency);

  useFocusEffect(
    useCallback(() => {
      load();
      loadTrend();
    }, [load, loadTrend]),
  );

  return (
    <View style={styles.fill}>
      <Screen contentContainerStyle={{ paddingBottom: 32 }}>
        {/* <ScreenTitle
          title="Reports"
          subtitle={`Income, spending and tag mix · ${period.label}`}
        /> */}

        <SegmentedControl
          options={REPORT_PERIODS}
          value={filter}
          onChange={setFilter}
        />

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
              <SectionHeader title="Expenses Over Time" />
              <SegmentedControl
                options={TREND_VIEWS}
                value={trendView}
                onChange={setTrendView}
              />
              <Card style={{ marginTop: spacing.sm }}>
                <View style={styles.trendNav}>
                  <TrendArrow
                    icon="chevronLeft"
                    label={`Previous ${TREND_NOUN[trendView]}`}
                    onPress={() => shiftTrend(-1)}
                  />
                  <View style={styles.trendHead}>
                    <Text variant="label" tone="muted" numberOfLines={1}>
                      {trend.label}
                    </Text>
                    <Text variant="heading" tone="expense" numberOfLines={1}>
                      {formatCurrency(trend.total, { currency })}
                    </Text>
                  </View>
                  <TrendArrow
                    icon="chevronRight"
                    label={`Next ${TREND_NOUN[trendView]}`}
                    disabled={trendOffset >= 0}
                    onPress={() => shiftTrend(1)}
                  />
                </View>

                {isTrendLoading && trend.buckets.length === 0 ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={{ marginVertical: spacing.xl }}
                  />
                ) : trend.total === 0 ? (
                  <EmptyState
                    icon="wallet"
                    title={`No spending this ${TREND_NOUN[trendView]}`}
                    description={`Nothing was recorded as an expense in ${trend.label.toLowerCase()}. Use the arrows to browse earlier periods.`}
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
    </View>
  );
}

function TrendArrow({ icon, label, disabled = false, onPress }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrow,
        {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon name={icon} size={16} color={disabled ? colors.disabled : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: 48 },
  summaryRow: { flexDirection: "row" },
  arrow: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  trendHead: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  trendNav: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
});
