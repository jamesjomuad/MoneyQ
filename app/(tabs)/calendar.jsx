import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { MonthCalendar } from "../../components/calendar/MonthCalendar";
import { TransactionRow } from "../../components/transactions/TransactionRow";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Screen, SectionHeader } from "../../components/ui/Screen";
import { Text } from "../../components/ui/Text";
import { useTheme } from "../../components/ui/ThemeProvider";
import { useCalendarStore } from "../../stores/calendarStore";
import { useRemindersStore } from "../../stores/remindersStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagsStore } from "../../stores/tagsStore";
import { computeTotals } from "../../utils/calculations";
import { formatCurrency } from "../../utils/currency";
import { formatDate, formatTime } from "../../utils/dates";
import { REMINDER_STATUS_LABELS, deriveReminderStatus } from "../../utils/reminders";

export default function CalendarScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.load);

  const monthKey = useCalendarStore((state) => state.monthKey);
  const selectedDate = useCalendarStore((state) => state.selectedDate);
  const transactions = useCalendarStore((state) => state.transactions);
  const monthReminders = useCalendarStore((state) => state.reminders);
  const isLoading = useCalendarStore((state) => state.isLoading);
  const load = useCalendarStore((state) => state.load);
  const setMonth = useCalendarStore((state) => state.setMonth);
  const selectDate = useCalendarStore((state) => state.selectDate);

  const dayReminders = useRemindersStore((state) => state.dayReminders);
  const reminderDate = useRemindersStore((state) => state.dayDate);
  const remindersLoading = useRemindersStore((state) => state.dayIsLoading);
  const loadDay = useRemindersStore((state) => state.loadDay);

  // Reload the visible month on focus so edits made elsewhere show up; the
  // store keeps the selection when it still belongs to that month.
  useFocusEffect(
    useCallback(() => {
      load();
      loadTags();
    }, [load, loadTags]),
  );

  // The interactive reminder list is scoped to one date at a time: changing
  // the selection claims the scope and re-reads, so a stale day can never
  // show under another day's header.
  useEffect(() => {
    loadDay(selectedDate);
  }, [loadDay, selectedDate]);

  const activityDates = useMemo(
    () => new Set(transactions.map((entry) => entry.transaction_date)),
    [transactions],
  );
  const reminderDates = useMemo(
    () => new Set(monthReminders.map((reminder) => reminder.remind_date)),
    [monthReminders],
  );

  const dayTransactions = useMemo(
    () => transactions.filter((entry) => entry.transaction_date === selectedDate),
    [transactions, selectedDate],
  );
  // Trust the store's list only once it has caught up with the selection.
  const remindersForDay = reminderDate === selectedDate ? dayReminders : [];
  const totals = useMemo(() => computeTotals(dayTransactions), [dayTransactions]);
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  function addReminder() {
    router.push({ pathname: "/reminder/form", params: { date: selectedDate } });
  }

  function openReminder(reminder) {
    router.push({ pathname: "/reminder/form", params: { reminderId: reminder.id } });
  }

  return (
    <Screen topInset>
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
                isFirst={index === 0}
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

      <SectionHeader
        title="Reminders"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add reminder"
            onPress={addReminder}
            hitSlop={8}
            style={({ pressed }) => [styles.addButton, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Icon name="add" size={20} color={colors.primary} />
          </Pressable>
        }
      />

      {remindersLoading || remindersForDay.length > 0 ? (
        <Card style={{ marginBottom: spacing.md }}>
          {remindersLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            remindersForDay.map((reminder, index) => (
              <Pressable
                key={reminder.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit reminder ${reminder.notes || reminder.description || ""}`}
                onPress={() => openReminder(reminder)}
                style={({ pressed }) => [
                  styles.reminderRow,
                  index > 0 && { marginTop: spacing.sm, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Icon name="clock" size={18} color={colors.warning} />
                <View style={styles.reminderCopy}>
                  <Text variant="body" numberOfLines={1}>
                    {reminder.notes || reminder.description || "Reminder"}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {formatTime(reminder.remind_time)}
                    {reminder.amount != null
                      ? ` · ${formatCurrency(reminder.amount, { currency })}`
                      : ""}
                    {reminder.description && reminder.notes ? ` · ${reminder.description}` : ""}
                  </Text>
                </View>
                <ReminderStatusChip reminder={reminder} />
              </Pressable>
            ))
          )}
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing.md }}>
          <EmptyState
            icon="clock"
            title="No reminders"
            description="Nothing is scheduled for this date."
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add reminder"
              onPress={addReminder}
              style={({ pressed }) => [
                styles.addRow,
                { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Icon name="add" size={18} color={colors.primary} />
              <Text variant="label" tone="primary">
                Add reminder
              </Text>
            </Pressable>
          </EmptyState>
        </Card>
      )}
    </Screen>
  );
}

/**
 * A reminder's status comes from its own schedule and completion state —
 * never from the date the user happens to be viewing.
 */
function ReminderStatusChip({ reminder }) {
  const { colors } = useTheme();
  const status = deriveReminderStatus(reminder);
  const toneColor =
    status === "completed" ? colors.income : status === "overdue" ? colors.expense : colors.textFaint;
  return (
    <Text variant="caption" style={{ color: toneColor }}>
      {REMINDER_STATUS_LABELS[status]}
    </Text>
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
    paddingVertical: 2,
  },
  reminderCopy: {
    flex: 1,
    minWidth: 0,
  },
  loadingRow: {
    alignItems: "center",
    paddingVertical: 12,
  },
  addButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  addRow: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    columnGap: 6,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
