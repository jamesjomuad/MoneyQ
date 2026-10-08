import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BarChart } from "../../components/reports/BarChart";
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

/**
 * Reports tab: one filter (This Month / Last Month / This Year / All Time)
 * drives the summary, the income-vs-expenses bars and the expenses-by-tag
 * pie. All figures come from the reports store, which reads transactions
 * straight from storage — the charts never hold their own numbers.
 */
export default function ReportsScreen() {
  const { colors, spacing } = useTheme();
  const filter = useReportsStore((state) => state.filter);
  const period = useReportsStore((state) => state.period);
  const summary = useReportsStore((state) => state.summary);
  const barGroups = useReportsStore((state) => state.barGroups);
  const tagSlices = useReportsStore((state) => state.tagSlices);
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: 48 },
  summaryRow: { flexDirection: "row" },
});
