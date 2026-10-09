import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { MonthCalendar } from "../../components/calendar/MonthCalendar";
import { TransactionRow } from "../../components/transactions/TransactionRow";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useCalendarStore } from "../../stores/calendarStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagsStore } from "../../stores/tagsStore";
import { computeTotals } from "../../utils/calculations";
import { formatCurrency } from "../../utils/currency";
import { formatDate, formatTime } from "../../utils/dates";

export default function CalendarScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.load);

  const monthKey = useCalendarStore((state) => state.monthKey);
  const selectedDate = useCalendarStore((state) => state.selectedDate);
  const transactions = useCalendarStore((state) => state.transactions);
  const reminders = useCalendarStore((state) => state.reminders);
  const isLoading = useCalendarStore((state) => state.isLoading);
  const load = useCalendarStore((state) => state.load);
  const setMonth = useCalendarStore((state) => state.setMonth);
  const selectDate = useCalendarStore((state) => state.selectDate);

  // Reload the visible month on focus so edits made elsewhere show up; the
  // store keeps the selection when it still belongs to that month.
  useFocusEffect(
    useCallback(() => {
      load();
      loadTags();
    }, [load, loadTags]),
  );

  const activityDates = useMemo(
    () => new Set(transactions.map((entry) => entry.transaction_date)),
    [transactions],
  );
  const reminderDates = useMemo(
    () => new Set(reminders.map((reminder) => reminder.remind_date)),
    [reminders],
  );

  const dayTransactions = useMemo(
    () => transactions.filter((entry) => entry.transaction_date === selectedDate),
    [transactions, selectedDate],
  );
  const dayReminders = useMemo(
    () => reminders.filter((reminder) => reminder.remind_date === selectedDate),
    [reminders, selectedDate],
  );
  const totals = useMemo(() => computeTotals(dayTransactions), [dayTransactions]);
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  const hasActivity = dayTransactions.length > 0 || dayReminders.length > 0;

  return (
    <Screen topInset contentContainerStyle={{ paddingBottom: 48 }}>
      <Card>
        <MonthCalendar
          monthKey={monthKey}
          selectedDate={selectedDate}
          activityDates={activityDates}
          reminderDates={reminderDates}
          onChangeMonth={setMonth}
          onSelectDate={selectDate}
        />
      </Card>

      <SectionHeader
        title={formatDate(selectedDate)}
        action={
          isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null
        }
      />

      {hasActivity ? (
        <>
          {dayTransactions.length > 0 ? (
            <>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.summaryRow}>
                  <Text variant="body" tone="muted">
                    Income
                  </Text>
                  <Text variant="body" tone="income" style={styles.summaryAmount}>
                    +{formatCurrency(totals.income, { currency })}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="body" tone="muted">
                    Expenses
                  </Text>
                  <Text variant="body" tone="expense" style={styles.summaryAmount}>
                    -{formatCurrency(totals.expense, { currency })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.summaryRow,
                    styles.summaryTotal,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Text variant="heading">Total spent</Text>
                  <Text variant="heading" style={styles.summaryAmount}>
                    {formatCurrency(totals.expense, { currency })}
                  </Text>
                </View>
              </Card>

              <Card padded={false} style={{ marginBottom: spacing.md }}>
                {dayTransactions.map((transaction, index) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    tag={tagById.get(transaction.tag_id) ?? null}
                    currency={currency}
                    isLast={index === dayTransactions.length - 1}
                    onEdit={(entry) =>
                      router.push({
                        pathname: "/transaction/form",
                        params: {
                          budgetId: entry.budget_id,
                          transactionId: entry.id,
                        },
                      })
                    }
                  />
                ))}
              </Card>
            </>
          ) : null}

          {dayReminders.length > 0 ? (
            <>
              <SectionHeader title="Reminders" />
              <Card
                style={{ backgroundColor: colors.warningSoft, marginBottom: spacing.md }}
              >
                {dayReminders.map((reminder, index) => (
                  <View
                    key={reminder.id}
                    style={[
                      styles.reminderRow,
                      index > 0 && { marginTop: spacing.sm },
                    ]}
                  >
                    <Icon name="clock" size={18} color={colors.warning} />
                    <View style={styles.reminderCopy}>
                      <Text variant="body" numberOfLines={1}>
                        {reminder.description || "Reminder"}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {formatTime(reminder.remind_time)} ·{" "}
                        {formatCurrency(reminder.amount, { currency })}
                      </Text>
                      {reminder.notes ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {reminder.notes}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="caption" tone="muted">
                      🔔
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <Card>
          <EmptyState
            icon="calendar"
            title="No activity"
            description="Nothing recorded for this date."
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  summaryTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    paddingTop: 10,
  },
  summaryAmount: {
    fontVariant: ["tabular-nums"],
  },
  reminderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  reminderCopy: {
    flex: 1,
    minWidth: 0,
  },
});
